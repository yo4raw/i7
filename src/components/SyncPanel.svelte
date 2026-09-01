<script lang="ts">
  import { onMount } from 'svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import InlineAlert from './ui/InlineAlert.svelte';
  import ModalDialog from './ui/ModalDialog.svelte';
  import { STORAGE_KEYS, onSave } from '../lib/storage';
  import type { BaselineKind } from '../lib/sync/baseline';
  import { hasPendingLocalChanges } from '../lib/sync/adapters';
  import { createSupabasePort } from '../lib/sync/supabasePort';
  import { getSupabaseClient } from '../lib/sync/supabaseClient';
  import { runSync, type ConflictResolver, type Resolution } from '../lib/sync/syncEngine';
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

  // createClient は URL が壊れている（環境変数の誤設定）と同期的に throw する。
  // フッターの島全体をクラッシュさせず、同期を諦めるだけに留める
  let client: SupabaseClient | null = null;
  try {
    client = getSupabaseClient();
  } catch {
    client = null;
  }
  const port = client ? createSupabasePort(client) : null;

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let dialog: ModalDialog | undefined;
  let phase = $state<'anonymous' | 'authenticating' | 'idle' | 'syncing'>('anonymous');
  let error = $state<string | null>(null);
  let lastSyncedAt = $state<number | null>(null);
  let pendingChanges = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;

  const statusText = $derived.by(() => {
    if (phase === 'authenticating') return 'ログイン中…';
    if (phase === 'syncing') return '同期中…';
    if (phase === 'anonymous') return null;
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
        message: 'どちらの内容を残しますか。選ばなかった側は失われます。',
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
        pendingChanges = report.unresolved.length > 0;
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
      // デバウンス待ち中に走っていたら、完了後にもう一度評価する
      if (pendingChanges && error === null) scheduleSync();
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
    if (!client) return;
    phase = 'authenticating';
    error = null;
    const { error: authError } = await client.auth.signInWithOAuth({
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
  }

  async function deleteServerData() {
    if (!port) return;
    const ok = await dialog?.confirm({
      title: 'サーバのデータを削除しますか',
      message: 'この端末のデータは残ります。サーバに保存された同期データを削除し、ログアウトします。',
      confirmLabel: '削除してログアウト',
      danger: true,
    });
    if (!ok) return;
    try {
      await port.deleteAll();
      resetSyncState();
      // 削除後もログイン状態のままだと、次の同期でローカルのデータが
      // そのまま再アップロードされ「削除したのに戻ってくる」ことになる
      await signOut();
      error = null;
    } catch {
      error = '削除できませんでした';
    }
  }

  onMount(() => {
    if (!client) return;

    // 保存イベントだけに頼ると、オフラインで変更したあとリロードした場合に
    // 未同期であることが表示されないため、mount 時にベースラインとの差分を見る
    pendingChanges = hasPendingLocalChanges();

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      phase = session ? 'idle' : 'anonymous';
      if (session) void sync();
    });

    const unsubscribeSave = onSave((key) => {
      if (!SYNC_TARGET_KEYS.has(key)) return;
      pendingChanges = true;
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

    // beforeunload は発火が不安定なので visibilitychange を使う
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pendingChanges) flush();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('i7:backup-imported', onBackupImported);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timer);
      data.subscription.unsubscribe();
      unsubscribeSave();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('i7:backup-imported', onBackupImported);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

{#if client}
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
