# ポイント芸計算ツール 特効入力の枚数化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/point-calc/` の特効入力を「特効%チップの集合」から「金/銀/銅の上昇率 × 使える枚数」の 6 入力に置き換え、イベント DB への依存をなくす。

**Architecture:** `achievableBonusPcts()` を「上昇率 × 枚数上限 × スロット上限」から全組合せを列挙する純関数に作り直し、UI はその導出結果を読み取り専用で表示する。`engine.ts` / `candidates.ts` / `solver.ts` とゴールデンテストは無変更で、特効%が「どこから来るか」だけが変わる。

**Tech Stack:** Astro 6 / Svelte 5 (runes) / TypeScript / Tailwind CSS v4 / Vitest / Playwright

## Global Constraints

- **設計仕様書**: `docs/superpowers/specs/2026-08-06-point-calc-bonus-input-design.md`、**ADR**: `docs/adr/0050-point-calc-bonus-count-input.md`。両者と矛盾する実装をしないこと。
- **表記は「特効」**（「特攻」ではない）。ティア名は **金特効 / 銀特効 / 銅特効**（`gold` / `silver` / `bronze`）。サイト既存表記（`src/components/CardList.svelte` のフィルタ、`src/lib/data/eventBonusTiers.ts` の `optionLabel`）に合わせる。
- **完全静的サイト**: サーバーサイド処理を追加しない。本変更ではむしろビルド時のイベント CSV 読み込みを取り除く。
- **整数演算必須**: pt 計算で浮動小数点の乗算を挟まない。本変更では `engine.ts` を触らないが、特効%は整数パーセントのまま保つこと。
- **`indigo` 禁止**: クラス名・HEX とも `src/` に追加しない（`tests/unit/noIndigo.test.ts` が `src/**/*.{svelte,astro,ts,css}` を全走査して落とす）。無彩色（`bg-chrome-ink` / `focus:ring-chrome-ink` / `text-gray-*`）を使う。
- **`dark:` バリアント禁止**（ライトテーマ固定）。
- **マテリアル規約**: 本文・データを載せる面は不透明の `surface-card`。リスト行など繰り返し要素に `backdrop-filter` を使わない。数値列は `tabular-nums`。
- **カバレッジゲート**: `src/lib/**` に対して statements / branches / functions / lines すべて 95%（`vitest.config.ts`）。
- **lint**: `npm run lint`（oxlint、`correctness` + `suspicious` + `pedantic` が error）が通ること。抑制コメントは `// oxlint-disable-next-line <ルール名> -- <日本語の理由>` 形式（`eslint-disable-next-line` は使わない）。
- **命名規約**: イベント変数は `event`（ループ内の短縮は `ev` まで）。
- コメントは日本語で書く。
- **日常検証は `npm run dev`**（約 1 秒起動、`http://localhost:4321/`）。`npm run build` は約 5.5 分かかるので、必要な場面以外では走らせない。
- **ブランチ**: `feat/point-calc`（PR #404、未マージ）。同じブランチに積む。main で作業しない。
- **`run_in_background` で待つパターンを避ける。** 長いコマンドは Bash の `timeout` を長く設定してフォアグラウンドで実行する。

---

## File Structure

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/pointCalc/types.ts` | `BonusTierKey` / `BonusRates` / `BonusCounts` を追加 |
| `src/lib/pointCalc/constants.ts` | `FALLBACK_BONUS_PCTS` / `MAX_BONUS_PCT` を削除。`BONUS_TIER_KEYS` / `BONUS_TIER_LABEL` / `DEFAULT_BONUS_RATES` / `DEFAULT_BONUS_COUNTS` / `MAX_BONUS_RATE_PCT` / `MAX_BONUS_COUNT` を追加。`DECK_SLOTS` は残す |
| `src/lib/pointCalc/bonusPresets.ts` | 全面書き換え。`achievableBonusPcts(rates, counts, slots?)` のみを公開 |
| `src/components/PointCalc.svelte` | 特効入力 UI を差し替え、`events` props を削除、永続化キーを変更 |
| `src/pages/point-calc/index.astro` | `fetchEventsCsv` 呼び出しと `events` props を削除 |
| `tests/unit/pointCalc/bonusPresets.test.ts` | 全面書き換え |
| `tests/point-calc.test.ts` | チップ操作テストを枚数・上昇率入力のテストに差し替え |

`engine.ts` / `candidates.ts` / `solver.ts` / `storage.ts` / `seo.ts` / `HeaderNav.svelte` / ゴールデンフィクスチャとそのテストは**無変更**。

---

### Task 1: 特効入力を「上昇率 × 使える枚数」に置き換える

ロジック・定数・UI・ページをまとめて差し替える。`defaultBonusPcts` を消すと `PointCalc.svelte` が即座に壊れ、`MAX_BONUS_PCT` を消すと同じく壊れるため、これらは分割できない 1 つの変更になる。

**Files:**
- Modify: `src/lib/pointCalc/types.ts`
- Modify: `src/lib/pointCalc/constants.ts`
- Rewrite: `src/lib/pointCalc/bonusPresets.ts`
- Rewrite: `tests/unit/pointCalc/bonusPresets.test.ts`
- Modify: `src/components/PointCalc.svelte`
- Modify: `src/pages/point-calc/index.astro`

**Interfaces:**
- Consumes: `DECK_SLOTS`（`constants.ts`、既存）、`buildCandidates` / `solve`（既存、無変更）
- Produces:
  - `types.ts`: `type BonusTierKey = 'gold' | 'silver' | 'bronze'`, `interface BonusRates { gold: number; silver: number; bronze: number }`, `interface BonusCounts { gold: number; silver: number; bronze: number }`
  - `constants.ts`: `BONUS_TIER_KEYS: readonly BonusTierKey[]`, `BONUS_TIER_LABEL: Record<BonusTierKey, string>`, `DEFAULT_BONUS_RATES: BonusRates`, `DEFAULT_BONUS_COUNTS: BonusCounts`, `MAX_BONUS_RATE_PCT: number`, `MAX_BONUS_COUNT: number`
  - `bonusPresets.ts`: `achievableBonusPcts(rates: BonusRates, counts: BonusCounts, slots?: number): number[]`
  - UI の `data-testid`: `bonus-rate-gold` / `bonus-rate-silver` / `bonus-rate-bronze` / `bonus-count-gold` / `bonus-count-silver` / `bonus-count-bronze` / `derived-bonus-pcts`（Task 2 の E2E が依存）

- [ ] **Step 1: 型を追加する**

`src/lib/pointCalc/types.ts` の末尾に追記:

```ts
/** 特効のティア。金 = special1 / 銀 = special2 / 銅 = special3 */
export type BonusTierKey = 'gold' | 'silver' | 'bronze';

/** 各ティアの特効上昇率（整数パーセント） */
export interface BonusRates {
  gold: number;
  silver: number;
  bronze: number;
}

/** 使える特効衣装の枚数。フレンドから借りる分を含む */
export interface BonusCounts {
  gold: number;
  silver: number;
  bronze: number;
}
```

- [ ] **Step 2: 定数を差し替える**

`src/lib/pointCalc/constants.ts`:

1. 先頭の import に `BonusCounts` / `BonusRates` / `BonusTierKey` を追加する

```ts
import type {
  BonusCounts, BonusRates, BonusTierKey, Difficulty, Multiplier, PlayMode, Stars, UnitPreset,
} from './types';
```

2. 次の 2 つの定数を**削除**する（チップ追加バリデーション専用だったため）

```ts
/** 開催中のポイント系イベントが無いときの特効%既定値 */
export const FALLBACK_BONUS_PCTS: readonly number[] = [0, 5, 20, 50, 100, 150, 200, 250, 300];

export const MAX_BONUS_PCT = 300;
```

3. `DECK_SLOTS` の定義の直後に次を追記する

```ts
/** 特効ティアの表示順。サイト既存表記に合わせて 金 → 銀 → 銅 */
export const BONUS_TIER_KEYS: readonly BonusTierKey[] = ['gold', 'silver', 'bronze'];

export const BONUS_TIER_LABEL: Record<BonusTierKey, string> = {
  gold: '金特効',
  silver: '銀特効',
  bronze: '銅特効',
};

/** 上昇率の既定値。吉兆の調べ・BUDDY NIGHT NARRATIVE 系で最頻の刻み */
export const DEFAULT_BONUS_RATES: BonusRates = { gold: 50, silver: 20, bronze: 5 };

/** 使える枚数の既定値。0〜300% の 50 刻み 7 段階になり初回表示が読みやすい */
export const DEFAULT_BONUS_COUNTS: BonusCounts = { gold: 6, silver: 0, bronze: 0 };

/** 上昇率入力の上限（%） */
export const MAX_BONUS_RATE_PCT = 100;

/** 枚数入力の上限。デッキはフレンド込みで 6 枠しかない */
export const MAX_BONUS_COUNT = DECK_SLOTS;
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/unit/pointCalc/bonusPresets.test.ts` を**全面的に書き換える**（既存内容は破棄）:

```ts
import { describe, it, expect } from 'vitest';
import { achievableBonusPcts } from '../../../src/lib/pointCalc/bonusPresets';
import { DEFAULT_BONUS_COUNTS, DEFAULT_BONUS_RATES } from '../../../src/lib/pointCalc/constants';
import type { BonusCounts, BonusRates } from '../../../src/lib/pointCalc/types';

const rates = (o: Partial<BonusRates> = {}): BonusRates => ({ gold: 50, silver: 20, bronze: 5, ...o });
const counts = (o: Partial<BonusCounts> = {}): BonusCounts => ({ gold: 0, silver: 0, bronze: 0, ...o });

describe('achievableBonusPcts: 基本', () => {
  it('既定値（上昇率 50/20/5・枚数 6/0/0）では 50 刻みの 7 段階になる', () => {
    expect(achievableBonusPcts(DEFAULT_BONUS_RATES, DEFAULT_BONUS_COUNTS))
      .toEqual([0, 50, 100, 150, 200, 250, 300]);
  });

  it('0 を必ず含む（1 枚も入れずに叩くパターン）', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 3 }))[0]).toBe(0);
  });

  it('昇順かつ重複なしで返す', () => {
    const result = achievableBonusPcts(rates(), counts({ gold: 6, silver: 6, bronze: 6 }));
    for (let i = 1; i < result.length; i++) expect(result[i]).toBeGreaterThan(result[i - 1]);
  });

  it('金 1 枚だけなら 0 と 50 の 2 段階', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 1 }))).toEqual([0, 50]);
  });

  it('金 2 枚・銀 3 枚の組合せを列挙する', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 2, silver: 3 })))
      .toEqual([0, 20, 40, 50, 60, 70, 90, 100, 110, 120, 140, 160]);
  });

  it('上昇率を変えると段階が変わる', () => {
    expect(achievableBonusPcts(rates({ gold: 30 }), counts({ gold: 2 }))).toEqual([0, 30, 60]);
  });
});

describe('achievableBonusPcts: 上限', () => {
  it('枚数の上限が効く（金 2 枚なら 100% までしか出ない）', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 2 }))).toEqual([0, 50, 100]);
  });

  it('スロット上限 6 が効く（各 6 枚持っていても合計 6 枚まで）', () => {
    // 6 枠を金/銀/銅に振り分ける全組合せで 49 段階になる
    expect(achievableBonusPcts(rates(), counts({ gold: 6, silver: 6, bronze: 6 }))).toHaveLength(49);
  });

  it('枚数がスロット上限を超えていてもスロット上限で頭打ちになる', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 99 })))
      .toEqual(achievableBonusPcts(rates(), counts({ gold: 6 })));
  });

  it('slots を明示するとその枠数で列挙する', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 6, silver: 6 }), 2))
      .toEqual([0, 20, 40, 50, 70, 100]);
  });
});

describe('achievableBonusPcts: 退化ケース', () => {
  it('枚数が全て 0 なら [0] のみ', () => {
    expect(achievableBonusPcts(rates(), counts())).toEqual([0]);
  });

  it('上昇率が 0 のティアは枚数を増やしても段階を増やさない', () => {
    expect(achievableBonusPcts(rates({ silver: 0, bronze: 0 }), counts({ gold: 2, silver: 6, bronze: 6 })))
      .toEqual([0, 50, 100]);
  });

  it('slots が 0 なら [0] のみ', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 6 }), 0)).toEqual([0]);
  });
});

describe('achievableBonusPcts: 入力の正規化', () => {
  it('負の枚数は 0 として扱う', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: -3 }))).toEqual([0]);
  });

  it('負の上昇率は 0 として扱う', () => {
    expect(achievableBonusPcts(rates({ gold: -50 }), counts({ gold: 2 }))).toEqual([0]);
  });

  it('非整数は切り捨てる', () => {
    expect(achievableBonusPcts(rates({ gold: 50.9 }), counts({ gold: 2.9 })))
      .toEqual(achievableBonusPcts(rates({ gold: 50 }), counts({ gold: 2 })));
  });

  it('負の slots は 0 として扱う', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 6 }), -1)).toEqual([0]);
  });

  it('NaN は 0 として扱う（normalize の非有限分岐）', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: Number.NaN }))).toEqual([0]);
    expect(achievableBonusPcts(rates({ gold: Number.NaN }), counts({ gold: 2 }))).toEqual([0]);
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `npx vitest run tests/unit/pointCalc/bonusPresets.test.ts`
Expected: FAIL（`achievableBonusPcts` の引数が合わない、`DEFAULT_BONUS_RATES` が存在しない等）

- [ ] **Step 5: `bonusPresets.ts` を書き換える**

`src/lib/pointCalc/bonusPresets.ts` の内容を**すべて次で置き換える**（`PointEventSummary` / `isPointEvent` / `pickDefaultEvent` / `defaultBonusPcts` は削除）:

```ts
import { DECK_SLOTS } from './constants';
import type { BonusCounts, BonusRates } from './types';

/** 負値・非整数を 0 以上の整数へ正規化する。UI でもクランプするが、関数単体で呼んでも壊れないようにする */
function normalize(value: number): number {
  const n = Math.trunc(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 使える特効衣装で到達できる特効%をすべて列挙する。
 *
 * 金 g 枚・銀 s 枚・銅 b 枚（それぞれ counts 以下、合計 slots 以下）を入れたときの
 * 上昇率の合計を集める。一部だけ入れて叩くパターンも含むので 0 は必ず入る。
 * 枚数はフレンドから借りる分を含めた 6 枠分として扱う。
 */
export function achievableBonusPcts(
  rates: BonusRates,
  counts: BonusCounts,
  slots: number = DECK_SLOTS,
): number[] {
  const maxSlots = normalize(slots);
  const goldRate = normalize(rates.gold);
  const silverRate = normalize(rates.silver);
  const bronzeRate = normalize(rates.bronze);
  const maxGold = Math.min(normalize(counts.gold), maxSlots);
  const maxSilver = Math.min(normalize(counts.silver), maxSlots);
  const maxBronze = Math.min(normalize(counts.bronze), maxSlots);

  const found = new Set<number>();
  for (let gold = 0; gold <= maxGold; gold++) {
    for (let silver = 0; silver <= maxSilver && gold + silver <= maxSlots; silver++) {
      for (let bronze = 0; bronze <= maxBronze && gold + silver + bronze <= maxSlots; bronze++) {
        found.add(gold * goldRate + silver * silverRate + bronze * bronzeRate);
      }
    }
  }
  return [...found].toSorted((a, b) => a - b);
}
```

- [ ] **Step 6: 単体テストが通ることを確認**

Run: `npx vitest run tests/unit/pointCalc/bonusPresets.test.ts`
Expected: PASS（18 テスト）

この時点で `PointCalc.svelte` と `index.astro` はまだ古い API を参照しているので `npm run typecheck` は落ちる。Step 7・8 で直す。

- [ ] **Step 7: `PointCalc.svelte` の特効入力を差し替える**

`src/components/PointCalc.svelte` を次のように変更する。

7-1. `<script>` の先頭 12 行（import と `Props`）を次で置き換える:

```ts
  import { buildCandidates } from '../lib/pointCalc/candidates';
  import { solve, type Solution } from '../lib/pointCalc/solver';
  import { achievableBonusPcts } from '../lib/pointCalc/bonusPresets';
  import {
    BONUS_TIER_KEYS, BONUS_TIER_LABEL, DEFAULT_BONUS_COUNTS, DEFAULT_BONUS_RATES,
    DEFAULT_PLAY_MODES, MAX_BONUS_COUNT, MAX_BONUS_RATE_PCT, MULTIPLIERS, PLAY_MODES,
    UNIT_LABEL, UNIT_PRESETS,
  } from '../lib/pointCalc/constants';
  import type {
    BonusCounts, BonusRates, BonusTierKey, Multiplier, PlayMode, UnitPreset,
  } from '../lib/pointCalc/types';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
```

`type Props = { events: PointEventSummary[] };` と `let { events }: Props = $props();` の 2 行は**削除**する（props を取らないコンポーネントになる）。

7-2. `PersistedState` と `initialState` を次で置き換える:

```ts
  interface PersistedState {
    targetPt: number | null;
    currentPt: number | null;
    bonusRates: BonusRates;
    bonusCounts: BonusCounts;
    playModes: PlayMode[];
    units: UnitPreset[];
    multipliers: Multiplier[];
  }

  function initialState(): PersistedState {
    return {
      targetPt: null,
      currentPt: null,
      bonusRates: { ...DEFAULT_BONUS_RATES },
      bonusCounts: { ...DEFAULT_BONUS_COUNTS },
      playModes: [...DEFAULT_PLAY_MODES],
      units: [...UNIT_PRESETS],
      multipliers: [...MULTIPLIERS],
    };
  }
```

7-3. `let bonusPcts = ...` と `let newBonusPct = ...` の 2 行を次で置き換える:

```ts
  let bonusRates = $state<BonusRates>(saved.bonusRates ?? base.bonusRates);
  let bonusCounts = $state<BonusCounts>(saved.bonusCounts ?? base.bonusCounts);
```

7-4. `const diff = ...` の直後に導出値を追加する:

```ts
  const bonusPcts = $derived(achievableBonusPcts(bonusRates, bonusCounts));
```

7-5. `$effect` の保存内容を差し替える:

```ts
  $effect(() => {
    saveJson(STORAGE_KEYS.POINT_CALC_STATE, {
      targetPt, currentPt, bonusRates, bonusCounts, playModes, units, multipliers,
    } satisfies PersistedState);
  });
```

7-6. `addBonusPct` / `removeBonusPct` / `resetBonusPcts` の 3 関数を**削除**し、代わりに次を追加する:

```ts
  /** 入力文字列を 0〜max の整数へ丸める。空欄や不正値は 0 にする */
  function clampInput(raw: string, max: number): number {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(max, n);
  }

  function setRate(tier: BonusTierKey, raw: string) {
    bonusRates = { ...bonusRates, [tier]: clampInput(raw, MAX_BONUS_RATE_PCT) };
  }

  function setCount(tier: BonusTierKey, raw: string) {
    bonusCounts = { ...bonusCounts, [tier]: clampInput(raw, MAX_BONUS_COUNT) };
  }
```

7-7. `calculate()` 内の候補なしメッセージを、チップ前提の文言から次へ変更する:

```ts
      message = '条件に合うライブがありません。プレイ方法・編成・倍率のいずれかを有効にしてください。';
```

7-8. テンプレートの「使ってよい特効%」セクション（`<section class="surface-card p-4 mb-6">` から始まり `</section>` で終わる、チップと追加欄を含むブロック全体）を次で置き換える:

```svelte
<section class="surface-card p-4 mb-6">
  <h2 class="text-lg font-bold mb-3">特効</h2>
  <div class="space-y-3">
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">上昇率</legend>
      <div class="flex flex-wrap gap-4">
        {#each BONUS_TIER_KEYS as tier (tier)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            {BONUS_TIER_LABEL[tier]}
            <input
              type="number" min="0" max={MAX_BONUS_RATE_PCT} inputmode="numeric"
              data-testid="bonus-rate-{tier}"
              value={bonusRates[tier]}
              oninput={(e) => setRate(tier, e.currentTarget.value)}
              class="w-20 border border-gray-300 rounded px-2 py-1 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
            />%
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">使える特効衣装（フレンドから借りる分を含む）</legend>
      <div class="flex flex-wrap gap-4">
        {#each BONUS_TIER_KEYS as tier (tier)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            {BONUS_TIER_LABEL[tier]}
            <input
              type="number" min="0" max={MAX_BONUS_COUNT} inputmode="numeric"
              data-testid="bonus-count-{tier}"
              value={bonusCounts[tier]}
              oninput={(e) => setCount(tier, e.currentTarget.value)}
              class="w-20 border border-gray-300 rounded px-2 py-1 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
            />枚
          </label>
        {/each}
      </div>
    </fieldset>
  </div>
  <p class="mt-3 text-sm text-gray-600 text-pretty" data-testid="derived-bonus-pcts">
    使う特効%: {bonusPcts.map(p => `${p}%`).join(' / ')}（{bonusPcts.length} 段階）
  </p>
</section>
```

- [ ] **Step 8: ページから props を外す**

`src/pages/point-calc/index.astro` のフロントマターを次で置き換える（`fetchEventsCsv` と `isPointEvent` の import、`events` の生成をすべて削除）:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import PointCalc from '../../components/PointCalc.svelte';
import { PAGE_DESCRIPTIONS } from '../../lib/seo.ts';

const base = import.meta.env.BASE_URL;
const breadcrumbs = [
  { name: 'ホーム', url: base },
  { name: 'ポイント芸計算', url: `${base}point-calc/` },
];
---
```

本文の `<PointCalc events={events} client:only="svelte" />` を次に変更する:

```astro
  <PointCalc client:only="svelte" />
```

- [ ] **Step 9: 静的チェックと単体テスト全体**

Run: `npm run lint && npm run typecheck && npm run test:unit`
Expected: すべて exit 0。`tests/unit/noIndigo.test.ts` を含む全テストが通ること。`PointEventSummary` 等の削除済み API を参照している箇所が残っていれば typecheck が検出する

- [ ] **Step 10: カバレッジを確認**

Run: `npm run coverage`
Expected: exit 0。`src/lib/pointCalc/**` が 95% 以上。`normalize` の各分岐（負値・非整数・非有限）はテストで到達しているはず。下回るなら分岐に到達するテストを追加する（`/* v8 ignore */` は本当に到達不能な防御的分岐にのみ使う）

- [ ] **Step 11: dev サーバーで表示を確認**

```bash
npm run dev
```

ログに `ready in` が出たら `http://localhost:4321/point-calc/` を開き、次を確認する。

1. 「特効」セクションに上昇率 3 入力（金 50 / 銀 20 / 銅 5）と枚数 3 入力（金 6 / 銀 0 / 銅 0）が出ている
2. 「使う特効%: 0% / 50% / 100% / 150% / 200% / 250% / 300%（7 段階）」と表示される
3. 金特効の枚数を `1` にすると「0% / 50%（2 段階）」に変わる
4. 金特効の上昇率を `30`、枚数を `2` にすると「0% / 30% / 60%（3 段階）」に変わる
5. 目標pt `7777777` / 現在のpt `0` で「組合せを計算する」を押すと候補が出て、少なくとも 1 つに「ぴったり」バッジが付く
6. ブラウザコンソールに hydration 系のエラーが出ない
7. リロードしても上昇率・枚数の入力が復元される

スクリーンショットを `tmp/point-calc-bonus-*.png` に保存する。確認後に dev サーバーを停止する。

- [ ] **Step 12: コミット**

```bash
git add src/lib/pointCalc/types.ts src/lib/pointCalc/constants.ts src/lib/pointCalc/bonusPresets.ts \
        src/components/PointCalc.svelte src/pages/point-calc/index.astro \
        tests/unit/pointCalc/bonusPresets.test.ts
git commit -m "feat(point-calc): 特効入力を金銀銅の上昇率と使える枚数に変更"
```

---

### Task 2: E2E の差し替えと最終確認

**Files:**
- Modify: `tests/point-calc.test.ts`

**Interfaces:**
- Consumes: Task 1 の `data-testid`（`bonus-rate-gold` / `bonus-rate-silver` / `bonus-rate-bronze` / `bonus-count-gold` / `bonus-count-silver` / `bonus-count-bronze` / `derived-bonus-pcts`）と既存の `target-pt` / `current-pt` / `diff` / `play-mode-<モード名>` / `unit-<プリセット>` / `multiplier-<倍率>` / `calculate` / `message` / `solutions`
- Produces: なし

- [ ] **Step 1: チップ操作のテストを差し替える**

`tests/point-calc.test.ts` の次のテスト**1 件だけ**を削除する:

```ts
  test('特効%チップを追加・削除できる', async ({ page }) => {
    const chips = page.getByTestId('bonus-chips');
    await page.getByTestId('new-bonus-pct').fill('7');
    await page.getByRole('button', { name: '追加' }).click();
    await expect(chips.getByText('7%', { exact: true })).toBeVisible();
    await chips.getByRole('button', { name: '7% を削除' }).click();
    await expect(chips.getByText('7%', { exact: true })).toHaveCount(0);
  });
```

同じ位置に次の 3 件を入れる:

```ts
  test('既定の特効設定から 50 刻み 7 段階が導出される', async ({ page }) => {
    await expect(page.getByTestId('bonus-rate-gold')).toHaveValue('50');
    await expect(page.getByTestId('bonus-count-gold')).toHaveValue('6');
    await expect(page.getByTestId('derived-bonus-pcts'))
      .toHaveText('使う特効%: 0% / 50% / 100% / 150% / 200% / 250% / 300%（7 段階）');
  });

  test('使える枚数を減らすと導出される特効%が減る', async ({ page }) => {
    await page.getByTestId('bonus-count-gold').fill('1');
    await expect(page.getByTestId('derived-bonus-pcts'))
      .toHaveText('使う特効%: 0% / 50%（2 段階）');
  });

  test('上昇率を変えると導出される特効%が変わる', async ({ page }) => {
    await page.getByTestId('bonus-count-gold').fill('2');
    await page.getByTestId('bonus-rate-gold').fill('30');
    await expect(page.getByTestId('derived-bonus-pcts'))
      .toHaveText('使う特効%: 0% / 30% / 60%（3 段階）');
  });
```

- [ ] **Step 2: 永続化テストに特効の枚数を足す**

`tests/point-calc.test.ts` の「入力がリロード後も復元される」テストを次で置き換える:

```ts
  test('入力がリロード後も復元される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('1234567');
    await page.getByTestId('bonus-count-silver').fill('3');
    await page.getByTestId('play-mode-オート').uncheck();
    await page.reload();
    await expect(page.getByTestId('target-pt')).toHaveValue('1234567');
    await expect(page.getByTestId('bonus-count-silver')).toHaveValue('3');
    await expect(page.getByTestId('play-mode-オート')).not.toBeChecked();
  });
```

- [ ] **Step 3: dev サーバーを再利用して E2E を実行**

`playwright.config.ts` は `reuseExistingServer: true` なので、先に dev サーバーを起動しておけば本番ビルド（5.5 分）を待たずに回せる。

```bash
npm run dev
```

`ready in` を確認してから:

```bash
npx playwright test tests/point-calc.test.ts
```

Expected: 8 テストすべて PASS

dev では Astro dev toolbar が DOM に要素を注入するので、ロケータは `getByTestId` / `getByRole` / `getByLabel` で特定すること（裸の `locator('select')` のような曖昧なセレクタは strict mode 違反になる）。

- [ ] **Step 4: 本番ビルドで確認**

dev サーバーを停止してから（4321 番ポートが競合する）:

Run: `npm run preview`（Bash の `timeout` は最低 420000 ms。実測 5.5 分。フォアグラウンドで実行する）
Expected: ビルドが成功し、`http://localhost:4321/point-calc/` が本番ビルドでも動作する。ブラウザコンソールに hydration 系のエラーが出ないこと

- [ ] **Step 5: 全テストを流す**

Run: `npm run lint && npm run typecheck && npm run coverage && npx playwright test`
Expected: すべて exit 0

なお `tests/score-calc.test.ts` の Monte Carlo テストは高負荷時にタイムアウトする既知のフレーキーテストで、本変更とは無関係。落ちた場合は単体で再実行して確認すること。

- [ ] **Step 6: コミットして push**

`/releases/` ページは git タグ間のコミット件名から自動生成されるため、編集するリリースノートのファイルは無い。コミット件名がリリース履歴の 1 行として読めることを確認する。

```bash
git log --oneline main..HEAD
git add tests/point-calc.test.ts
git commit -m "test(point-calc): 特効の枚数・上昇率入力のE2Eに差し替え"
git push
```

PR #404 は既存なので新規作成はしない。push すれば自動で反映される。

- [ ] **Step 7: PR 本文を更新する**

PR #404 の本文には「特効%チップの表示内容の是正 — 別 PR で対応予定」という既知の未対応が書かれている。この PR で解決したので、その記述を削除し、特効入力の変更内容を追記する。

```bash
gh pr view 404 --json body -q .body > /tmp/pr404-body.md
```

`/tmp/pr404-body.md` を編集し、「## 既知の未対応」節の特効%チップの行を削除したうえで、「## 主な仕様」節の特効に関する行を次に差し替える。

```
- 特効は **金/銀/銅の上昇率（%）と使える枚数（フレンド込み 6 枠分）** を入力する。ツールはその範囲で組めるすべての特効%を候補にするので、「金を 2 枚持っているが 1 枚だけ入れて叩く」パターンも自動で入る
```

編集後:

```bash
gh pr edit 404 --body-file /tmp/pr404-body.md
```

---

## Self-Review

**仕様カバレッジ**

| 仕様書のセクション | 対応タスク |
|---|---|
| §2 用語（金/銀/銅特効、「特効」表記） | Task 1 Step 2（`BONUS_TIER_LABEL`） |
| §3.1 上昇率 3 入力 × 枚数 3 入力 | Task 1 Step 7-8 |
| §3.1 導出結果は読み取り専用 | Task 1 Step 7-8（`derived-bonus-pcts`） |
| §3.1 フレンドを別入力に分けない | Task 1 Step 7-8（枚数入力は 3 つのみ、legend に明記） |
| §3.2 枚数は上限として全組合せを列挙 | Task 1 Step 5 |
| §3.3 上昇率は直接入力、イベント DB 依存を削除 | Task 1 Step 5・8 |
| §3.4 弱編成は変更しない | 変更対象に含めない（`candidates.ts` 無変更） |
| §4.1 `achievableBonusPcts(rates, counts, slots?)` | Task 1 Step 5 |
| §4.1 関数内で非負整数へ正規化 | Task 1 Step 5（`normalize`）/ Step 3（正規化テスト 4 件） |
| §4.2 削除するもの | Task 1 Step 2・5・8 |
| §4.3 engine/candidates/solver/golden 無変更 | File Structure に明記、Task 1 Step 9 の全テストで担保 |
| §4.4 UI 差し替えと入力クランプ | Task 1 Step 7 |
| §4.5 永続化キーの差し替え、マイグレーションなし | Task 1 Step 7-2・7-3・7-5 |
| §4.6 既定値 | Task 1 Step 2 |
| §5 テスト | Task 1 Step 3 / Task 2 Step 1-2 |

**仕様から意図的に外した点**

- 仕様書 §3.1 は「段階数が多くなる組合せでも省略せず全部出す」としている。実装は `bonusPcts.map(...).join(' / ')` で単純に全件連結するため自動的に満たされる。上限や省略の分岐は入れない。

**期待値の根拠**

Task 1 Step 3 と Task 2 の期待値は、設計と同じ列挙ロジックを Node で実行して得た実測値である。

| 入力 | 期待値 |
|---|---|
| 50/20/5・6/0/0 | `0, 50, 100, 150, 200, 250, 300` |
| 50/20/5・2/3/0 | `0, 20, 40, 50, 60, 70, 90, 100, 110, 120, 140, 160` |
| 50/20/5・6/6/6 | 49 段階 |
| 50/20/5・6/6/0・slots 2 | `0, 20, 40, 50, 70, 100` |
| 30/20/5・2/0/0 | `0, 30, 60` |
| 50/0/0・2/6/6 | `0, 50, 100` |
