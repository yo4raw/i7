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

  /** 属性値バー正規化用: 表示中エントリの最大 baseScore（0 のときは 0） */
  const maxBaseScore = $derived(entries.reduce((m, e) => Math.max(m, e.baseScore), 0));
  /** baseScore を maxBaseScore 基準で CHART_HEIGHT へマップ */
  function attrPx(e: CardStrengthEntry): number {
    return maxBaseScore > 0 ? Math.round((e.baseScore / maxBaseScore) * CHART_HEIGHT) : 0;
  }

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
          <span class="text-[11px] font-bold text-gray-700">
            {#if sortKey === 'attr'}{formatScore(entry.baseScore)}{:else}{pct(sortKey === 'max' ? mr : er)}{/if}
          </span>
          <span class="flex items-end justify-center gap-0.5" style={`height:${CHART_HEIGHT}px`}>
            <!-- 左: カバー率バー（2段積み） -->
            <span class="relative flex flex-col justify-end w-4">
              {#if overflow}
                <span class="absolute -top-0.5 inset-x-0 text-center text-[9px] leading-none text-amber-600">▲</span>
              {/if}
              <!-- 上乗せ: 最大カバー率 − 期待カバー率（発動率による目減り分） -->
              <span class="block w-full bg-amber-200" style={`height:${px(mr) - px(er)}px`}></span>
              <!-- 実体: 期待カバー率 -->
              <span class="block w-full bg-amber-400 rounded-t-sm" style={`height:${px(er)}px`}></span>
            </span>
            <!-- 右: 属性値由来スコアバー（表示中の最大を 100% とした相対高さ） -->
            <span class="relative flex flex-col justify-end w-4">
              <span class="block w-full bg-chrome-ink-soft rounded-t-sm" style={`height:${attrPx(entry)}px`} data-testid="shrink-attr-bar"></span>
            </span>
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
              class:ring-chrome-ink={selected}
              class:ring-offset-1={selected}
              style={`border-color:${ATTR_HEX[entry.attribute]}`}
            />
            <span class="text-[10px] text-gray-500 mt-0.5 leading-tight text-center">
              最大 {pct(mr)} ({sec(entry.maxCoverSec)}s)<br />
              期待 {pct(er)} ({sec(entry.expectedCoverSec)}s)<br />
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
    各列に2本の棒。左（オレンジ）= カバー率（曲全体に対する縮小秒数の割合。濃い = 期待カバー率／薄い = 最大との差。▲ は 100% 超）。右（紫）= 選択曲での属性値由来スコア（表示中の最大を 100% とした相対高さ、多色拮抗曲の参考値）。並び順: {sortKey === 'attr' ? '属性値由来スコア' : sortKey === 'max' ? '最大カバー率' : '期待カバー率'}の降順
  </div>
{/if}
