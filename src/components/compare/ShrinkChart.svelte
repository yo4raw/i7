<script lang="ts">
  import { shrinkTieKey, type CardStrengthEntry } from '../../lib/score/cardStrength';
  import { ATTR_HEX, CARD_THUMB_BASE_URL } from '../../lib/constants';
  import { bonusBadgeHtml, type EventBonusTier } from '../../lib/data/eventBonusTiers';

  type Props = {
    entries: CardStrengthEntry[];
    selectedIds: number[];
    tierOf: (entry: CardStrengthEntry) => EventBonusTier;
    onToggle: (entry: CardStrengthEntry) => void;
  };
  let { entries, selectedIds, tierOf, onToggle }: Props = $props();

  const CHART_HEIGHT = 150;

  interface ShrinkColumn {
    key: string;
    seconds: number;
    entries: CardStrengthEntry[];
  }

  /** ソート済み entries を同率（秒数・発動回数・確率が一致）ごとに1列へまとめる */
  const columns = $derived.by(() => {
    const cols: ShrinkColumn[] = [];
    for (const e of entries) {
      const key = shrinkTieKey(e);
      const last = cols[cols.length - 1];
      if (last && last.key === key) {
        last.entries.push(e);
      } else {
        cols.push({ key, seconds: e.skill?.value ?? 0, entries: [e] });
      }
    }
    return cols;
  });

  const maxSeconds = $derived(columns.length > 0 ? columns[0].seconds : 0);

  function px(seconds: number): number {
    return maxSeconds > 0 ? Math.round((seconds / maxSeconds) * CHART_HEIGHT) : 0;
  }

  function condLabel(entry: CardStrengthEntry): string {
    const s = entry.skill;
    if (!s) return '-';
    return s.isTimer ? `${s.count}秒毎` : `${s.count}コンボ毎`;
  }
</script>

{#if columns.length === 0}
  <p class="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">対象の衣装がありません</p>
{:else}
  <div class="overflow-x-auto">
    <div class="flex items-start gap-4 px-3 pt-5 pb-3 min-w-max">
      {#each columns as col (col.key)}
        <div class="flex flex-col items-center w-20 shrink-0" data-testid="shrink-col">
          <span class="text-[11px] font-bold text-gray-700 dark:text-slate-200">{col.seconds}秒</span>
          <span class="flex flex-col justify-end w-9" style={`height:${CHART_HEIGHT}px`}>
            <span class="block w-full bg-amber-400 dark:bg-amber-500 rounded-t-sm" style={`height:${px(col.seconds)}px`}></span>
          </span>
          <div class="flex flex-col gap-2 mt-1.5">
            {#each col.entries as entry (entry.card.ID)}
              {@const selected = entry.card.ID != null && selectedIds.includes(entry.card.ID)}
              <button
                type="button"
                class="flex flex-col items-center cursor-pointer"
                title={entry.card.cardname}
                onclick={() => onToggle(entry)}
              >
                <img
                  src={`${CARD_THUMB_BASE_URL}/${entry.card.cardID}.png`}
                  alt={entry.card.cardname || ''}
                  loading="lazy"
                  class="w-12 h-12 rounded border-[3px] object-cover"
                  class:ring-2={selected}
                  class:ring-indigo-500={selected}
                  class:ring-offset-1={selected}
                  style={`border-color:${ATTR_HEX[entry.attribute]}`}
                />
                <span class="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 leading-tight text-center">
                  {condLabel(entry)} / {entry.skill?.per ?? 0}%<br />
                  属性値 {entry.appealTotal.toLocaleString('ja-JP')}
                </span>
                {@html bonusBadgeHtml(tierOf(entry))}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
  <div class="px-3 pb-3 text-[11px] text-gray-400 dark:text-slate-500">
    棒の高さ = 1回あたりの効果秒数。秒数・発動回数・確率が同じ衣装は1列に縦積み。並び順: 効果秒数 → 最大発動回数 → 確率 → 属性値合計
  </div>
{/if}
