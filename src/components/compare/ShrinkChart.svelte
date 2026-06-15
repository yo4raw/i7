<script lang="ts">
  import { formatScore, type CardStrengthEntry, type ShrinkSortKey } from '../../lib/score/cardStrength';
  import { ATTR_HEX } from '../../lib/constants';
  import { cardThumbUrl } from '../../lib/ui';
  import { bonusBadgeHtml, type EventBonusTier } from '../../lib/data/eventBonusTiers';

  type Props = {
    entries: CardStrengthEntry[];
    selectedIds: number[];
    tierOf: (entry: CardStrengthEntry) => EventBonusTier;
    onToggle: (entry: CardStrengthEntry) => void;
    sortKey: ShrinkSortKey;
    songDuration: number;
  };
  let { entries, selectedIds, tierOf, onToggle, sortKey, songDuration }: Props = $props();

  const CHART_HEIGHT = 150;

  /** カバー率（0〜1+）。曲秒数が不明なら 0 */
  function maxRate(e: CardStrengthEntry): number {
    return songDuration > 0 ? e.maxCoverSec / songDuration : 0;
  }
  function expRate(e: CardStrengthEntry): number {
    return songDuration > 0 ? e.expectedCoverSec / songDuration : 0;
  }
  /** 0〜100% を CHART_HEIGHT へマップ（100% 超はクランプ） */
  function px(rate: number): number {
    return Math.round(Math.min(rate, 1) * CHART_HEIGHT);
  }
  function pct(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }
  function sec(v: number): string {
    return Number.isInteger(v) ? `${v}` : v.toFixed(1);
  }

  function condLabel(entry: CardStrengthEntry): string {
    const s = entry.skill;
    if (!s) return '-';
    return s.isTimer ? `${s.count}秒毎` : `${s.count}コンボ毎`;
  }
</script>

{#if entries.length === 0}
  <p class="text-sm text-gray-500 py-10 text-center">対象の衣装がありません</p>
{:else}
  <div class="overflow-x-auto">
    <div class="flex items-start gap-3 px-3 pt-5 pb-3 min-w-max">
      {#each entries as entry (entry.card.ID)}
        {@const selected = entry.card.ID != null && selectedIds.includes(entry.card.ID)}
        {@const mr = maxRate(entry)}
        {@const er = expRate(entry)}
        {@const overflow = mr > 1}
        <div class="flex flex-col items-center w-20 shrink-0" data-testid="shrink-col">
          <span class="text-[11px] font-bold text-gray-700">{pct(sortKey === 'max' ? mr : er)}</span>
          <span class="relative flex flex-col justify-end w-9" style={`height:${CHART_HEIGHT}px`}>
            {#if overflow}
              <span class="absolute -top-0.5 inset-x-0 text-center text-[9px] leading-none text-amber-600">▲</span>
            {/if}
            <!-- 上乗せ: 最大カバー率 − 期待カバー率（発動率による目減り分） -->
            <span
              class="block w-full bg-amber-200"
              style={`height:${px(mr) - px(er)}px`}
            ></span>
            <!-- 実体: 期待カバー率 -->
            <span class="block w-full bg-amber-400 rounded-t-sm" style={`height:${px(er)}px`}></span>
          </span>
          <button
            type="button"
            class="flex flex-col items-center cursor-pointer mt-1.5"
            title={entry.card.cardname}
            onclick={() => onToggle(entry)}
          >
            <img
              src={cardThumbUrl(entry.card.ID ?? '')}
              alt={entry.card.cardname || ''}
              loading="lazy"
              class="w-12 h-12 rounded border-[3px] object-cover"
              class:ring-2={selected}
              class:ring-indigo-500={selected}
              class:ring-offset-1={selected}
              style={`border-color:${ATTR_HEX[entry.attribute]}`}
            />
            <span class="text-[10px] text-gray-500 mt-0.5 leading-tight text-center">
              最大 {sec(entry.maxCoverSec)}s ({pct(mr)})<br />
              期待 {sec(entry.expectedCoverSec)}s ({pct(er)})<br />
              {condLabel(entry)} / {entry.skill?.per ?? 0}%<br />
              属性 {formatScore(entry.baseScore)}
            </span>
            {@html bonusBadgeHtml(tierOf(entry))}
          </button>
        </div>
      {/each}
    </div>
  </div>
  <div class="px-3 pb-3 text-[11px] text-gray-400">
    棒の高さ = カバー率（曲全体に対する縮小秒数の割合）。濃い部分 = 期待カバー率（発動確率込み）、薄い部分 = 最大との差（発動率による目減り）。▲ は 100% 超。並び順: {sortKey === 'max' ? '最大カバー秒数' : '期待カバー秒数'}の降順。属性 = 選択曲での属性値由来スコア（多色拮抗曲の参考値、順位には影響しません）
  </div>
{/if}
