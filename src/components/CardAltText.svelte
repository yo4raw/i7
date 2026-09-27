<script lang="ts">
  let { altText }: { altText: string } = $props();
  let open = $state(false);
</script>

<button
  type="button"
  class="absolute bottom-2 left-2 px-2 py-1 text-xs font-bold text-white bg-black/60 rounded backdrop-blur-sm hover:bg-black/80 transition-colors"
  onclick={() => (open = !open)}
  aria-expanded={open}
  aria-label="alt テキストを表示"
>
  ALT
</button>
{#if open}
  <p class="absolute left-0 right-0 bottom-0 z-10 m-0 p-3 text-xs leading-relaxed text-white bg-black/75 rounded-b-lg backdrop-blur-sm whitespace-pre-wrap">
    {altText}
  </p>
{/if}
