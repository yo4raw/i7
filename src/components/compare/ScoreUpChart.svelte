<script lang="ts">
  import { formatScore, type CardStrengthEntry, type ScoreUpSortKey } from '../../lib/score/cardStrength';
  import { ATTR_HEX } from '../../lib/constants';
  import { cardThumbUrl } from '../../lib/ui';
  import { skillTypeShortLabel } from '../../lib/score/skillFormatter';
  import { bonusBadgeHtml, type EventBonusTier } from '../../lib/data/eventBonusTiers';

  type Props = {
    entries: CardStrengthEntry[];
    selectedIds: number[];
    tierOf: (entry: CardStrengthEntry) => EventBonusTier;
    onToggle: (entry: CardStrengthEntry) => void;
    sortKey: ScoreUpSortKey;
  };
  let { entries, selectedIds, tierOf, onToggle, sortKey }: Props = $props();

  const CHART_HEIGHT = 220;
  // スケール基準は最大スコア合計の最大値（薄い上乗せ分でクリップしないように）
  const maxScale = $derived(entries.length > 0 ? Math.max(...entries.map((e) => e.maxTotalScore)) : 0);

  function px(v: number): number {
    return maxScale > 0 ? Math.round((v / maxScale) * CHART_HEIGHT) : 0;
  }
</script>

{#if entries.length === 0}
  <p class="text-sm text-gray-500 py-10 text-center">対象の衣装がありません</p>
{:else}
  <div class="overflow-x-auto">
    <!-- items-start でバー上端を揃える。バー下のサムネ/ラベル/バッジは可変高だが、
         バーより下にあるため下端揃え (items-end) のようにバー位置へ波及しない。 -->
    <div class="flex items-start gap-3 px-3 pt-5 pb-3 min-w-max">
      {#each entries as entry (entry.card.ID)}
        {@const selected = entry.card.ID != null && selectedIds.includes(entry.card.ID)}
        <button
          type="button"
          class="flex flex-col items-center w-16 shrink-0 cursor-pointer"
          data-testid="scoreup-bar"
          data-card-id={entry.card.ID ?? ''}
          title={entry.card.cardname}
          onclick={() => onToggle(entry)}
        >
          <span class="text-[10px] font-bold text-gray-700 leading-tight text-center">
            {formatScore(sortKey === 'max' ? entry.maxTotalScore : entry.totalScore)}
          </span>
          <span class="flex flex-col justify-end w-9" style={`height:${CHART_HEIGHT}px`}>
            <!-- 上乗せ: スキル最大値 − スキル期待値（発動率による目減り分） -->
            <span class="block w-full bg-amber-200 rounded-t-sm" style={`height:${px(entry.skillMax) - px(entry.skillExpected)}px`}></span>
            <!-- 実体: スキル期待値 -->
            <span class="block w-full bg-amber-400" style={`height:${px(entry.skillExpected)}px`}></span>
            <!-- 属性値由来スコア -->
            <span class="block w-full bg-chrome-ink-soft" style={`height:${px(entry.baseScore)}px`}></span>
          </span>
          <img
            src={cardThumbUrl(entry.card.ID ?? '')}
            alt={entry.card.cardname || ''}
            loading="lazy"
            class="size-12 mt-1.5 rounded border-[3px] object-cover"
            class:ring-2={selected}
            class:ring-chrome-ink={selected}
            class:ring-offset-1={selected}
            style={`border-color:${ATTR_HEX[entry.attribute]}`}
          />
          <span class="text-[10px] text-gray-500 mt-0.5 leading-tight text-center break-words w-full">
            期待 {formatScore(entry.totalScore)}<br />
            最大 {formatScore(entry.maxTotalScore)}<br />
            {skillTypeShortLabel(entry.skill?.originalType ?? entry.card.ap_skill_type)}
          </span>
          {@html bonusBadgeHtml(tierOf(entry))}
        </button>
      {/each}
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-4 px-3 pb-3 text-[11px] text-gray-600">
    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-chrome-ink-soft"></span>属性値由来スコア</span>
    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-amber-400"></span>スキル期待値</span>
    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-amber-200"></span>最大との差（発動率による目減り）</span>
    <span class="text-gray-400">サムネ枠色 = 属性 / タップで詳細比較（最大4枚）</span>
  </div>
{/if}
