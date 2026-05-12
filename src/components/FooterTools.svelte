<script lang="ts">
  import { onMount } from 'svelte';
  import { STORAGE_KEYS } from '../lib/storage';

  let fileInput: HTMLInputElement | undefined = $state();
  let isDark = $state(false);

  onMount(() => {
    isDark = document.documentElement.classList.contains('dark');
  });

  function toggleTheme() {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME_MODE, isDark ? 'dark' : 'light');
    } catch {
      // quota 等は無視
    }
  }

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
    class="hover:text-gray-600 dark:hover:text-slate-200 hover:underline underline-offset-2"
    onclick={exportData}
  >
    エクスポート
  </button>
  <button
    type="button"
    class="hover:text-gray-600 dark:hover:text-slate-200 hover:underline underline-offset-2"
    onclick={triggerImport}
  >
    インポート
  </button>
  <button
    type="button"
    class="hover:text-gray-600 dark:hover:text-slate-200 inline-flex items-center"
    onclick={toggleTheme}
    aria-label={isDark ? 'ライトモードに切替' : 'ダークモードに切替'}
    title={isDark ? 'ライトモードに切替' : 'ダークモードに切替'}
  >
    {#if isDark}
      <!-- 太陽 (現在 dark → click で light へ) -->
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    {:else}
      <!-- 月 (現在 light → click で dark へ) -->
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    {/if}
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    class="hidden"
    onchange={handleFileChange}
  />
</span>
