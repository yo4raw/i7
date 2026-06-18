<script lang="ts">
  import type { CardStrengthEntry } from '../../lib/score/cardStrength';
  import { cardScorePmf, reachProbability, valueToThreshold } from '../../lib/score/cardDistribution';
  import { cardThumbUrl } from '../../lib/ui';

  type Props = {
    entries: CardStrengthEntry[];
    metric: 'score' | 'cover';
    formatX: (v: number) => string;
  };
  let { entries, metric, formatX }: Props = $props();

  // 属性色と衝突しない固定シリーズ4色
  const SERIES_COLORS = ['#ea580c', '#0891b2', '#7c3aed', '#16a34a'];

  // 衣装ごとのしきい値割合 t（0〜1）。index 対応。既定 0.8
  let thresholds = $state<number[]>([]);
  $effect(() => {
    if (thresholds.length !== entries.length) {
      thresholds = entries.map((_, i) => thresholds[i] ?? 0.8);
    }
  });

  const W = 320, H = 80, PAD_L = 8, PAD_R = 8, PAD_T = 6, PAD_B = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  type Series = {
    entry: CardStrengthEntry;
    color: string;
    points: { x: number; prob: number }[];
    base: number;
    span: number;
    degenerate: boolean;
  };

  const series = $derived(
    entries.map((entry, i): Series => {
      const { points } = cardScorePmf(entry);
      const base = metric === 'cover' ? 0 : entry.baseScore;
      const span = entry.maxActivations * (entry.skill?.value ?? 0);
      return { entry, color: SERIES_COLORS[i % 4], points, base, span, degenerate: span <= 0 };
    }),
  );

  const domain = $derived.by(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) {
      for (const pt of s.points) {
        if (pt.x < lo) lo = pt.x;
        if (pt.x > hi) hi = pt.x;
      }
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) hi = lo + 1;
    return { lo, hi };
  });

  function sx(x: number): number {
    return PAD_L + ((x - domain.lo) / (domain.hi - domain.lo)) * innerW;
  }
  function pxToValue(px: number): number {
    return domain.lo + ((px - PAD_L) / innerW) * (domain.hi - domain.lo);
  }

  function areaPath(s: Series): string {
    const mx = Math.max(...s.points.map((p) => p.prob)) || 1;
    const pts = s.points.map((p) => `${sx(p.x).toFixed(1)},${(PAD_T + innerH - (p.prob / mx) * innerH).toFixed(1)}`);
    const first = sx(s.points[0].x).toFixed(1);
    const last = sx(s.points[s.points.length - 1].x).toFixed(1);
    return `${first},${PAD_T + innerH} ${pts.join(' ')} ${last},${PAD_T + innerH}`;
  }

  function thresholdX(i: number): number {
    const s = series[i];
    const t = thresholds[i] ?? 0.8;
    return sx(s.base + t * s.span);
  }
  function reachPct(i: number): string {
    const t = thresholds[i] ?? 0.8;
    const p = reachProbability(series[i].entry, t) * 100;
    return p > 0 && p < 1 ? p.toFixed(1) : Math.round(p).toString();
  }
  function tPct(i: number): string {
    return Math.round((thresholds[i] ?? 0.8) * 100).toString();
  }

  let svgEl: SVGSVGElement;
  let dragIndex = $state<number | null>(null);

  function clientXToSvg(clientX: number): number {
    const rect = svgEl.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }
  function startDrag(i: number, ev: PointerEvent) {
    dragIndex = i;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  }

  // ドラッグ中のみ window レベルでポインターイベントを受け取る
  $effect(() => {
    if (dragIndex == null) return;
    function moveDrag(ev: PointerEvent) {
      if (dragIndex == null) return;
      const value = pxToValue(clientXToSvg(ev.clientX));
      thresholds[dragIndex] = valueToThreshold(series[dragIndex].entry, value);
      thresholds = [...thresholds];
    }
    function endDrag() {
      dragIndex = null;
    }
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', moveDrag);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  });

  let sliderVal = $state(80);
  function onSlider() {
    thresholds = entries.map(() => sliderVal / 100);
  }
</script>

<div class="border-t border-gray-100 pt-2 mt-1" data-testid="distribution-chart">
  <div class="flex items-center gap-2 text-[11px] text-gray-600 mb-1">
    <span class="shrink-0">一括しきい値</span>
    <input
      type="range" min="0" max="100" bind:value={sliderVal} oninput={onSlider}
      class="flex-1 accent-indigo-600" aria-label="一括しきい値"
    />
    <span class="shrink-0 w-8 text-right">{sliderVal}%</span>
  </div>

  <svg
    bind:this={svgEl} viewBox={`0 0 ${W} ${H}`} class="w-full max-w-[520px] touch-none select-none"
    role="presentation" style="pointer-events: none"
  >
    {#each series as s, i (s.entry.card.ID)}
      <polygon points={areaPath(s)} fill={s.color} opacity="0.35" />
      <polyline
        points={areaPath(s).split(' ').slice(1, -1).join(' ')}
        fill="none" stroke={s.color} stroke-width="2"
      />
    {/each}
    {#each series as s, i (s.entry.card.ID)}
      {#if !s.degenerate}
        <line
          x1={thresholdX(i)} y1={PAD_T} x2={thresholdX(i)} y2={PAD_T + innerH}
          stroke={s.color} stroke-width="1.5" stroke-dasharray="4 3"
        />
        <rect
          x={thresholdX(i) - 5} y={PAD_T - 8} width="10" height="10" rx="2"
          fill={s.color} class="cursor-ew-resize" style="pointer-events: all"
          onpointerdown={(ev) => startDrag(i, ev)}
        />
      {/if}
    {/each}
    <text x={PAD_L} y={H - 6} fill="var(--chart-axis-label)" font-size="9">{formatX(domain.lo)}</text>
    <text x={W - PAD_R} y={H - 6} text-anchor="end" fill="var(--chart-axis-label)" font-size="9">{formatX(domain.hi)}</text>
  </svg>

  <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px]">
    {#each series as s, i (s.entry.card.ID)}
      <span class="flex items-center gap-1" style={`color:${s.color}`}>
        <img src={cardThumbUrl(s.entry.card.ID ?? '')} alt="" loading="lazy" class="w-5 h-5 rounded object-cover" />
        {#if s.degenerate}
          <span>ばらつきなし</span>
        {:else}
          <span>上乗せ分{tPct(i)}%以上 <b>{reachPct(i)}%</b></span>
        {/if}
      </span>
    {/each}
  </div>
</div>
