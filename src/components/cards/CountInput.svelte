<script lang="ts">
  import { getCount, setCount, deltaCount } from '../../lib/stores/cardCounts.svelte';

  type Props = { cardId: number };
  let { cardId }: Props = $props();

  let value = $derived(getCount(cardId));
</script>

<div class="flex items-center justify-center gap-1" onclick={(e) => e.stopPropagation()} role="presentation">
  <button
    type="button"
    class="w-6 h-6 rounded bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-sm font-bold leading-none"
    onclick={(e) => { e.stopPropagation(); deltaCount(cardId, -1); }}
    aria-label="所持数を1減らす"
  >−</button>
  <input
    type="number"
    min="0"
    {value}
    class="w-10 h-6 text-center text-sm border border-gray-300 dark:border-slate-600 rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    onclick={(e) => e.stopPropagation()}
    onchange={(e) => {
      const v = Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0);
      setCount(cardId, v);
      (e.currentTarget as HTMLInputElement).value = String(v);
    }}
  />
  <button
    type="button"
    class="w-6 h-6 rounded bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-sm font-bold leading-none"
    onclick={(e) => { e.stopPropagation(); deltaCount(cardId, 1); }}
    aria-label="所持数を1増やす"
  >+</button>
</div>
