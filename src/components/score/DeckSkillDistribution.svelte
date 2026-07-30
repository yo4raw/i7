<script lang="ts">
  import type { Song } from '../../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../../lib/data/fetchFixedBroachsJson';
  import type { DeckState } from '../../lib/score/deckState';
  import {
    computeTeam,
    computeShrinkExclusion,
    computeGroupSizes,
    flattenNotes,
  } from '../../lib/score/engine';
  import { loadRabbitNotes } from '../../lib/data/rabbitNote';
  import { buildDeckSkillDistribution, type DeckSkillDistEntry } from '../../lib/score/deckSkillDistribution';

  let { deckState, selectedSong, allBroachs, scoreUpAssist, scoreUpBadgeRate }: {
    deckState: DeckState;
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
    scoreUpAssist: boolean;
    scoreUpBadgeRate: number;
  } = $props();

  const entries = $derived.by((): DeckSkillDistEntry[] => {
    const filled = deckState.cards.filter(c => c !== null).length;
    if (!selectedSong || filled === 0) return [];
    const team = computeTeam(
      deckState.cards, allBroachs, selectedSong, deckState.bonusTiers, deckState.trained,
      undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes(),
    );
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(selectedSong));
    const notes = flattenNotes(selectedSong, 42, exclusion);
    return buildDeckSkillDistribution(team, notes.length, {
      scoreUpAssist,
      scoreUpBadgeRate: Number(scoreUpBadgeRate) || 0,
    }, exclusion.totalExcluded);
  });

  type Panel = { metric: 'score' | 'cover'; curves: DeckSkillDistEntry[]; legendOnly: DeckSkillDistEntry[] };

  const panels = $derived.by((): Panel[] => {
    const sc = entries.filter(e => e.skillGroup === 'scoreUp');
    const sh = entries.filter(e => e.skillGroup === 'shrink');
    const nn = entries.filter(e => e.skillGroup === 'none');
    const out: Panel[] = [];
    if (sc.length > 0) out.push({ metric: 'score', curves: sc, legendOnly: [] });
    if (sh.length > 0) out.push({ metric: 'cover', curves: sh, legendOnly: [] });
    if (out.length > 0) {
      out[0].legendOnly = nn; // none は最初のパネル凡例にだけ載せる（曲線なし）
    } else if (nn.length > 0) {
      out.push({ metric: 'score', curves: [], legendOnly: nn });
    }
    return out;
  });

  const W = 360, H = 110, PAD_L = 8, PAD_R = 8, PAD_T = 8, PAD_B = 18;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  function formatX(metric: 'score' | 'cover', v: number): string {
    return metric === 'cover' ? `${v.toFixed(1)}秒` : Math.round(v).toLocaleString();
  }

  function domainMax(curves: DeckSkillDistEntry[]): number {
    let hi = 0;
    for (const e of curves) {
      const last = e.points.at(-1);
      if (last && last.x > hi) hi = last.x;
    }
    return hi > 0 ? hi : 1;
  }

  // ピーク正規化した密度ポリラインの points 属性文字列
  function polyline(e: DeckSkillDistEntry, hi: number): string {
    const peak = Math.max(...e.points.map(pt => pt.prob), 1e-9);
    return e.points
      .map(pt => {
        const px = PAD_L + (pt.x / hi) * innerW;
        const py = PAD_T + innerH - (pt.prob / peak) * innerH;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');
  }
</script>

{#if panels.length > 0}
  <section class="surface-card p-4 mb-4">
    <h2 class="text-sm font-bold text-gray-700 mb-1">スキル上乗せ分布</h2>
    <p class="text-[11px] text-gray-500 mb-3">
      現在の編成での各衣装のスキル発動による上乗せ分布（横軸は0起点の上乗せ{panels.some(p => p.metric === 'cover') ? 'スコア／カバー秒数' : 'スコア'}）。
    </p>
    <div class="flex flex-col gap-4">
      {#each panels as panel (panel.metric)}
        {@const hi = domainMax(panel.curves)}
        <div>
          {#if panel.curves.length > 0}
            <div class="text-[11px] text-gray-500 mb-1">
              {panel.metric === 'cover' ? 'カバー秒数' : '上乗せスコア'}
            </div>
            <svg viewBox="0 0 {W} {H}" class="w-full max-w-[420px]" role="img" aria-label="スキル上乗せ分布">
              <line x1={PAD_L} y1={PAD_T + innerH} x2={W - PAD_R} y2={PAD_T + innerH} stroke="var(--chart-axis-label)" stroke-width="0.5" />
              {#each panel.curves as e (e.slotIndex)}
                {#if e.points.length > 1}
                  <polyline points={polyline(e, hi)} fill="none" stroke={e.color} stroke-width="1.5" />
                {:else}
                  <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + innerH} stroke={e.color} stroke-width="1.5" />
                {/if}
              {/each}
              <text x={PAD_L} y={H - 4} font-size="9" fill="var(--chart-text)">0</text>
              <text x={W - PAD_R} y={H - 4} font-size="9" text-anchor="end" fill="var(--chart-text)">{formatX(panel.metric, hi)}</text>
            </svg>
          {/if}
          <ul class="mt-2 flex flex-col gap-1">
            {#each [...panel.curves, ...panel.legendOnly] as e (e.slotIndex)}
              <li class="flex items-center gap-2 text-[11px] text-gray-700">
                <span class="inline-block size-3 rounded-sm flex-shrink-0" style="background:{e.color}"></span>
                <img src={e.thumbUrl} alt="" width="20" height="20" class="rounded flex-shrink-0" loading="lazy" />
                <span class="truncate max-w-[10rem]">{e.cardName}</span>
                <span class="ml-auto tabular-nums text-gray-500">属性値 {e.effectiveAppeal.toLocaleString()}</span>
                <span class="tabular-nums text-gray-500">貢献 {(e.contribRatio * 100).toFixed(1)}%</span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </section>
{/if}
