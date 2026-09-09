<script lang="ts">
  import InlineAlert from './ui/InlineAlert.svelte';
  import { SHARE_IMAGE_FORMATS, downloadDataUrl, loadShareImageFormat, renderShareImage, saveShareImageFormat, type ShareImageFormat } from '../lib/shareImage';

  interface Props {
    /** 拡張子なしのダウンロードファイル名 */
    filename: string;
    /** 画像化対象要素の id（単一パネル用） */
    targetId?: string;
    /** 複数枚に分けて保存するときの対象。suffix はファイル名末尾に付く連番 */
    panels?: { id: string; suffix: string }[];
  }

  let { filename, targetId = 'share-panel', panels }: Props = $props();

  const targets = $derived(panels ?? [{ id: targetId, suffix: '' }]);

  let busy = $state(false);
  let done = $state(0);
  let error = $state<string | null>(null);
  let format = $state<ShareImageFormat>('png');
  $effect(() => { format = loadShareImageFormat(); });

  function onFormatChange(e: Event) {
    format = (e.currentTarget as HTMLSelectElement).value as ShareImageFormat;
    saveShareImageFormat(format);
  }

  async function download() {
    if (busy) return;
    busy = true;
    done = 0;
    error = null;
    try {
      for (const target of targets) {
        const node = document.querySelector(`#${target.id}`);
        if (!node) continue;
        downloadDataUrl(await renderShareImage(node, format), `${filename}${target.suffix}`, format);
        done++;
        // 連続ダウンロードをブラウザが取りこぼさないよう間隔を空ける
        if (done < targets.length) await new Promise(resolve => { setTimeout(resolve, 400); });
      }
    } catch (e) {
      console.error(e);
      error = '画像の生成に失敗しました。時間をおいて再度お試しください。';
    } finally {
      busy = false;
    }
  }
</script>

<span class="inline-flex flex-col items-start gap-1">
<span class="inline-flex items-center gap-2">
<select
  aria-label="画像の保存形式"
  value={format}
  onchange={onFormatChange}
  disabled={busy}
  class="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 disabled:opacity-60"
>
  {#each SHARE_IMAGE_FORMATS as f (f.value)}
    <option value={f.value}>{f.label}</option>
  {/each}
</select>
<button
  type="button"
  onclick={download}
  disabled={busy}
  class="inline-flex items-center gap-1.5 rounded-md bg-chrome-ink px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-chrome-ink-soft disabled:opacity-60 disabled:cursor-not-allowed"
>
  {#if busy}
    <svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    生成中…{#if targets.length > 1}（{Math.min(done + 1, targets.length)}/{targets.length}）{/if}
  {:else}
    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
    画像をダウンロード{#if targets.length > 1}（{targets.length} 枚）{/if}
  {/if}
</button>
</span>
<InlineAlert message={error} />
</span>
