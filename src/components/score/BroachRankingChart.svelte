<script lang="ts">
  import type { BroachRankingEntry } from '../../lib/score/songBroachRanking';
  import { ATTR_HEX } from '../../lib/constants';

  let { ranking }: { ranking: BroachRankingEntry[] } = $props();

  const maxScore = $derived(ranking.length > 0 ? ranking[0].score : 0);

  const BAR_BG: Record<string, string> = {
    Shout: 'bg-red-500',
    Beat: 'bg-green-500',
    Melody: 'bg-blue-500',
  };
  // 複数属性ブローチは属性 3 色のグラデーション（緑→青→赤）
  const ALL_BAR_STYLE = `background: linear-gradient(90deg, ${ATTR_HEX.Beat}, ${ATTR_HEX.Melody}, ${ATTR_HEX.Shout})`;
</script>

{#if ranking.length > 0}
  <ol class="space-y-2">
    {#each ranking as entry, i (entry.id)}
      <li class="flex items-center gap-2 text-sm">
        <span class="w-5 text-right tabular-nums text-gray-400 flex-shrink-0">{i + 1}</span>
        <span class="w-32 sm:w-40 truncate flex-shrink-0" title={entry.name}>{entry.name}</span>
        <div class="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
          <div
            class={`h-full rounded ${BAR_BG[entry.attribute] ?? ''}`}
            style={`width: ${maxScore > 0 ? (entry.score / maxScore) * 100 : 0}%; ${BAR_BG[entry.attribute] ? '' : ALL_BAR_STYLE}`}
          ></div>
        </div>
        <span class="w-16 text-right tabular-nums font-medium flex-shrink-0">{entry.score.toLocaleString()}</span>
      </li>
    {/each}
  </ol>
{/if}
