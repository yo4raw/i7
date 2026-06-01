<script lang="ts">
  interface Props {
    /** 拡張子なしのダウンロードファイル名 */
    filename: string;
    /** 画像化対象要素の id */
    targetId?: string;
  }

  let { filename, targetId = 'share-panel' }: Props = $props();

  let busy = $state(false);

  async function download() {
    if (busy) return;
    const node = document.getElementById(targetId);
    if (!node) return;
    busy = true;
    try {
      const { domToPng } = await import('modern-screenshot');
      const bg = document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff';
      const dataUrl = await domToPng(node, { scale: 2, backgroundColor: bg });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert('画像の生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      busy = false;
    }
  }
</script>

<button
  type="button"
  onclick={download}
  disabled={busy}
  class="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-indigo-700 dark:hover:bg-indigo-600"
>
  {#if busy}
    <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    生成中…
  {:else}
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
    画像をダウンロード
  {/if}
</button>
