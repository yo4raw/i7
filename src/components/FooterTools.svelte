<script lang="ts">
  import { STORAGE_KEYS } from '../lib/storage';

  let fileInput: HTMLInputElement | undefined = $state();

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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      alert('JSON の読み込みに失敗しました');
      return;
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { schema?: unknown }).schema !== 'i7-backup' ||
      typeof (parsed as { data?: unknown }).data !== 'object' ||
      (parsed as { data: unknown }).data === null
    ) {
      alert('不正なバックアップファイルです');
      return;
    }

    if (!confirm('既存データを上書きします。続行しますか？')) return;

    const backup = parsed as Backup;
    const validKeys = new Set<string>(Object.values(STORAGE_KEYS));
    for (const [key, value] of Object.entries(backup.data)) {
      if (!validKeys.has(key)) continue;
      if (value === null) {
        localStorage.removeItem(key);
      } else if (typeof value === 'string') {
        localStorage.setItem(key, value);
      }
    }

    alert('インポートが完了しました。ページを再読み込みします。');
    location.reload();
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
</span>
