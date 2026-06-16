<script lang="ts">
  import { formatScore, type CardStrengthEntry } from '../../lib/score/cardStrength';
  import { skillTypeShortLabel } from '../../lib/score/skillFormatter';
  import { ATTR_HEX } from '../../lib/constants';
  import { cardThumbUrl } from '../../lib/ui';

  type Props = {
    entries: CardStrengthEntry[];
    onRemove: (entry: CardStrengthEntry) => void;
    onClear: () => void;
    songDuration: number;
  };
  let { entries, onRemove, onClear, songDuration }: Props = $props();

  function condLabel(entry: CardStrengthEntry): string {
    const s = entry.skill;
    if (!s) return '-';
    return s.isTimer ? `${s.count}秒毎` : `${s.count}コンボ毎`;
  }

  function sec(v: number): string {
    return Number.isInteger(v) ? `${v}` : v.toFixed(1);
  }

  /** カバー秒数 → 「Ns (P%)」表記。縮小以外は '-' */
  function coverLabel(entry: CardStrengthEntry, v: number): string {
    if (!entry.skill?.isShrink) return '-';
    const rate = songDuration > 0 ? `${Math.round((v / songDuration) * 100)}%` : '-';
    return `${sec(v)}s (${rate})`;
  }

  function effectLabel(entry: CardStrengthEntry): string {
    const s = entry.skill;
    if (!s) return '-';
    if (s.isShrink) return `${s.value}秒 ×${s.rate}`;
    return `+${s.value.toLocaleString('ja-JP')}`;
  }

  /** 行内の最大値（強調表示用）。values の最大と一致する index を返す */
  function maxIndexes(values: number[]): Set<number> {
    const max = Math.max(...values);
    return new Set(values.map((v, i) => (v === max && max > 0 ? i : -1)).filter((i) => i >= 0));
  }

  const totalMax = $derived(maxIndexes(entries.map((e) => e.totalScore)));
  const maxTotalMax = $derived(maxIndexes(entries.map((e) => e.maxTotalScore)));
  const baseMax = $derived(maxIndexes(entries.map((e) => e.baseScore)));
  const skillExpMax = $derived(maxIndexes(entries.map((e) => e.skillExpected)));
  const skillMaxMax = $derived(maxIndexes(entries.map((e) => e.skillMax)));
  const hasScoreUpSkill = $derived(entries.some((e) => e.skillMax > 0));
  const hasShrink = $derived(entries.some((e) => e.skill?.isShrink));
  const maxCoverMax = $derived(maxIndexes(entries.map((e) => e.maxCoverSec)));
  const expCoverMax = $derived(maxIndexes(entries.map((e) => e.expectedCoverSec)));
</script>

<div
  class="fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-indigo-300 shadow-[0_-4px_12px_rgba(0,0,0,0.12)]"
  data-testid="compare-detail"
>
  <div class="max-w-7xl mx-auto px-4 py-2">
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs font-bold text-indigo-700">詳細比較（{entries.length}/4枚）</span>
      <button type="button" class="text-xs text-gray-500 hover:text-red-600 cursor-pointer" onclick={onClear}>✕ クリア</button>
    </div>
    <div class="overflow-x-auto max-h-[45vh] overflow-y-auto">
      <table class="text-[11px] border-collapse w-full min-w-max">
        <thead>
          <tr>
            <th class="text-left text-gray-500 font-normal pr-2 py-1"></th>
            {#each entries as entry (entry.card.ID)}
              <th class="px-2 py-1 text-center font-medium">
                <div class="flex flex-col items-center gap-0.5">
                  <img
                    src={cardThumbUrl(entry.card.ID ?? '')}
                    alt={entry.card.cardname || ''}
                    loading="lazy"
                    class="w-10 h-10 rounded border-2 object-cover"
                    style={`border-color:${ATTR_HEX[entry.attribute]}`}
                  />
                  <span class="max-w-32 truncate">{entry.card.cardname}</span>
                  <button type="button" class="text-[10px] text-gray-400 hover:text-red-600 cursor-pointer" onclick={() => onRemove(entry)}>外す</button>
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr>
            <td class="text-gray-500 pr-2 py-1 whitespace-nowrap">Shout / Beat / Melody</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center whitespace-nowrap">
                {entry.appeal.Shout.toLocaleString('ja-JP')} / {entry.appeal.Beat.toLocaleString('ja-JP')} / {entry.appeal.Melody.toLocaleString('ja-JP')}
              </td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 pr-2 py-1">スキル</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center whitespace-nowrap">{skillTypeShortLabel(entry.skill?.originalType ?? entry.card.ap_skill_type)}</td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 pr-2 py-1 whitespace-nowrap">発動条件 / 確率 / 効果</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center whitespace-nowrap">{condLabel(entry)} / {entry.skill?.per ?? '-'}% / {effectLabel(entry)}</td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 pr-2 py-1">最大発動回数</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center">{entry.skill ? `${entry.maxActivations}回` : '-'}</td>
            {/each}
          </tr>
          {#if hasShrink}
            <tr>
              <td class="text-gray-500 pr-2 py-1 whitespace-nowrap">最大カバー秒数</td>
              {#each entries as entry, i (entry.card.ID)}
                <td class="px-2 py-1 text-center whitespace-nowrap" class:font-bold={maxCoverMax.has(i)} class:text-red-600={maxCoverMax.has(i)}>
                  {coverLabel(entry, entry.maxCoverSec)}
                </td>
              {/each}
            </tr>
            <tr>
              <td class="text-gray-500 pr-2 py-1 whitespace-nowrap">期待カバー秒数</td>
              {#each entries as entry, i (entry.card.ID)}
                <td class="px-2 py-1 text-center whitespace-nowrap" class:font-bold={expCoverMax.has(i)} class:text-red-600={expCoverMax.has(i)}>
                  {coverLabel(entry, entry.expectedCoverSec)}
                </td>
              {/each}
            </tr>
          {/if}
          <tr>
            <td class="text-gray-500 pr-2 py-1 whitespace-nowrap">属性値由来スコア</td>
            {#each entries as entry, i (entry.card.ID)}
              <td class="px-2 py-1 text-center" class:font-bold={baseMax.has(i)} class:text-red-600={baseMax.has(i)}>
                {formatScore(entry.baseScore)}
              </td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 pr-2 py-1">スキル期待値</td>
            {#each entries as entry, i (entry.card.ID)}
              <td class="px-2 py-1 text-center" class:font-bold={skillExpMax.has(i)} class:text-red-600={skillExpMax.has(i)}>
                {formatScore(entry.skillExpected)}
              </td>
            {/each}
          </tr>
          {#if hasScoreUpSkill}
            <tr>
              <td class="text-gray-500 pr-2 py-1 whitespace-nowrap">スキル最大値</td>
              {#each entries as entry, i (entry.card.ID)}
                <td class="px-2 py-1 text-center" class:font-bold={skillMaxMax.has(i)} class:text-red-600={skillMaxMax.has(i)}>
                  {formatScore(entry.skillMax)}
                </td>
              {/each}
            </tr>
          {/if}
          <tr>
            <td class="text-gray-500 pr-2 py-1 font-bold">合計（期待）</td>
            {#each entries as entry, i (entry.card.ID)}
              <td class="px-2 py-1 text-center font-bold" class:text-red-600={totalMax.has(i)}>
                {formatScore(entry.totalScore)}
              </td>
            {/each}
          </tr>
          {#if hasScoreUpSkill}
            <tr>
              <td class="text-gray-500 pr-2 py-1 font-bold whitespace-nowrap">合計（最大）</td>
              {#each entries as entry, i (entry.card.ID)}
                <td class="px-2 py-1 text-center font-bold" class:text-red-600={maxTotalMax.has(i)}>
                  {formatScore(entry.maxTotalScore)}
                </td>
              {/each}
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
