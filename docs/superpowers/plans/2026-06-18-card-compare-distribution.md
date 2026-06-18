# 衣装比較・詳細パネルにスコア分布を追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 衣装比較の詳細比較パネル（最大4枚）に、各衣装のスコア（縮小はカバー秒数）の二項分布を重ね合わせ密度曲線で描画し、ばらつきと「最大の◯%以上を出せる確率」を比較できるようにする。

**Architecture:** 1枚あたりの分布計算は UI 非依存の純粋モジュール `src/lib/score/cardDistribution.ts` に二項分布の解析計算として実装し Vitest で検証する。表示は新規 Svelte コンポーネント `src/components/compare/DistributionChart.svelte` が SVG で行い、既存の `CompareDetailPanel.svelte` に組み込む。スコアアップ衣装と縮小衣装は単位が違うためチャートを2分割する。

**Tech Stack:** TypeScript / Astro 6 / Svelte 5（runes: `$props`/`$state`/`$derived`/`$effect`）/ Tailwind CSS v4 / Vitest（単体）/ Playwright（E2E）

## Global Constraints

- 完全静的サイト。ロジックはクライアントサイド JS で実行。バックエンド依存を導入しない（CLAUDE.md「設計原則」）
- ライトテーマ固定。`dark:` バリアントを付けない。チャート配色は `src/styles/global.css` の `--chart-grid` / `--chart-axis-label` / `--chart-text` 変数を `var(...)` で参照（CLAUDE.md「Styling」）
- ユーザー可視テキストは「カード」ではなく **「衣装」**。内部識別子は `card` のまま（CLAUDE.md「用語ポリシー」）
- カードを指す ID は `Card.ID`。画像 URL は `cardThumbUrl(card.ID)`（`src/lib/ui.ts`）を使う
- 状態の永続化はしない（ページ方針・YAGNI）
- 日常検証は `npm run dev`（HMR, http://localhost:4321/）。build は使わない
- ローカル E2E は先に `npm run dev` を起動してから `npx playwright test`（`reuseExistingServer` でビルドを回避）
- イベント変数は `event`（短縮は `ev` まで）。ブローチは `broach` 綴り

---

### Task 1: 分布計算の純粋モジュール `cardDistribution.ts`

スキル発動成功回数 `K ~ Binomial(n, p)` の二項分布を解析的に計算し、PMF・しきい値裾確率・絶対値↔しきい値の変換を提供する純粋関数群。`CardStrengthEntry`（`src/lib/score/cardStrength.ts`）を入力に取る。

**Files:**
- Create: `src/lib/score/cardDistribution.ts`
- Test: `tests/unit/score/cardDistribution.test.ts`

**Interfaces:**
- Consumes: `CardStrengthEntry`（`src/lib/score/cardStrength.ts`）の `maxActivations: number` / `baseScore: number` / `skill: CardSkill | null`。`CardSkill`（`src/lib/score/types.ts`）の `per: number`（0〜100）/ `value: number` / `isShrink: boolean`
- Produces:
  - `binomialPmf(n: number, p: number): number[]` — `k=0..n` の確率配列（長さ `n+1`、総和 1）
  - `reachProbability(entry: CardStrengthEntry, t: number): number` — スキル上乗せ分の `t`（0〜1）以上を出す確率 = `P(K ≥ ceil(t·n))`
  - `cardScorePmf(entry: CardStrengthEntry): { metric: 'score' | 'cover'; points: { x: number; prob: number }[] }` — 各成功回数 `k` を絶対値（スコア or 秒数）にマップした分布点
  - `valueToThreshold(entry: CardStrengthEntry, x: number): number` — 絶対値 `x`（ドラッグ位置）→ 上乗せ分割合 `t`（0〜1 にクランプ）

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/cardDistribution.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { CardSkill } from '../../../src/lib/score/types';
import type { CardStrengthEntry } from '../../../src/lib/score/cardStrength';
import {
  binomialPmf,
  reachProbability,
  cardScorePmf,
  valueToThreshold,
} from '../../../src/lib/score/cardDistribution';

function skill(partial: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0,
    skillType: 'scoreUp',
    originalType: 'スコアアップ',
    count: 10,
    per: 50,
    value: 1000,
    rate: 0,
    isTimer: false,
    isShrink: false,
    spTime: 0,
    ...partial,
  };
}

function entry(partial: Partial<CardStrengthEntry>): CardStrengthEntry {
  return {
    card: { ID: '1' } as CardStrengthEntry['card'],
    attribute: 'Shout',
    appeal: { Shout: 0, Beat: 0, Melody: 0 },
    appealTotal: 0,
    baseScore: 100000,
    skillExpected: 0,
    skillMax: 0,
    totalScore: 100000,
    maxTotalScore: 100000,
    maxActivations: 0,
    maxCoverSec: 0,
    expectedCoverSec: 0,
    skill: null,
    broachScoreBonus: 0,
    ...partial,
  };
}

describe('binomialPmf', () => {
  it('総和が 1 になる', () => {
    const pmf = binomialPmf(10, 0.5);
    const sum = pmf.reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(pmf.length).toBe(11);
  });

  it('p=1 は k=n に全質量が集中する', () => {
    const pmf = binomialPmf(4, 1);
    expect(pmf[4]).toBeCloseTo(1, 10);
    expect(pmf[0]).toBeCloseTo(0, 10);
  });

  it('p=0 は k=0 に全質量が集中する', () => {
    const pmf = binomialPmf(4, 0);
    expect(pmf[0]).toBeCloseTo(1, 10);
    expect(pmf[4]).toBeCloseTo(0, 10);
  });

  it('既知値: Binomial(2,0.5) = [0.25, 0.5, 0.25]', () => {
    const pmf = binomialPmf(2, 0.5);
    expect(pmf[0]).toBeCloseTo(0.25, 10);
    expect(pmf[1]).toBeCloseTo(0.5, 10);
    expect(pmf[2]).toBeCloseTo(0.25, 10);
  });
});

describe('reachProbability', () => {
  it('t=0 は必ず 1（土台は確定）', () => {
    const e = entry({ maxActivations: 10, skill: skill({ per: 50 }) });
    expect(reachProbability(e, 0)).toBeCloseTo(1, 10);
  });

  it('右裾の直接和と一致する（n=4, p=0.5, t=0.75 → k>=3）', () => {
    const e = entry({ maxActivations: 4, skill: skill({ per: 50 }) });
    const pmf = binomialPmf(4, 0.5);
    const expected = pmf[3] + pmf[4]; // ceil(0.75*4)=3
    expect(reachProbability(e, 0.75)).toBeCloseTo(expected, 10);
  });

  it('t=1（理論最大）は p^n になる', () => {
    const e = entry({ maxActivations: 5, skill: skill({ per: 80 }) });
    expect(reachProbability(e, 1)).toBeCloseTo(Math.pow(0.8, 5), 10);
  });

  it('スキルなし衣装は t>0 で 0、t=0 で 1', () => {
    const e = entry({ skill: null, maxActivations: 0 });
    expect(reachProbability(e, 0)).toBe(1);
    expect(reachProbability(e, 0.5)).toBe(0);
  });
});

describe('cardScorePmf', () => {
  it('スコアアップ: x = baseScore + k*value、metric=score', () => {
    const e = entry({ baseScore: 100000, maxActivations: 3, skill: skill({ value: 1000, per: 50 }) });
    const r = cardScorePmf(e);
    expect(r.metric).toBe('score');
    expect(r.points.map((p) => p.x)).toEqual([100000, 101000, 102000, 103000]);
    expect(r.points.reduce((s, p) => s + p.prob, 0)).toBeCloseTo(1, 10);
  });

  it('縮小: x = k*value 秒、metric=cover、ベースは 0 秒', () => {
    const e = entry({
      baseScore: 100000,
      maxActivations: 2,
      skill: skill({ isShrink: true, skillType: 'shrink', value: 4, per: 40 }),
    });
    const r = cardScorePmf(e);
    expect(r.metric).toBe('cover');
    expect(r.points.map((p) => p.x)).toEqual([0, 4, 8]);
  });

  it('スキルなし衣装は baseScore の 1 点スパイク', () => {
    const e = entry({ baseScore: 123456, skill: null, maxActivations: 0 });
    const r = cardScorePmf(e);
    expect(r.points).toEqual([{ x: 123456, prob: 1 }]);
  });
});

describe('valueToThreshold', () => {
  it('スコアアップ: baseScore で 0、最大で 1', () => {
    const e = entry({ baseScore: 100000, maxActivations: 4, skill: skill({ value: 1000 }) });
    // span = 4*1000 = 4000, max = 104000
    expect(valueToThreshold(e, 100000)).toBeCloseTo(0, 10);
    expect(valueToThreshold(e, 104000)).toBeCloseTo(1, 10);
    expect(valueToThreshold(e, 102000)).toBeCloseTo(0.5, 10);
  });

  it('範囲外は 0〜1 にクランプ', () => {
    const e = entry({ baseScore: 100000, maxActivations: 4, skill: skill({ value: 1000 }) });
    expect(valueToThreshold(e, 90000)).toBe(0);
    expect(valueToThreshold(e, 999999)).toBe(1);
  });

  it('span=0（スキルなし）は 0', () => {
    const e = entry({ skill: null, maxActivations: 0 });
    expect(valueToThreshold(e, 100000)).toBe(0);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:unit -- cardDistribution`
Expected: FAIL（`cardDistribution` モジュールが存在しない／関数未定義）

- [ ] **Step 3: 最小実装を書く**

`src/lib/score/cardDistribution.ts`:

```ts
/**
 * 衣装比較・詳細パネル用: 1枚あたりのスコア分布計算（デッキ非依存の純粋関数）。
 *
 * スキル発動成功回数 K は二項分布 Binomial(n, p) に従う（n=最大発動回数, p=発動率）。
 * - スコアアップ系: 合計スコア = baseScore + K×value
 * - 判定縮小系: カバー秒数 = K×value（value=1発動あたり縮小秒数、ベースは 0 秒）
 * 設計: docs/superpowers/specs/2026-06-18-card-compare-distribution-design.md
 */
import type { CardStrengthEntry } from './cardStrength';

/** 二項分布 Binomial(n, p) の確率質量関数。k=0..n の配列（総和 1） */
export function binomialPmf(n: number, p: number): number[] {
  const out: number[] = [];
  let c = 1; // C(n, k) を逐次更新（C(n,0)=1）
  for (let k = 0; k <= n; k++) {
    if (k > 0) c = (c * (n - k + 1)) / k;
    out.push(c * Math.pow(p, k) * Math.pow(1 - p, n - k));
  }
  return out;
}

/** その衣装の発動回数 n と発動率 p を取り出す（スキルなしは n=0, p=0） */
function nP(entry: CardStrengthEntry): { n: number; p: number } {
  const n = entry.maxActivations;
  const p = entry.skill ? entry.skill.per / 100 : 0;
  return { n: n > 0 ? n : 0, p };
}

/** スキル上乗せ分の t（0〜1）以上を出す確率 = P(K ≥ ceil(t·n)) */
export function reachProbability(entry: CardStrengthEntry, t: number): number {
  const { n, p } = nP(entry);
  if (n <= 0) return t <= 0 ? 1 : 0;
  const kMin = Math.ceil(t * n);
  if (kMin <= 0) return 1;
  if (kMin > n) return 0;
  const pmf = binomialPmf(n, p);
  let s = 0;
  for (let k = kMin; k <= n; k++) s += pmf[k];
  return s;
}

/** 各成功回数 k を絶対値（スコア or 秒数）にマップした分布点 */
export function cardScorePmf(entry: CardStrengthEntry): {
  metric: 'score' | 'cover';
  points: { x: number; prob: number }[];
} {
  const { n, p } = nP(entry);
  const isShrink = entry.skill?.isShrink ?? false;
  const metric = isShrink ? 'cover' : 'score';
  if (n <= 0 || !entry.skill) {
    // 分散ゼロ: 土台のみの 1 点スパイク
    return { metric, points: [{ x: isShrink ? 0 : entry.baseScore, prob: 1 }] };
  }
  const base = isShrink ? 0 : entry.baseScore;
  const value = entry.skill.value;
  const pmf = binomialPmf(n, p);
  const points = pmf.map((prob, k) => ({ x: base + k * value, prob }));
  return { metric, points };
}

/** 絶対値 x（ドラッグ位置）→ スキル上乗せ分割合 t（0〜1 にクランプ） */
export function valueToThreshold(entry: CardStrengthEntry, x: number): number {
  const { n } = nP(entry);
  const value = entry.skill?.value ?? 0;
  const span = n * value;
  if (span <= 0) return 0;
  const base = entry.skill?.isShrink ? 0 : entry.baseScore;
  return Math.min(1, Math.max(0, (x - base) / span));
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test:unit -- cardDistribution`
Expected: PASS（全テスト green）

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/cardDistribution.ts tests/unit/score/cardDistribution.test.ts
git commit -m "feat: 衣装比較の分布計算モジュール cardDistribution を追加

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 分布チャートコンポーネントと詳細パネルへの組み込み

`DistributionChart.svelte` を新設し、Task 1 の計算を使って重ね合わせ密度曲線・衣装ごと独立ドラッグ可能なしきい値線・全線一括スライダーを SVG で描画する。`CompareDetailPanel.svelte` にスコア用・縮小用の2チャートとして組み込む。E2E で検証する。

**Files:**
- Create: `src/components/compare/DistributionChart.svelte`
- Modify: `src/components/compare/CompareDetailPanel.svelte`（`<script>` に分割ロジック追加 / テーブルの上にチャートを描画）
- Test: `tests/card-compare.test.ts`（末尾に分布チャートのテストを追加）

**Interfaces:**
- Consumes: Task 1 の `cardScorePmf` / `reachProbability` / `valueToThreshold`。`CardStrengthEntry`、`cardThumbUrl`（`src/lib/ui.ts`）、`formatScore`（`src/lib/score/cardStrength.ts`）
- Produces: `DistributionChart` コンポーネント。props `entries: CardStrengthEntry[]` / `metric: 'score' | 'cover'` / `formatX: (v: number) => string`。`data-testid="distribution-chart"` のルート要素と `aria-label="一括しきい値"` のスライダーを持つ

- [ ] **Step 1: 失敗する E2E テストを書く**

`tests/card-compare.test.ts` の末尾（最後の `});`=`test.describe` 閉じ括弧の直前）に追加:

```ts
  test('衣装を選ぶと詳細パネルに分布チャートと一括しきい値スライダーが出る', async ({ page }) => {
    const bar = page.getByTestId('scoreup-bar').first();
    await expect(bar).toBeVisible({ timeout: 20000 });
    await bar.click();
    await expect(page.getByTestId('compare-detail')).toBeVisible();
    await expect(page.getByTestId('distribution-chart').first()).toBeVisible();
    await expect(page.getByLabel('一括しきい値').first()).toBeVisible();
  });

  test('スコアアップ衣装と縮小衣装を両方選ぶと分布チャートが2つに分かれる', async ({ page }) => {
    const scoreBar = page.getByTestId('scoreup-bar').first();
    await expect(scoreBar).toBeVisible({ timeout: 20000 });
    await scoreBar.click();
    await page.getByRole('tab', { name: '判定縮小' }).click();
    const shrinkCol = page.getByTestId('shrink-col').first();
    await expect(shrinkCol).toBeVisible({ timeout: 20000 });
    await shrinkCol.click();
    await expect(page.getByTestId('distribution-chart')).toHaveCount(2);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

先に dev サーバーを起動（バックグラウンド）し ready を待つ:

```bash
npm run dev &
# ログに "ready in" が出るまで待つ（数秒）
```

Run: `npx playwright test tests/card-compare.test.ts -g "分布チャート"`
Expected: FAIL（`distribution-chart` 要素が存在しない）

- [ ] **Step 3: `DistributionChart.svelte` を実装**

`src/components/compare/DistributionChart.svelte`:

```svelte
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

  const W = 320, H = 150, PAD_L = 8, PAD_R = 8, PAD_T = 12, PAD_B = 24;
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
    return sx(s.base + thresholds[i] * s.span);
  }
  function reachPct(i: number): string {
    const p = reachProbability(series[i].entry, thresholds[i]) * 100;
    return p > 0 && p < 1 ? p.toFixed(1) : Math.round(p).toString();
  }
  function tPct(i: number): string {
    return Math.round(thresholds[i] * 100).toString();
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
  function moveDrag(ev: PointerEvent) {
    if (dragIndex == null) return;
    const value = pxToValue(clientXToSvg(ev.clientX));
    thresholds[dragIndex] = valueToThreshold(series[dragIndex].entry, value);
    thresholds = [...thresholds];
  }
  function endDrag() {
    dragIndex = null;
  }

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
    onpointermove={moveDrag} onpointerup={endDrag} onpointerleave={endDrag}
    role="presentation"
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
          fill={s.color} class="cursor-ew-resize"
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
```

- [ ] **Step 4: `CompareDetailPanel.svelte` に組み込む**

`<script>` 冒頭の import に追加（`src/components/compare/CompareDetailPanel.svelte:1-5` 付近）:

```svelte
  import DistributionChart from './DistributionChart.svelte';
```

`<script>` 末尾（`expCoverMax` の derived の直後、`src/components/compare/CompareDetailPanel.svelte:53` 付近）に追加:

```svelte
  // 分布チャートは単位ごとに分割（スコア＝点 / 縮小＝秒）
  const scoreChartEntries = $derived(entries.filter((e) => !e.skill?.isShrink));
  const coverChartEntries = $derived(entries.filter((e) => e.skill?.isShrink));
  const coverFormat = (v: number) => `${sec(v)}s`;
```

テーブルを囲む `<div class="overflow-x-auto ...">`（`src/components/compare/CompareDetailPanel.svelte:65` 付近）の **直前** にチャートを挿入:

```svelte
    {#if scoreChartEntries.length > 0}
      <DistributionChart entries={scoreChartEntries} metric="score" formatX={formatScore} />
    {/if}
    {#if coverChartEntries.length > 0}
      <DistributionChart entries={coverChartEntries} metric="cover" formatX={coverFormat} />
    {/if}
```

- [ ] **Step 5: E2E テストを実行して成功を確認**

dev サーバーが起動済みであることを確認（Step 2 で起動済み）。

Run: `npx playwright test tests/card-compare.test.ts -g "分布チャート"`
Expected: PASS（2テストとも green）

- [ ] **Step 6: dev サーバーで目視確認**

`http://localhost:4321/card-compare/` を開き、スコアアップ衣装を2〜3枚クリックして詳細パネルを表示。chrome-devtools / Playwright MCP でスクリーンショットを `tmp/` に保存し、以下を確認:
- 重ね合わせ密度曲線が衣装ごとに色分けされて描画される
- しきい値線（破線）をドラッグすると「上乗せ分◯%以上 ◯%」の表示が更新される
- 一括スライダーを動かすと全線が同じ % に揃う
- 判定縮小タブで衣装を追加選択するとチャートが2つに分かれる

問題があれば修正（SVG 座標・色・レイアウト等）。

- [ ] **Step 7: 全単体テスト・対象 E2E を流して回帰がないことを確認**

Run: `npm run test:unit`
Expected: PASS（既存含め全て green）

Run: `npx playwright test tests/card-compare.test.ts`
Expected: PASS（既存テスト含め全て green）

- [ ] **Step 8: リリースノートを更新してコミット**

`src/pages/releases/index.astro`（既存パターンに倣い最新版の項目を追記）に「衣装比較の詳細比較にスコア分布グラフを追加」を1行加える。

```bash
git add src/components/compare/DistributionChart.svelte src/components/compare/CompareDetailPanel.svelte tests/card-compare.test.ts src/pages/releases/index.astro
git commit -m "feat: 衣装比較の詳細パネルにスコア分布グラフを追加 (ADR 0024)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- 二項分布の解析計算 → Task 1 ✅
- `reachProbability` = P(K ≥ ceil(t·n)) → Task 1 ✅
- スコアアップ／縮小の絶対値マッピング・退化ケース → Task 1（`cardScorePmf`）✅
- 絶対値↔しきい値変換（ドラッグ用）→ Task 1（`valueToThreshold`）✅
- 重ね合わせ密度曲線・絶対スコア軸・シリーズ4色・凡例 → Task 2 ✅
- 衣装ごと独立ドラッグ可能なしきい値線 → Task 2（`startDrag`/`moveDrag`/`thresholds[i]`）✅
- 全線一括スライダー（既定80%）→ Task 2（`sliderVal`/`onSlider`、`$state(80)`）✅
- スコア／縮小の混在は2チャート分割 → Task 2（`scoreChartEntries`/`coverChartEntries`）✅
- ランキング現状維持・永続化なし → 変更なし ✅
- 単体テスト（Vitest）→ Task 1 ✅ / E2E（Playwright）→ Task 2 ✅

**Placeholder scan:** プレースホルダなし。全ステップに実コード／実コマンド／期待出力あり。

**Type consistency:** `binomialPmf` / `reachProbability` / `cardScorePmf` / `valueToThreshold` の名前と引数・戻り値が Task 1 の定義と Task 2 の利用で一致。`thresholds`（`number[]`）、`series`（`Series[]`）、props（`entries`/`metric`/`formatX`）一貫。`CardStrengthEntry` のフィールド（`maxActivations`/`baseScore`/`skill`/`card.ID`）は `cardStrength.ts` の定義と一致。`CardSkill.per`（0〜100）を `/100` で確率化、`isShrink`/`value` の用法一致。
