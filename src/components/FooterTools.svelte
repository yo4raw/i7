<script lang="ts">
  import { STORAGE_KEYS, BACKUP_EXCLUDED_KEYS } from '../lib/storage';
  import ModalDialog from './ui/ModalDialog.svelte';
  import InlineAlert from './ui/InlineAlert.svelte';

  let fileInput: HTMLInputElement | undefined = $state();
  let feedback = $state<{ message: string; tone: 'error' | 'success' } | null>(null);

  // oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
  let dialog: ModalDialog | undefined;

  type Backup = {
    schema: 'i7-backup';
    version: 1;
    exportedAt: string;
    data: Record<string, string | null>;
  };

  function pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  function timestampForFilename(d: Date): string {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function exportData() {
    const data: Record<string, string | null> = {};
    for (const key of Object.values(STORAGE_KEYS)) {
      if (BACKUP_EXCLUDED_KEYS.has(key)) continue;
      data[key] = localStorage.getItem(key);
    }
    const backup: Backup = {
      schema: 'i7-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `i7-backup-${timestampForFilename(new Date())}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    fileInput?.click();
  }

  async function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    feedback = null;

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      feedback = { message: 'JSON の読み込みに失敗しました', tone: 'error' };
      return;
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { schema?: unknown }).schema !== 'i7-backup' ||
      typeof (parsed as { data?: unknown }).data !== 'object' ||
      (parsed as { data: unknown }).data === null
    ) {
      feedback = { message: '不正なバックアップファイルです', tone: 'error' };
      return;
    }

    const ok = await dialog?.confirm({
      title: '既存データを上書きします',
      message: '所持衣装・保存デッキなど現在のデータはバックアップの内容で置き換わります。この操作は取り消せません。',
      confirmLabel: 'インポートする',
      danger: true,
    });
    if (!ok) return;

    const backup = parsed as Backup;
    const validKeys = new Set<string>(
      Object.values(STORAGE_KEYS).filter((key) => !BACKUP_EXCLUDED_KEYS.has(key)),
    );
    for (const [key, value] of Object.entries(backup.data)) {
      if (!validKeys.has(key)) continue;
      if (value === null) {
        localStorage.removeItem(key);
      } else if (typeof value === 'string') {
        localStorage.setItem(key, value);
      }
    }

    // 同期層へ「ローカルが外部から書き換わった」ことを伝える。
    // ベースラインが実態と合わなくなるため、SyncPanel 側で同期状態をリセットさせる。
    // ここで sync 層を import しないのは、既存コンポーネントが同期層に依存しないため
    // （同期層を削除しても FooterTools が壊れない）。
    window.dispatchEvent(new CustomEvent('i7:backup-imported'));

    feedback = { message: 'インポートが完了しました。ページを再読み込みします。', tone: 'success' };
    // 完了表示を一瞬見せてから再読み込みする (即 reload すると何が起きたか伝わらない)
    setTimeout(() => location.reload(), 800);
  }
</script>

<span class="flex items-center gap-3">
  <button
    type="button"
    class="hover:text-gray-600 hover:underline underline-offset-2"
    onclick={exportData}
  >
    エクスポート
  </button>
  <button
    type="button"
    class="hover:text-gray-600 hover:underline underline-offset-2"
    onclick={triggerImport}
  >
    インポート
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    class="hidden"
    onchange={handleFileChange}
  />
  <!-- 結果はインポートボタンの隣に出す (どの操作の結果かが分かるように) -->
  <InlineAlert message={feedback?.message ?? null} tone={feedback?.tone ?? 'error'} />
</span>

<ModalDialog bind:this={dialog} />
