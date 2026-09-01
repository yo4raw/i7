<script lang="ts">
  import { onMount } from 'svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import InlineAlert from './ui/InlineAlert.svelte';
  import ModalDialog from './ui/ModalDialog.svelte';
  import { STORAGE_KEYS, onSave } from '../lib/storage';
  import type { BaselineKind } from '../lib/sync/baseline';
  import { hasPendingLocalChanges } from '../lib/sync/adapters';
  import { readSyncEnv } from '../lib/sync/env';
  import { createSupabasePort } from '../lib/sync/supabasePort';
  import { getSupabaseClient } from '../lib/sync/supabaseClient';
  import { runSync, type ConflictResolver, type Resolution } from '../lib/sync/syncEngine';
  import type { SyncPort } from '../lib/sync/port';
  import { loadSyncMeta, resetSyncState } from '../lib/sync/syncMeta';

  /** この 4 キーの変更だけが同期のトリガーになる */
  const SYNC_TARGET_KEYS = new Set<string>([
    STORAGE_KEYS.CARD_COUNTS,
    STORAGE_KEYS.SHARED_BROACH_COUNTS,
    STORAGE_KEYS.RABBIT_NOTES,
    STORAGE_KEYS.SAVED_DECKS,
  ]);

  /** ユーザー可視テキストは「衣装」「共通ブローチ」を使う (用語ポリシー) */
  const KIND_LABELS: Record<BaselineKind, string> = {
    card_counts: '所持衣装数',
    shared_broach_counts: '共通ブローチの所持数',
    rabbit_notes: 'ラビットノート',
    decks: '保存デッキ',
  };

  /** 所持数の連続増減で毎回リクエストが飛ぶのを防ぐ */
  const DEBOUNCE_MS = 3000;

  /**
   * env が無ければテンプレートごと何も描画しない（不変条件）。
   *
   * `getSupabaseClient()` を呼ばずにここだけで判定すること。呼ぶと
   * `@supabase/supabase-js`（gzip 約 148KB）の動的 import が静的解析上「常に到達しうる」
   * 経路になり、未ログインの大多数の訪問者に配る対象から外せなくなる。
   */
  const envConfigured = readSyncEnv(import.meta.env as unknown as Record<string, string | undefined>) !== null;

  /**
   * Supabase のセッションが既にこの端末に保存されているか。
   *
   * セッションが無く、利用者もまだログインを押していない間は supabase-js を読み込まない
   * （ログインボタンの描画だけならクライアントが要らない）。
   */
  function hasStoredSession(): boolean {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key !== null && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
      }
    } catch {
      // プライベートモード等
    }
    return false;
  }

  let client: SupabaseClient | null = null;
  let port: SyncPort | null = null;

  /** supabase-js を初めて必要になった時点で読み込む。以降は getSupabaseClient のキャッシュを再利用する */
  async function ensureClient(): Promise<SupabaseClient | null> {
    if (client) return client;
    // createClient は URL が壊れている（環境変数の誤設定）と throw しうる。
    // フッターの島全体をクラッシュさせず、同期を諦めるだけに留める
    try {
      client = await getSupabaseClient();
    } catch {
      client = null;
    }
    if (client) port = createSupabasePort(client);
    return client;
  }

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let dialog: ModalDialog | undefined;
  let phase = $state<'anonymous' | 'authenticating' | 'idle' | 'syncing'>('anonymous');
  let error = $state<string | null>(null);
  let lastSyncedAt = $state<number | null>(null);
  let pendingChanges = $state(false);
  /** 利用者が「あとで」を選んだ競合が残っているか。立っている間は自動再同期しない */
  let unresolved = $state(false);
  /** push が一部でも失敗しているか。立っている間は「同期済み」と言ってはならない */
  let failed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;

  const statusText = $derived.by(() => {
    if (phase === 'authenticating') return 'ログイン中…';
    if (phase === 'syncing') return '同期中…';
    if (phase === 'anonymous') return null;
    if (failed) return '一部を同期できませんでした';
    if (unresolved) return '未解決の競合があります';
    if (pendingChanges) return '未同期の変更あり';
    if (lastSyncedAt === null) return '同期待ち';
    return `同期済み · ${relativeTime(lastSyncedAt)}`;
  });

  function relativeTime(at: number): string {
    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes} 分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 時間前`;
    return `${Math.floor(hours / 24)} 日前`;
  }

  const resolveConflicts: ConflictResolver = async (kinds) => {
    const out = new Map<BaselineKind, Resolution>();
    for (const kind of kinds) {
      const answer = await dialog?.choose({
        title: `${KIND_LABELS[kind]}が両方の端末で変更されています`,
        message: '重複している項目だけ、どちらを優先するか選んでください。片方にしかない項目は両方とも残ります。',
        primaryLabel: 'この端末の内容を使う',
        secondaryLabel: '別の端末の内容を使う',
      });
      if (answer === 'primary') out.set(kind, 'local');
      else if (answer === 'secondary') out.set(kind, 'server');
      // null は「あとで」。この種別は今回触らず、次回の同期で再度聞かれる
    }
    return out;
  };

  async function sync() {
    if (!port || inFlight || phase === 'anonymous') return;
    inFlight = true;
    phase = 'syncing';
    error = null;
    try {
      const report = await runSync(port, resolveConflicts);
      // status は 'ok' 以外でも adopted は 0 より大きくなりうる（baseline-write-failed は
      // ベースラインの確定に失敗する「前」に adopted をカウント済み）。ローカルは実際に
      // 変わっているので、status に関わらず adopted > 0 なら他画面へ知らせる
      if (report.adopted > 0) {
        window.dispatchEvent(new CustomEvent('i7:sync-applied'));
      }
      if (report.status === 'ok') {
        lastSyncedAt = loadSyncMeta().lastSyncedAt;
        unresolved = report.unresolved.length > 0;
        // 送れなかった行があるなら「同期済み」と言ってはならない。
        // 再スケジュールの対象にもする（未解決の競合とは別の理由で残っている）
        failed = report.failed > 0;
        pendingChanges = unresolved || failed;
      } else if (report.status === 'unauthenticated') {
        phase = 'anonymous';
      } else if (report.status === 'baseline-write-failed') {
        error = 'この端末の保存領域が不足しているため同期を停止しました';
      } else {
        error = '同期できませんでした';
      }
    } catch {
      error = '同期できませんでした';
    } finally {
      inFlight = false;
      if (phase === 'syncing') phase = 'idle';
      // デバウンス待ち中に走っていたら、完了後にもう一度評価する。
      // ただし未解決の競合があるときは再スケジュールしない。競合が未解決だと
      // pendingChanges が立ったままなので、そのまま再同期すると同じ確認ダイアログが
      // 3 秒ごとに出続け、「あとで」という安全な逃げ道が逃げ道でなくなる。
      // 再度聞くのは、利用者が何か保存したときか「今すぐ同期」を押したときだけ
      if (pendingChanges && error === null && !unresolved) scheduleSync();
    }
  }

  function scheduleSync() {
    clearTimeout(timer);
    timer = setTimeout(() => void sync(), DEBOUNCE_MS);
  }

  function flush() {
    clearTimeout(timer);
    void sync();
  }

  async function signIn() {
    phase = 'authenticating';
    error = null;
    const c = await ensureClient();
    if (!c) {
      phase = 'anonymous';
      error = 'ログインを開始できませんでした';
      return;
    }
    const { error: authError } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (authError) {
      phase = 'anonymous';
      error = 'ログインを開始できませんでした';
    }
  }

  async function signOut() {
    if (!client) return;
    clearTimeout(timer);
    await client.auth.signOut();
    phase = 'anonymous';
    lastSyncedAt = null;
    pendingChanges = false;
    unresolved = false;
    failed = false;
    // 直前の失敗表示を残したままログイン導線に戻さない
    error = null;
  }

  async function deleteServerData() {
    if (!port) return;
    // deleteAll() と signOut() の間でデバウンスが発火すると、削除したデータを
    // 初回リンクとして再アップロードしうるため、確認ダイアログを出す前に止めておく
    clearTimeout(timer);
    const ok = await dialog?.confirm({
      title: 'サーバのデータを削除しますか',
      message: 'この端末のデータは残ります。サーバに保存された同期データを削除し、ログアウトします。',
      confirmLabel: '削除してログアウト',
      danger: true,
    });
    if (!ok) return;
    // signOut を try の外に出す。中に入れると、削除は成功したのに signOut が失敗した場合に
    // 「削除できませんでした」と誤った報告をしてしまう
    try {
      await port.deleteAll();
    } catch {
      error = '削除できませんでした';
      return;
    }
    resetSyncState();
    // 削除後もログイン状態のままだと、次の同期でローカルのデータが
    // そのまま再アップロードされ「削除したのに戻ってくる」ことになる
    await signOut();
  }

  onMount(() => {
    if (!envConfigured) return;

    // 保存イベントだけに頼ると、オフラインで変更したあとリロードした場合に
    // 未同期であることが表示されないため、mount 時にベースラインとの差分を見る
    pendingChanges = hasPendingLocalChanges();

    let unsubscribeAuth: (() => void) | undefined;

    async function attachClient(): Promise<void> {
      const c = await ensureClient();
      if (!c) return;
      const { data } = c.auth.onAuthStateChange((_event, session) => {
        phase = session ? 'idle' : 'anonymous';
        if (session) void sync();
      });
      unsubscribeAuth = () => data.subscription.unsubscribe();
    }

    // ログイン済みの端末（セッションが localStorage にある）と OAuth から戻った直後
    // （detectSessionInUrl が処理すべき ?code= がある）だけ、ここで supabase-js を読み込む。
    // 未ログインの大多数の訪問者にはログインボタンだけ出し、クリックまで読み込まない
    if (hasStoredSession() || window.location.search.includes('code=')) {
      void attachClient();
    }

    const unsubscribeSave = onSave((key) => {
      if (!SYNC_TARGET_KEYS.has(key)) return;
      pendingChanges = true;
      // 利用者が何か保存したなら、競合をもう一度聞いてよいし、
      // 前回の失敗表示も引きずらない
      unresolved = false;
      failed = false;
      if (phase !== 'anonymous') scheduleSync();
    });

    // 別タブでの変更。同一タブでは storage イベントが飛ばないので onSave と役割が分かれる
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && SYNC_TARGET_KEYS.has(event.key)) {
        pendingChanges = true;
        if (phase !== 'anonymous') scheduleSync();
      }
    };

    // バックアップ復元でローカルが外部から書き換わった。ベースラインが実態と合わないため捨てる。
    // flush() は呼ばない: FooterTools はこのイベントの 800ms 後に reload するため、
    // 即時同期を始めると初回リンクの確認ダイアログが reload で破棄されうる
    const onBackupImported = () => {
      resetSyncState();
      lastSyncedAt = null;
      pendingChanges = true;
    };

    // beforeunload は発火が不安定なので visibilitychange を使う。
    // 未解決の競合が残っている間は意図的に再スケジュールしていないので、
    // タブを離れるたびに競合ダイアログを開かせない
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pendingChanges && !unresolved) flush();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('i7:backup-imported', onBackupImported);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timer);
      unsubscribeAuth?.();
      unsubscribeSave();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('i7:backup-imported', onBackupImported);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

{#if envConfigured}
  <span class="flex items-center gap-3" data-testid="sync-panel">
    {#if phase === 'anonymous'}
      <button
        type="button"
        class="hover:text-gray-600 hover:underline underline-offset-2"
        onclick={signIn}
      >
        ログイン（端末間で同期）
      </button>
    {:else}
      <span aria-live="polite" data-testid="sync-status">{statusText}</span>
      {#if pendingChanges && phase === 'idle'}
        <button type="button" class="hover:text-gray-600 hover:underline underline-offset-2" onclick={flush}>
          今すぐ同期
        </button>
      {/if}
      <button type="button" class="hover:text-gray-600 hover:underline underline-offset-2" onclick={signOut}>
        ログアウト
      </button>
      <button type="button" class="hover:text-gray-600 hover:underline underline-offset-2" onclick={deleteServerData}>
        サーバのデータを削除
      </button>
    {/if}
    <InlineAlert message={error} tone="error" />
  </span>

  <ModalDialog bind:this={dialog} />
{/if}
