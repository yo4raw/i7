# 仕様解説ページ §4 改善（期待カバー率明示・縮小 vs スコアアップ戦略比較）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仕様解説ページ §4 に「期待カバー率」の段階を明示して数値の飛躍を解消し、§4-5 として縮小 vs スコアアップの戦略比較（1枚あたり寄与・属性値スケーリング）を追加する。

**Architecture:** エンジン側は `calcMaxBaseTotal` を内訳返却版 `calcMaxScoreBreakdown` に拡張（互換維持）。`specDemo.ts` がビルド時に `shrinkMaxBonus` / `scalingPoints` を追加生成し、`specDiagrams.ts` の図関数（1 拡張 + 2 新設）へ渡して `spec.astro` が描画する。数値直書き禁止（ADR 0043）を維持。

**Tech Stack:** Astro 7（静的生成）/ TypeScript / インライン SVG 文字列生成 / Vitest（カバレッジ 95% ゲート）/ Playwright E2E

## Global Constraints

- 数値はすべてビルド時に実エンジン関数から生成する（ページへの数値直書き禁止、ADR 0043）
- 按分ロジックの二重実装禁止: 全発動時縮小上乗せはエンジンから取得（ADR 0044）
- ユーザー可視テキストは「カード」ではなく「衣装」、内部識別子は `card`
- `dark:` バリアント禁止（ライトテーマ固定、ADR 0020）
- vitest カバレッジ 95% ゲート（statements/branches/functions/lines）を下回らないこと
- 段階別配色: スコアアップ=amber (`STAGE_COLORS.scoreUp`) / 縮小=orange (`STAGE_COLORS.shrink`)
- 参照設計書: `docs/superpowers/specs/2026-07-07-spec-shrink-strategy-visual-design.md`

---

### Task 1: `calcMaxScoreBreakdown` — 理論最大スコアの内訳返却（simulation.ts）

**Files:**
- Modify: `src/lib/score/simulation.ts:257-308`（`calcMaxBaseTotal`）
- Test: `tests/unit/score/maxScoreBreakdown.test.ts`（新規）

**Interfaces:**
- Produces: `export interface MaxScoreBreakdown { baseScore: number; scoreUpMax: number; shrinkMax: number; total: number }`
- Produces: `export function calcMaxScoreBreakdown(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): MaxScoreBreakdown`
- 既存の `calcMaxScore` / `calcExpectedScore` の挙動は不変（`calcMaxBaseTotal` は `calcMaxScoreBreakdown(...).total` の薄いラッパーになる）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// tests/unit/score/maxScoreBreakdown.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { calcMaxScoreBreakdown } from '../../../src/lib/score/simulation';
import { buildSpecDemo, type SpecDemo } from '../../../src/lib/score/specDemo';

describe('calcMaxScoreBreakdown', () => {
  let demo: SpecDemo;
  beforeAll(async () => { demo = await buildSpecDemo(); });

  it('total = baseScore + scoreUpMax + shrinkMax', () => {
    const b = calcMaxScoreBreakdown(demo.team, demo.notes, demo.options);
    expect(b.total).toBe(b.baseScore + b.scoreUpMax + b.shrinkMax);
    expect(b.shrinkMax).toBeGreaterThan(0);
    expect(b.scoreUpMax).toBeGreaterThan(0);
  });

  it('calcMaxScore と整合する（badge 16% + broach 加算）', () => {
    const b = calcMaxScoreBreakdown(demo.team, demo.notes, demo.options);
    const badge = demo.options.scoreUpBadgeRate ?? 0;
    const final = Math.floor(b.total * (1 + badge / 100)) + demo.team.broachScoreBonus;
    expect(final).toBe(demo.maxScore);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/maxScoreBreakdown.test.ts`
Expected: FAIL（`calcMaxScoreBreakdown` が simulation.ts にエクスポートされていない）

- [ ] **Step 3: 実装**

`calcMaxBaseTotal` の本体を `calcMaxScoreBreakdown` へ移し、内訳を返す。既存関数はラッパー化:

```ts
/** 理論最大スコアの段階別内訳（バッジ・ブローチ適用前） */
export interface MaxScoreBreakdown {
  baseScore: number;
  scoreUpMax: number;
  shrinkMax: number;
  total: number;
}

/** スキル全発動時のバッジ・ブローチ適用前の内訳 (spec §6-6 H38/H40 準拠。ADR 0044) */
export function calcMaxScoreBreakdown(
  team: ComputedTeam,
  notes: FlatNote[],
  options?: ScoreOptions,
): MaxScoreBreakdown {
  // …既存 calcMaxBaseTotal の本体をそのまま移動…
  return { baseScore, scoreUpMax, shrinkMax, total: baseScore + scoreUpMax + shrinkMax };
}

/** スキル全発動時のバッジ・ブローチ適用前の合計 */
function calcMaxBaseTotal(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): number {
  return calcMaxScoreBreakdown(team, notes, options).total;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/score/maxScoreBreakdown.test.ts tests/unit/score/engine.test.ts tests/unit/score/expectedInvariants.test.ts`
Expected: 全 PASS（既存の maxScore / expected 系テストも回帰なし）

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/simulation.ts tests/unit/score/maxScoreBreakdown.test.ts
git commit -m "feat: calcMaxBaseTotal を内訳返却の calcMaxScoreBreakdown へ拡張 (ADR 0044)"
```

---

### Task 2: specDemo に `shrinkMaxBonus` / `scalingPoints` を追加

**Files:**
- Modify: `src/lib/score/specDemo.ts`
- Test: `tests/unit/score/specDemo.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `calcMaxScoreBreakdown`
- Produces: `SpecDemo.shrinkMaxBonus: number`（全発動時の縮小上乗せ合計）
- Produces: `SpecDemo.scalingPoints: ScalingPoint[]`、`export interface ScalingPoint { factor: number; shrinkExpected: number; scoreUpExpected: number }`、`export const DEMO_SCALING_FACTORS = [1.0, 1.5, 2.0, 2.5, 3.0] as const`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// tests/unit/score/specDemo.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { buildSpecDemo, DEMO_SCALING_FACTORS, type SpecDemo } from '../../../src/lib/score/specDemo';

describe('specDemo 追加フィールド (ADR 0044)', () => {
  let demo: SpecDemo;
  beforeAll(async () => { demo = await buildSpecDemo(); });

  it('shrinkMaxBonus は期待値より大きい正値', () => {
    expect(demo.shrinkMaxBonus).toBeGreaterThan(demo.expected.shrinkExpected);
  });

  it('scalingPoints[factor=1.0] は expected と一致する', () => {
    const p0 = demo.scalingPoints[0];
    expect(p0.factor).toBe(1.0);
    expect(p0.shrinkExpected).toBe(demo.expected.shrinkExpected);
    expect(p0.scoreUpExpected).toBe(demo.expected.scoreUpExpected);
  });

  it('縮小期待値は倍率に対して単調増加、スコアアップ期待値は不変', () => {
    expect(demo.scalingPoints.map(p => p.factor)).toEqual([...DEMO_SCALING_FACTORS]);
    for (let i = 1; i < demo.scalingPoints.length; i++) {
      expect(demo.scalingPoints[i].shrinkExpected)
        .toBeGreaterThan(demo.scalingPoints[i - 1].shrinkExpected);
      expect(demo.scalingPoints[i].scoreUpExpected)
        .toBe(demo.scalingPoints[0].scoreUpExpected);
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/specDemo.test.ts`
Expected: FAIL（`DEMO_SCALING_FACTORS` 未定義）

- [ ] **Step 3: 実装**

specDemo.ts に追加（import に `calcMaxScoreBreakdown` を追加）:

```ts
/** 属性値スケーリング図の倍率点（1.0=デモ編成の素の属性値、3.0=イベント特効相当の上限目安） */
export const DEMO_SCALING_FACTORS = [1.0, 1.5, 2.0, 2.5, 3.0] as const;

export interface ScalingPoint {
  factor: number;
  shrinkExpected: number;
  scoreUpExpected: number;
}
```

`SpecDemo` インターフェースへ:

```ts
  /** 全発動時の縮小上乗せ合計（§4-4 表示用、calcMaxScoreBreakdown 由来） */
  shrinkMaxBonus: number;
  /** チーム属性値を倍率スケールした際のスキル期待値寄与（§4-5 スケーリング図用） */
  scalingPoints: ScalingPoint[];
```

`buildSpecDemo()` 内（`mc` 計算の前後どちらでも可）:

```ts
  const shrinkMaxBonus = calcMaxScoreBreakdown(team, notes, DEMO_OPTIONS).shrinkMax;
  const scalingPoints: ScalingPoint[] = DEMO_SCALING_FACTORS.map((factor) => {
    // 属性値のみ倍率スケールしたシャローコピー（「編成全体が factor 倍強くなったら」の近似）
    const scaled: ComputedTeam = {
      ...team,
      Shout: Math.round(team.Shout * factor),
      Beat: Math.round(team.Beat * factor),
      Melody: Math.round(team.Melody * factor),
    };
    const e = calcExpectedScore(scaled, notes, notesCount, DEMO_OPTIONS);
    return { factor, shrinkExpected: e.shrinkExpected, scoreUpExpected: e.scoreUpExpected };
  });
```

return に `shrinkMaxBonus, scalingPoints` を追加。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/score/specDemo.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/specDemo.ts tests/unit/score/specDemo.test.ts
git commit -m "feat: specDemo に shrinkMaxBonus と属性値スケーリング点を追加 (ADR 0044)"
```

---

### Task 3: `coverageDiagramSvg` の 2 段バー化（全発動 + 期待カバー）

**Files:**
- Modify: `src/lib/score/specDiagrams.ts:666-752`
- Test: `tests/unit/score/specDiagrams.test.ts`（`coverageDiagramSvg` describe に追加）

**Interfaces:**
- Produces: `CoverageDiagramParams.expected?: { segments: { label: string; seconds: number; color: string }[]; coverageRate: number; effectiveSeconds: number }`
- `expected` 省略時は従来と同一出力（後方互換、既存テストは無変更で通ること）

- [ ] **Step 1: 失敗するテストを書く**（既存 describe `coverageDiagramSvg` に追加）

```ts
    it('expected を渡すと期待カバーの下段バーと期待カバー率を描画する', () => {
      const svg = coverageDiagramSvg({
        songDuration: 104,
        segments: [
          { label: 'A (20ノーツ毎 × 4秒)', seconds: 81, color: '#f97316' },
          { label: 'B (23ノーツ毎 × 5秒)', seconds: 88, color: '#ea580c' },
        ],
        expected: {
          segments: [
            { label: 'A 期待', seconds: 32, color: '#f97316' },
            { label: 'B 期待', seconds: 34, color: '#ea580c' },
          ],
          coverageRate: 0.6674,
          effectiveSeconds: 98.9,
        },
      });
      expect(svg).toContain('発動確率');
      expect(svg).toContain('期待カバー率 66.7%');
      expect(svg).toContain('66秒'); // 32 + 34
      expect(svg).toContain('実効 98.9秒');
    });
    it('expected 省略時は期待カバー率のラベルを含まない（従来表示）', () => {
      const svg = coverageDiagramSvg({
        songDuration: 104,
        segments: [{ label: 'A', seconds: 50, color: '#f97316' }],
      });
      expect(svg).not.toContain('期待カバー率');
    });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/specDiagrams.test.ts -t 'coverageDiagramSvg'`
Expected: 新規 2 件が FAIL、既存 3 件は PASS

- [ ] **Step 3: 実装**

セグメント描画部を内部ヘルパーへ抽出し、`expected` 指定時は下段に 2 本目のバーを描く。構成:

```ts
export function coverageDiagramSvg(p: CoverageDiagramParams): string {
  const c = STAGE_COLORS.shrink;
  const W = 760;
  const hasExpected = p.expected != null;
  const H = hasExpected ? 330 : 220;
  const M = { top: 30, right: 20, bottom: 60, left: 20 };
  const innerW = W - M.left - M.right;
  const barH = 40;
  const totalSec = p.segments.reduce((a, s) => a + s.seconds, 0);
  const maxRange = Math.max(totalSec, p.songDuration) * 1.05;
  const xScale = (sec: number) => M.left + (sec / maxRange) * innerW;

  // セグメント列を y 位置指定で描く共通ヘルパー（キャップ超過は破線）
  const drawSegments = (
    segments: { label: string; seconds: number; color: string }[], yTop: number,
  ): string => { /* 既存ループを y パラメタ化して移動 */ };

  // 上段: 全発動カバー（既存と同一。ラベルに「全発動できた場合」を追加）
  // 下段 (hasExpected 時): y = M.top + barH + 66 あたりに
  //   - 見出し「発動確率 per を織り込んだ期待カバー」
  //   - 曲の長さ背景バー + expected.segments の積み上げ
  //   - 右肩サマリ: `期待 ${expTotal}秒 → 期待カバー率 ${(rate*100).toFixed(1)}%（実効 ${effectiveSeconds.toFixed(1)}秒ベース）`
  // 秒目盛り・凡例は最下段へ移動
}
```

要件:
- 上段バーの直上ラベルを「全発動できた場合のカバー時間」に変更し、現行のサマリ（`合算 169秒 / 104秒 = 162.5% → min(_, 100%) = 100.0%`）は維持
- 下段サマリの期待カバー率は **`p.expected.coverageRate` をそのまま表示**する（バー長は秒ベース、% はエンジン値。分母差の説明として「実効 ◯秒ベース」を併記）
- `expected` 省略時の出力は現状と同一（スナップショット的な差異は許容するが、既存テスト 3 件が無変更で通ること）

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/score/specDiagrams.test.ts`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/specDiagrams.ts tests/unit/score/specDiagrams.test.ts
git commit -m "feat: coverageDiagramSvg を全発動+期待カバーの2段バーへ拡張 (ADR 0044)"
```

---

### Task 4: `shrinkFormulaSvg` のカバー率注記を 2 種類明記に更新

**Files:**
- Modify: `src/lib/score/specDiagrams.ts:755-804`（`boxes` の 3 つ目）
- Test: `tests/unit/score/specDiagrams.test.ts`（既存 `shrinkFormulaSvg` テストを更新）

**Interfaces:** 変更なし（出力文字列のみ）

- [ ] **Step 1: テストを更新して失敗を確認**

既存 it『3 項すべてのラベルと floor マーカーを含む』へ追加:

```ts
      expect(svg).toContain('全発動時 = 100% でキャップ');
      expect(svg).toContain('期待値 = 発動確率込みの期待カバー率');
```

Run: `npx vitest run tests/unit/score/specDiagrams.test.ts -t 'shrinkFormulaSvg'`
Expected: FAIL

- [ ] **Step 2: 実装**

`boxes` の「カバー率」ボックスの `lines` を差し替え:

```ts
    { x: 510, y: 110, w: 220, h: 100, color: STAGE_COLORS.final.dark,
      title: 'カバー率', lines: ['縮小が効いている時間の割合', '全発動時 = 100% でキャップ', '期待値 = 発動確率込みの期待カバー率'] },
```

※ 3 行目が 220px 幅に収まるようフォントサイズ 11 → 収まらない場合は 10 に調整。

- [ ] **Step 3: テストが通ることを確認 → コミット**

Run: `npx vitest run tests/unit/score/specDiagrams.test.ts`
Expected: 全 PASS

```bash
git add src/lib/score/specDiagrams.ts tests/unit/score/specDiagrams.test.ts
git commit -m "feat: shrinkFormulaSvg のカバー率注記に全発動/期待値の区別を明記 (ADR 0044)"
```

---

### Task 5: `skillContributionCompareSvg` 新設（1 枚あたり寄与の横棒比較）

**Files:**
- Modify: `src/lib/score/specDiagrams.ts`（`shrinkFormulaSvg` の後に追加）
- Test: `tests/unit/score/specDiagrams.test.ts`（describe 追加）

**Interfaces:**
- Produces:

```ts
export interface SkillContributionSlot {
  name: string;       // 例: '四葉環'
  isShrink: boolean;  // true=縮小(orange) / false=スコアアップ(amber)
  expected: number;   // 期待値寄与（demo.slots[].skillExpected）
  max: number;        // 理論最大寄与・単独想定（demo.slots[].skillMax）
}
export function skillContributionCompareSvg(slots: SkillContributionSlot[]): string
```

- [ ] **Step 1: 失敗するテストを書く**

```ts
  describe('skillContributionCompareSvg', () => {
    const slots = [
      { name: '四葉環', isShrink: true, expected: 142804, max: 361474 },
      { name: '和泉一織', isShrink: false, expected: 74498, max: 152038 },
    ];
    it('全スロットの名前と期待値・理論最大の実数値を描画する', () => {
      const svg = skillContributionCompareSvg(slots);
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('四葉環');
      expect(svg).toContain('和泉一織');
      expect(svg).toContain('142,804');
      expect(svg).toContain('361,474');
      expect(svg).toContain('単独想定');
    });
    it('縮小は orange、スコアアップは amber で塗り分ける', () => {
      const svg = skillContributionCompareSvg(slots);
      expect(svg).toContain(STAGE_COLORS.shrink.main);
      expect(svg).toContain(STAGE_COLORS.scoreUp.main);
    });
    it('空配列でも有効な SVG を返す', () => {
      expect(isValidSvg(skillContributionCompareSvg([]))).toBe(true);
    });
  });
```

- [ ] **Step 2: 失敗確認** → Run: `npx vitest run tests/unit/score/specDiagrams.test.ts -t 'skillContributionCompareSvg'` / Expected: FAIL（未定義）

- [ ] **Step 3: 実装**

1 スロット 1 行。理論最大を淡色バー（`pale` + 枠線）、期待値を濃色バーで重ね描き（オーバーレイ式デュアルバー）:

```ts
/* ================================================================
 * 4-5. 縮小 vs スコアアップの寄与比較（ADR 0044）
 * ================================================================ */

export interface SkillContributionSlot {
  name: string;
  isShrink: boolean;
  expected: number;
  max: number;
}

/** 1 枚あたりのスキル寄与（期待値 + 理論最大・単独想定）の横棒比較図 */
export function skillContributionCompareSvg(slots: SkillContributionSlot[]): string {
  const W = 760;
  const rowH = 46;
  const M = { top: 34, right: 20, bottom: 42, left: 96 };
  const H = M.top + slots.length * rowH + M.bottom;
  const innerW = W - M.left - M.right;
  const maxVal = Math.max(1, ...slots.map(s => s.max));
  const xScale = (v: number) => (v / maxVal) * innerW;

  const rows = slots.map((s, i) => {
    const c = s.isShrink ? STAGE_COLORS.shrink : STAGE_COLORS.scoreUp;
    const y = M.top + i * rowH;
    const barY = y + 8;
    const maxW = xScale(s.max);
    const expW = xScale(s.expected);
    return `<g>
      <text x="${M.left - 8}" y="${barY + 15}" text-anchor="end" fill="${TEXT}" font-size="11">${escapeXml(s.name)}</text>
      <rect x="${M.left}" y="${barY}" width="${maxW}" height="20" rx="3" fill="${c.pale}" stroke="${c.main}" stroke-width="1">
        <title>理論最大 +${fmt(s.max)}（単独想定）</title>
      </rect>
      <rect x="${M.left}" y="${barY}" width="${expW}" height="20" rx="3" fill="${c.main}">
        <title>期待値 +${fmt(s.expected)}</title>
      </rect>
      <text x="${M.left + maxW + 6}" y="${barY + 15}" fill="${MUTED}" font-size="10">期待 +${fmt(s.expected)} / 最大 +${fmt(s.max)}</text>
      <text x="${M.left + 4}" y="${barY + 15}" fill="white" font-size="10" font-weight="bold">${s.isShrink ? '縮小' : 'スコアアップ'}</text>
    </g>`;
  }).join('\n');

  const legendY = M.top + slots.length * rowH + 10;
  const legend = `
    <g transform="translate(${M.left}, ${legendY})">
      <rect width="14" height="10" fill="${STAGE_COLORS.shrink.main}"/>
      <text x="18" y="9" fill="${TEXT}" font-size="10">濃色 = 期待値寄与</text>
      <rect x="130" width="14" height="10" fill="${STAGE_COLORS.shrink.pale}" stroke="${STAGE_COLORS.shrink.main}"/>
      <text x="148" y="9" fill="${TEXT}" font-size="10">淡色 = 理論最大寄与（各スキル単独想定）</text>
    </g>`;

  return `${svgOpen(W, H, 'スキル 1 枚あたりの得点寄与の比較')}
    <text x="${M.left}" y="16" fill="${TEXT}" font-size="12" font-weight="bold">1 枚あたりのスキル得点寄与（デモ編成）</text>
    ${rows}
    ${legend}
  </svg>`;
}
```

※ 値ラベルが右端をはみ出す場合（`maxW` が innerW 近傍）はバー内側に描く分岐を入れず、`M.right` を広げて対処（分岐追加はカバレッジ負担になるため）。

- [ ] **Step 4: テスト PASS 確認 → コミット**

Run: `npx vitest run tests/unit/score/specDiagrams.test.ts`

```bash
git add src/lib/score/specDiagrams.ts tests/unit/score/specDiagrams.test.ts
git commit -m "feat: 1枚あたりスキル寄与の横棒比較図 skillContributionCompareSvg を追加 (ADR 0044)"
```

---

### Task 6: `skillScalingChartSvg` 新設（属性値スケーリング線グラフ）

**Files:**
- Modify: `src/lib/score/specDiagrams.ts`（Task 5 の関数の後）
- Test: `tests/unit/score/specDiagrams.test.ts`（describe 追加）

**Interfaces:**
- Consumes: Task 2 の `ScalingPoint`（構造互換の独自型で受ける）
- Produces:

```ts
export interface ScalingChartPoint { factor: number; shrinkExpected: number; scoreUpExpected: number }
export function skillScalingChartSvg(points: ScalingChartPoint[]): string
```

- [ ] **Step 1: 失敗するテストを書く**

```ts
  describe('skillScalingChartSvg', () => {
    const points = [
      { factor: 1.0, shrinkExpected: 294534, scoreUpExpected: 286771 },
      { factor: 2.0, shrinkExpected: 589068, scoreUpExpected: 286771 },
      { factor: 3.0, shrinkExpected: 883602, scoreUpExpected: 286771 },
    ];
    it('2 本の系列と軸ラベル・実数値を描画する', () => {
      const svg = skillScalingChartSvg(points);
      expect(isValidSvg(svg)).toBe(true);
      expect(svg).toContain('判定縮小');
      expect(svg).toContain('スコアアップ');
      expect(svg).toContain('チーム属性値の倍率');
      expect(svg).toContain('×1.0');
      expect(svg).toContain('×3.0');
      expect(svg).toContain('883,602'); // 縮小の右端値
      expect(svg).toContain('286,771'); // スコアアップの右端値
    });
    it('points が 2 点未満なら空 SVG を返す', () => {
      expect(isValidSvg(skillScalingChartSvg([]))).toBe(true);
    });
  });
```

- [ ] **Step 2: 失敗確認** → Run: `npx vitest run tests/unit/score/specDiagrams.test.ts -t 'skillScalingChartSvg'` / Expected: FAIL

- [ ] **Step 3: 実装**

```ts
export interface ScalingChartPoint {
  factor: number;
  shrinkExpected: number;
  scoreUpExpected: number;
}

/** チーム属性値の倍率に対するスキル期待値寄与の線グラフ（縮小=比例 / スコアアップ=固定） */
export function skillScalingChartSvg(points: ScalingChartPoint[]): string {
  const W = 760, H = 280;
  const M = { top: 34, right: 190, bottom: 46, left: 70 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  if (points.length < 2) return `${svgOpen(W, H, '属性値スケーリング比較')}</svg>`;

  const minF = points[0].factor;
  const maxF = points[points.length - 1].factor;
  const maxY = Math.max(...points.map(p => Math.max(p.shrinkExpected, p.scoreUpExpected))) * 1.08;
  const x = (f: number) => M.left + ((f - minF) / (maxF - minF)) * innerW;
  const y = (v: number) => M.top + innerH - (v / maxY) * innerH;

  const line = (key: 'shrinkExpected' | 'scoreUpExpected', color: string) => {
    const pts = points.map(p => `${x(p.factor)},${y(p[key])}`).join(' ');
    const dots = points.map(p =>
      `<circle cx="${x(p.factor)}" cy="${y(p[key])}" r="3.5" fill="${color}"/>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}`;
  };

  const last = points[points.length - 1];
  const xTicks = points.map(p => `
    <line x1="${x(p.factor)}" y1="${M.top + innerH}" x2="${x(p.factor)}" y2="${M.top + innerH + 4}" stroke="${MUTED}"/>
    <text x="${x(p.factor)}" y="${M.top + innerH + 16}" text-anchor="middle" fill="${MUTED}" font-size="10">×${p.factor.toFixed(1)}</text>`).join('');
  const grid = [0.25, 0.5, 0.75, 1].map(r => `
    <line x1="${M.left}" y1="${M.top + innerH * (1 - r)}" x2="${M.left + innerW}" y2="${M.top + innerH * (1 - r)}" stroke="${GRID}" stroke-width="1"/>`).join('');

  return `${svgOpen(W, H, '属性値スケーリング比較')}
    <text x="${M.left}" y="16" fill="${TEXT}" font-size="12" font-weight="bold">チーム属性値が伸びたときのスキル期待値寄与</text>
    ${grid}
    <line x1="${M.left}" y1="${M.top + innerH}" x2="${M.left + innerW}" y2="${M.top + innerH}" stroke="${MUTED}"/>
    ${xTicks}
    <text x="${M.left + innerW / 2}" y="${H - 8}" text-anchor="middle" fill="${MUTED}" font-size="10">チーム属性値の倍率（イベント特効などによる増加の目安）</text>
    ${line('shrinkExpected', STAGE_COLORS.shrink.main)}
    ${line('scoreUpExpected', STAGE_COLORS.scoreUp.main)}
    <text x="${x(last.factor) + 10}" y="${y(last.shrinkExpected) + 4}" fill="${STAGE_COLORS.shrink.dark}" font-size="11" font-weight="bold">判定縮小 +${fmt(last.shrinkExpected)}</text>
    <text x="${x(last.factor) + 10}" y="${y(last.scoreUpExpected) + 4}" fill="${STAGE_COLORS.scoreUp.dark}" font-size="11" font-weight="bold">スコアアップ +${fmt(last.scoreUpExpected)}</text>
  </svg>`;
}
```

- [ ] **Step 4: テスト PASS 確認 → コミット**

Run: `npx vitest run tests/unit/score/specDiagrams.test.ts`

```bash
git add src/lib/score/specDiagrams.ts tests/unit/score/specDiagrams.test.ts
git commit -m "feat: 属性値スケーリング線グラフ skillScalingChartSvg を追加 (ADR 0044)"
```

---

### Task 7: spec.astro §4-3/4-4 改修と §4-5 新設

**Files:**
- Modify: `src/pages/score-calc/spec.astro`

**Interfaces:**
- Consumes: Task 2 `demo.shrinkMaxBonus` / `demo.scalingPoints`、Task 3 `coverageDiagramSvg` の `expected` パラメタ、Task 5/6 の新 SVG 関数

- [ ] **Step 1: frontmatter へデータ配線を追加**

import へ `skillContributionCompareSvg, skillScalingChartSvg` を追加。§4 の変数定義ブロック（`shrinkCoverSeconds` 付近）に追加:

```ts
const shrinkExpectedCoverSeconds = shrinkSlots.map(s =>
  Math.floor((eligibleCount / s.count) * (s.per / 100) * s.value));
const coverageSvg = coverageDiagramSvg({
  songDuration,
  segments: shrinkSlots.map((s, i) => ({
    label: `${s.name} (${s.count}ノーツ毎 × ${s.value}秒)`,
    seconds: shrinkCoverSeconds[i],
    color: CARD_COLORS[i],
  })),
  expected: {
    segments: shrinkSlots.map((s, i) => ({
      label: `${s.name} 期待`,
      seconds: shrinkExpectedCoverSeconds[i],
      color: CARD_COLORS[i],
    })),
    coverageRate: demo.coverage.expectedCoverageRate,
    effectiveSeconds: demo.coverage.effectiveSeconds,
  },
});
const expectedCoverageRatePct = (demo.coverage.expectedCoverageRate * 100).toFixed(1);
// §4-5: スキル持ちスロットの寄与比較とスケーリング図
const contributionCompareSvg = skillContributionCompareSvg(
  demo.slots
    .filter(s => s.skillType != null)
    .map(s => ({ name: s.name, isShrink: s.isShrink, expected: s.skillExpected, max: s.skillMax })));
const scalingChartSvg = skillScalingChartSvg([...demo.scalingPoints]);
```

- [ ] **Step 2: §4-3 の本文へ期待カバー率の一文を追加**

見出し「4-3. カバー率と 100% キャップ」の本文（100% キャップ説明の後）に追記:

```html
      さらに実際には発動確率 per（{shrinkSlots.map(s => `${s.per}%`).join(' / ')}）があるため、
      発動ムラを織り込んだ<strong>期待カバー率は {expectedCoverageRatePct}%</strong> になります（下段バー）。
```

- [ ] **Step 3: §4-4 の数値例を 2 段構成に差し替え**

現行の段落:

> 縮小の上乗せは「対象ノーツの素点合計 × 追加倍率 × カバー率」。倍率 1.6 のうち通常分 1.0 を除いた **0.6 倍ぶん**が上乗せです。デモ編成の期待値では **+{fmt(expected.shrinkExpected)}** になります。

を以下へ差し替え:

```html
    <p class="text-sm text-gray-700 mb-3">
      縮小の上乗せは「対象ノーツの素点合計 × 追加倍率 × カバー率」。倍率 1.6 のうち通常分 1.0 を除いた
      <strong>0.6 倍ぶん</strong>が上乗せです。ここで使うカバー率には 2 種類あります:
    </p>
    <ul class="text-sm text-gray-700 mb-4 list-disc pl-6 space-y-1">
      <li>すべての発動判定に成功した場合（カバー率 100%）: <strong>+{fmt(demo.shrinkMaxBonus)}</strong>（理論最大）</li>
      <li>発動確率を織り込んだ場合（期待カバー率 {expectedCoverageRatePct}%）: <strong>+{fmt(expected.shrinkExpected)}</strong>（期待値）</li>
    </ul>
```

- [ ] **Step 4: §4-5 を新設**

§4-4 の `accBar(3)` の直後・`<details>` の前に挿入:

```html
    <h3 class="text-base font-bold text-gray-800 mb-2 mt-6">4-5. スコアアタックでの位置づけ — 縮小 vs スコアアップ</h3>
    <div class="mb-4 p-3 bg-orange-50 border border-orange-200 rounded text-xs text-orange-900">
      <strong>スコアアタックの基本戦略</strong>: 判定縮小はスコアアップより 1 枚あたりの得点寄与が大きく、
      チーム属性値が高いほど寄与が伸びます。まず縮小でカバー率 100% 以上を確保し
      （発動ムラに備えて余裕を持たせる）、その上でスコアアップスキルが全発動（神発動）するのを狙うのが基本です。
    </div>
    <p class="text-sm text-gray-700 mb-3">
      デモ編成で 1 枚あたりの寄与を比べると、縮小はスコアアップの約 2 倍。デッキ合計では
      スコアアップ 4 枚 vs 縮小 2 枚でほぼ同じ額になりますが、枚数あたりの効率は縮小が上です。
    </p>
    <div class="overflow-x-auto -mx-2 px-2 mb-4">
      <Fragment set:html={contributionCompareSvg} />
    </div>
    <p class="text-sm text-gray-700 mb-3">
      さらにスコアアップは<strong>固定値加算</strong>のため属性値が伸びても寄与が変わらないのに対し、
      縮小は<strong>素点の底上げ</strong>のため属性値に比例して伸びます。イベント特効などで
      チーム属性値が跳ね上がるスコアアタック編成ほど、縮小の相対価値が上がります。
    </p>
    <div class="overflow-x-auto -mx-2 px-2 mb-4">
      <Fragment set:html={scalingChartSvg} />
    </div>
```

- [ ] **Step 5: dev サーバーで表示確認**

```bash
npm run dev  # run_in_background: true, `ready in` を待つ
```

Playwright / chrome-devtools MCP で `http://localhost:4321/score-calc/spec/#shrink` を開き、§4-3 の 2 段バー・§4-4 の 2 段数値・§4-5 の 2 図とコールアウトをスクリーンショットで確認（`tmp/` に保存）。

- [ ] **Step 6: コミット**

```bash
git add src/pages/score-calc/spec.astro
git commit -m "feat: 仕様解説 §4 に期待カバー率の明示と縮小vsスコアアップ戦略比較 (§4-5) を追加 (ADR 0044)"
```

---

### Task 8: E2E テスト追加

**Files:**
- Modify: `tests/score-calc-spec.test.ts`

**Interfaces:**
- Consumes: Task 7 のページ表示（見出し「4-5. スコアアタックでの位置づけ」、テキスト「スコアアタックの基本戦略」「期待カバー率」）

- [ ] **Step 1: テストを追加**

```ts
  test('§4 に期待カバー率と全発動/期待値の 2 段の数値例が表示される', async ({ page }) => {
    const section = page.locator('#shrink');
    await expect(section.getByText(/期待カバー率 \d+\.\d%/).first()).toBeVisible();
    await expect(section.getByText(/理論最大/).first()).toBeVisible();
  });

  test('§4-5 スコアアタック戦略のコールアウトと比較図 2 枚が表示される', async ({ page }) => {
    const section = page.locator('#shrink');
    await expect(section.getByRole('heading', { name: /4-5\. スコアアタックでの位置づけ/ })).toBeVisible();
    await expect(section.getByText('スコアアタックの基本戦略')).toBeVisible();
    await expect(section.locator('svg[aria-label="スキル 1 枚あたりの得点寄与の比較"]')).toBeVisible();
    await expect(section.locator('svg[aria-label="属性値スケーリング比較"]')).toBeVisible();
  });
```

- [ ] **Step 2: dev サーバー再利用で E2E 実行**

Run: `npx playwright test tests/score-calc-spec.test.ts`（dev サーバー起動済み前提、build なし）
Expected: 全 PASS

- [ ] **Step 3: コミット**

```bash
git add tests/score-calc-spec.test.ts
git commit -m "test: 仕様解説 §4 の期待カバー率表示と §4-5 の E2E を追加 (ADR 0044)"
```

---

### Task 9: 全体検証とリリース

**Files:** なし（検証とリリース作業）

- [ ] **Step 1: 単体テスト全体 + カバレッジゲート**

Run: `npm run coverage`
Expected: 全 PASS、statements/branches/functions/lines すべて ≥95%

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: push + PR 作成 + マージ**

```bash
git push -u origin feat/spec-shrink-strategy-visual
gh pr create --title "feat: 仕様解説 §4 に期待カバー率の明示と縮小vsスコアアップ戦略比較を追加 (ADR 0044)" --body "..."
# CI ビルドチェック通過を待ってマージ
gh pr merge --merge
```

- [ ] **Step 4: リリースタグ + デプロイ**

```bash
git checkout main && git pull
git tag v1.52.0 && git push origin v1.52.0   # 直近タグ v1.51.0 の次
```

- [ ] **Step 5: リリース告知ツイート**

`release-tweet` スキルで v1.52.0 の告知文を作成・投稿（`.env` に X_ID/X_PASS があれば自動投稿）。
