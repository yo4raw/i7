<script lang="ts">
  import { getCount, setCount, deltaCount } from '../../lib/stores/cardCounts.svelte';
  import { getLevels, setLevel } from '../../lib/stores/cardSkillLevels.svelte';
  import type { SkillLevel } from '../../lib/score/deckState';

  type Props = { cardId: number };
  let { cardId }: Props = $props();

  let value = $derived(getCount(cardId));
  let levels = $derived(getLevels(cardId, value));
  const LEVEL_OPTIONS: SkillLevel[] = [1, 2, 3, 4, 5];

  function onLevelChange(e: Event, index: number) {
    const lv = Number((e.currentTarget as HTMLSelectElement).value);
    setLevel(cardId, index, lv as SkillLevel);
  }
</script>

<div class="flex flex-col items-center gap-1" onclick={(e) => e.stopPropagation()} role="presentation">
  <div class="flex items-center justify-center gap-1">
    <button
      type="button"
      class="size-6 rounded bg-gray-200 hover:bg-gray-300 text-sm font-bold leading-none"
      data-count-btn={cardId}
      data-delta="-1"
      onclick={(e) => { e.stopPropagation(); deltaCount(cardId, -1); }}
      aria-label="所持数を1減らす"
    >−</button>
    <input
      type="number"
      min="0"
      {value}
      data-count-input={cardId}
      class="w-10 h-6 text-center text-sm border border-gray-300 rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      onclick={(e) => e.stopPropagation()}
      onchange={(e) => {
        const v = Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0);
        setCount(cardId, v);
        (e.currentTarget as HTMLInputElement).value = String(v);
      }}
    />
    <button
      type="button"
      class="size-6 rounded bg-gray-200 hover:bg-gray-300 text-sm font-bold leading-none"
      data-count-btn={cardId}
      data-delta="1"
      onclick={(e) => { e.stopPropagation(); deltaCount(cardId, 1); }}
      aria-label="所持数を1増やす"
    >+</button>
  </div>
  {#if value > 0}
    <div class="flex flex-wrap items-center justify-center gap-1">
      {#each levels as lv, i (i)}
        <label class="flex items-center gap-0.5 text-[10px] text-gray-600">
          <span>Lv</span>
          <select
            class="h-5 text-[10px] border border-gray-300 rounded px-0.5 focus:outline-none focus:ring-1 focus:ring-chrome-ink"
            data-skill-level-input={cardId}
            data-copy-index={i}
            aria-label={`スキルレベル（${i + 1}枚目）`}
            value={lv}
            onclick={(e) => e.stopPropagation()}
            onchange={(e) => onLevelChange(e, i)}
          >
            {#each LEVEL_OPTIONS as opt (opt)}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </label>
      {/each}
    </div>
  {/if}
</div>
