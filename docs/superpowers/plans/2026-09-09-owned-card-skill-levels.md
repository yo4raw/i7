# 所持衣装のスキル Lv 保存と計算反映 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所持衣装ごとに 1 枚単位のスキル Lv を localStorage に保存し、スコア計算のスロット既定 Lv と編成組合計算（所持衣装で検索）の評価 Lv に使う。

**Architecture:** 新キー `i7_card_skill_levels`（`Record<衣装ID, SkillLevel[]>`）を `countStore` と同型の Svelte 5 ストアで読み書きし、所持数入力部品 `CountInput.svelte` に枚数分の Lv セレクトを足す。消費側は `deckState.ts` の純関数（スコア計算の既定 Lv）と `maxScoreFinder.ts` の `evaluateDeck`（所持検索時のスロット Lv 決定）の 2 点。欠けは常に Lv5 とみなし、マイグレーションを持たない。

**Tech Stack:** Astro 7 / Svelte 5 (runes) / TypeScript / Tailwind v4 / Vitest (jsdom) / Playwright

**Spec:** `docs/superpowers/specs/2026-09-09-owned-card-skill-levels-design.md`（ADR: `docs/adr/0085-owned-card-skill-levels.md`）

## Global Constraints

- 完全静的サイト。サーバーサイド処理・バックエンド API は導入しない
- localStorage キーは必ず `STORAGE_KEYS`（`src/lib/storage.ts`）に追加する（バックアップ対象に含めるため）
- カードを指す ID は `Card.ID`（`Card.cardID` ではない）
- ユーザー可視テキストは「衣装」（「カード」不可）。「スキルレベル」「Lv」表記を使う
- `indigo` クラス・HEX を増やさない。`dark:` バリアントを付けない。キャラ色で面を塗らない
- コミット件名は `<gitmoji> <日本語の説明>`（半角スペース 1 個）。`.husky/commit-msg` が検証する
- Playwright の `test` / `expect` は `tests/helpers/fixtures.ts` から import する
- 日常検証は `npm run dev`（HMR）。`npm run build` は走らせない
- 作業ブランチは `feat/owned-card-skill-levels`（`develop` から分岐済み。仕様書・ADR はコミット済み）
- 品質チェック: `npm run typecheck`（astro check）、`npm run lint`（oxlint）、`npm run test:unit`（Vitest）

## File Structure

| ファイル | 責務 | 操作 |
| -------- | ---- | ---- |
| `src/lib/storage.ts` | `STORAGE_KEYS.CARD_SKILL_LEVELS` 追加 | 変更 |
| `src/lib/stores/cardSkillLevels.svelte.ts` | Lv 配列の読み書きストア（`getLevels` / `setLevel` / `sortedLevels` / `reload`） | 新規 |
| `src/lib/score/deckState.ts` | `defaultSkillLevelFor(levels, alreadyUsed)` 純関数 | 変更 |
| `src/components/cards/CountInput.svelte` | 所持数 ± の下に枚数分の Lv セレクト | 変更 |
| `src/components/ScoreCalc.svelte` | `handlePick` で所持 Lv をスロット既定に | 変更 |
| `src/lib/score/maxScoreFinder.ts` | `SearchInput.ownedSkillLevels`、`deckSkillLevels(ctx, deck)`、`DeckRecord.skillLevels` | 変更 |
| `src/components/MaxScoreFinder.svelte` | `ownedSkillLevels` を組み立てて Worker へ、マウント時に store reload | 変更 |
| `src/components/score/SearchResults.svelte` | 記録された Lv で表示・`computeTeam`・スコア計算への引き渡し | 変更 |
| `src/pages/score-calc/max-score-finder/index.astro` | 本文・ToolGuide の Lv 前提の説明を更新 | 変更 |
| `tests/unit/stores/cardSkillLevels.test.ts` | ストアの単体テスト | 新規 |
| `tests/unit/score/deckState.test.ts` | `defaultSkillLevelFor` のテスト追記 | 変更 |
| `tests/unit/score/maxScoreFinder.test.ts` | `deckSkillLevels` / `evaluateDeck` のテスト追記 | 変更 |
| `tests/card-list.test.ts` | Lv セレクトの永続化 E2E 追記 | 変更 |
| `tests/score-calc.test.ts` | 所持 Lv がスロット既定になる E2E 追記 | 変更 |

---

### Task 1: ストレージキーと `cardSkillLevels` ストア

**Files:**
- Modify: `src/lib/storage.ts:8-19`
- Create: `src/lib/stores/cardSkillLevels.svelte.ts`
- Test: `tests/unit/stores/cardSkillLevels.test.ts`

**Interfaces:**
- Consumes: `loadJson` / `saveJson` / `STORAGE_KEYS`（`src/lib/storage.ts`）、`SkillLevel`（`src/lib/score/deckState.ts`）
- Produces:
  - `STORAGE_KEYS.CARD_SKILL_LEVELS = 'i7_card_skill_levels'`
  - `getLevels(cardId: number | string, count: number): SkillLevel[]`（長さ = count、欠けは 5）
  - `setLevel(cardId: number | string, index: number, lv: SkillLevel): void`
  - `sortedLevels(cardId: number | string, count: number): SkillLevel[]`（降順）
  - `reloadSkillLevelsFromStorage(): void`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/stores/cardSkillLevels.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLevels, setLevel, sortedLevels, reloadSkillLevelsFromStorage,
} from '../../../src/lib/stores/cardSkillLevels.svelte';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => {
  localStorage.clear();
  reloadSkillLevelsFromStorage();
});

describe('getLevels', () => {
  it('未保存は count 個の 5 を返す', () => {
    expect(getLevels(1, 0)).toEqual([]);
    expect(getLevels(1, 2)).toEqual([5, 5]);
  });

  it('保存済みより count が多ければ 5 で埋め、少なければ切り詰める', () => {
    setLevel(1, 0, 3);
    setLevel(1, 1, 2);
    expect(getLevels(1, 3)).toEqual([3, 2, 5]);
    expect(getLevels(1, 1)).toEqual([3]);
    expect(getLevels('1', 2)).toEqual([3, 2]);
  });
});

describe('setLevel', () => {
  it('index 枚目だけ更新し localStorage に永続化する', () => {
    setLevel(7, 1, 4);
    expect(getLevels(7, 2)).toEqual([5, 4]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CARD_SKILL_LEVELS)!)).toEqual({ '7': [5, 4] });
  });

  it('全て 5 に戻るとキーごと削除する', () => {
    setLevel(7, 0, 3);
    setLevel(7, 0, 5);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CARD_SKILL_LEVELS)!)).toEqual({});
  });

  it('範囲外の Lv は無視する', () => {
    setLevel(7, 0, 9 as never);
    setLevel(7, 0, 0 as never);
    expect(getLevels(7, 1)).toEqual([5]);
  });
});

describe('sortedLevels / reload', () => {
  it('降順に並べて返す', () => {
    setLevel(3, 0, 2);
    setLevel(3, 2, 4);
    expect(sortedLevels(3, 3)).toEqual([5, 4, 2]);
  });

  it('reload で localStorage の最新内容に同期し、消えたキーを落とす', () => {
    setLevel(1, 0, 1);
    setLevel(2, 0, 1);
    localStorage.setItem(STORAGE_KEYS.CARD_SKILL_LEVELS, JSON.stringify({ '1': [2] }));
    reloadSkillLevelsFromStorage();
    expect(getLevels(1, 1)).toEqual([2]);
    expect(getLevels(2, 1)).toEqual([5]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/stores/cardSkillLevels.test.ts`
Expected: FAIL（`Failed to resolve import ".../cardSkillLevels.svelte"`）

- [ ] **Step 3: ストレージキーを追加する**

`src/lib/storage.ts` の `STORAGE_KEYS` に 1 行追加（`POINT_CALC_STATE` の次）:

```ts
  POINT_CALC_STATE: 'i7_point_calc_state',
  CARD_SKILL_LEVELS: 'i7_card_skill_levels',
} as const;
```

- [ ] **Step 4: ストアを実装する**

`src/lib/stores/cardSkillLevels.svelte.ts`:

```ts
import { loadJson, saveJson, STORAGE_KEYS } from '../storage';
import type { SkillLevel } from '../score/deckState';

/** 衣装 ID → 1 枚ごとのスキル Lv（配列の i 番目 = i 枚目）。全て 5 のキーは保存しない */
type LevelMap = Record<string, SkillLevel[]>;

const DEFAULT_LEVEL: SkillLevel = 5;

const levels = $state<LevelMap>(
  typeof window === 'undefined' ? {} : loadJson<LevelMap>(STORAGE_KEYS.CARD_SKILL_LEVELS, {}),
);

function isSkillLevel(v: unknown): v is SkillLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

/** 保存配列を count 件に切り詰め、足りない分は 5 で埋める（長さは常に count） */
export function getLevels(cardId: number | string, count: number): SkillLevel[] {
  const saved = levels[String(cardId)] ?? [];
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const lv = saved[i];
    return isSkillLevel(lv) ? lv : DEFAULT_LEVEL;
  });
}

/** index 枚目の Lv を更新する。全て 5 になったらキーごと削除する */
export function setLevel(cardId: number | string, index: number, lv: SkillLevel): void {
  if (!isSkillLevel(lv) || index < 0) return;
  const key = String(cardId);
  const next = getLevels(key, Math.max(index + 1, (levels[key] ?? []).length));
  next[index] = lv;
  if (next.every((v) => v === DEFAULT_LEVEL)) {
    delete levels[key];
  } else {
    levels[key] = next;
  }
  saveJson(STORAGE_KEYS.CARD_SKILL_LEVELS, levels);
}

/** 計算側が使う降順の Lv 配列 */
export function sortedLevels(cardId: number | string, count: number): SkillLevel[] {
  return getLevels(cardId, count).toSorted((a, b) => b - a);
}

/** localStorage の最新内容に同期し、消えたキーは落とす（バックアップ取り込み後・他タブ更新後に使う） */
export function reloadSkillLevelsFromStorage(): void {
  const fresh = loadJson<LevelMap>(STORAGE_KEYS.CARD_SKILL_LEVELS, {});
  for (const key of Object.keys(levels)) {
    if (!(key in fresh)) delete levels[key];
  }
  for (const [k, v] of Object.entries(fresh)) {
    levels[k] = v;
  }
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/unit/stores/cardSkillLevels.test.ts tests/unit/storage.test.ts`
Expected: PASS（storage.test の「全キーが i7_ プレフィックスの一意な文字列」も通る）

- [ ] **Step 6: コミット**

```bash
git add src/lib/storage.ts src/lib/stores/cardSkillLevels.svelte.ts tests/unit/stores/cardSkillLevels.test.ts
git commit -m "✨ 所持衣装のスキル Lv を保存する cardSkillLevels ストアを追加する"
```

---

### Task 2: スロット既定 Lv の純関数 `defaultSkillLevelFor`

**Files:**
- Modify: `src/lib/score/deckState.ts`（`clearSlot` の後に追記）
- Test: `tests/unit/score/deckState.test.ts`（末尾に describe 追記）

**Interfaces:**
- Produces: `defaultSkillLevelFor(levels: SkillLevel[], alreadyUsed: number): SkillLevel` — `levels` は降順の所持 Lv。同じ衣装が他スロットに `alreadyUsed` 枚あるとき、その次の 1 枚の Lv を返す。範囲外・未所持は 5

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/deckState.test.ts` の import に `defaultSkillLevelFor` を追加し、ファイル末尾に追記:

```ts
describe('defaultSkillLevelFor (所持 Lv からスロット既定 Lv を決める)', () => {
  it('未所持（空配列）は 5', () => {
    expect(defaultSkillLevelFor([], 0)).toBe(5);
  });

  it('1 枚目は先頭（最高 Lv）、2 枚目は次の Lv', () => {
    expect(defaultSkillLevelFor([4, 2], 0)).toBe(4);
    expect(defaultSkillLevelFor([4, 2], 1)).toBe(2);
  });

  it('所持枚数を超えた分は 5', () => {
    expect(defaultSkillLevelFor([3], 1)).toBe(5);
    expect(defaultSkillLevelFor([3], -1)).toBe(5);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/score/deckState.test.ts`
Expected: FAIL（`defaultSkillLevelFor is not a function` 相当）

- [ ] **Step 3: 実装する**

`src/lib/score/deckState.ts` 末尾に追記:

```ts
/**
 * 所持 Lv（降順）からスロットの既定 Lv を決める。
 * 同じ衣装が他スロットに alreadyUsed 枚あれば、その次の 1 枚の Lv。範囲外・未所持は 5
 */
export function defaultSkillLevelFor(levels: SkillLevel[], alreadyUsed: number): SkillLevel {
  return levels[alreadyUsed] ?? 5;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/score/deckState.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/deckState.ts tests/unit/score/deckState.test.ts
git commit -m "✨ 所持 Lv からスロット既定 Lv を決める defaultSkillLevelFor を追加する"
```

---

### Task 3: `CountInput.svelte` に Lv セレクトを追加

**Files:**
- Modify: `src/components/cards/CountInput.svelte`（全体）
- Test: `tests/card-list.test.ts`（「所持数コントロールが動作する」の直後に追記）

**Interfaces:**
- Consumes: `getLevels` / `setLevel`（Task 1）、`getCount` / `setCount` / `deltaCount`（既存 `cardCounts.svelte.ts`）
- Produces（E2E が使う DOM 属性）:
  - `input[data-count-input="{cardId}"]`（所持数入力）
  - `button[data-count-btn="{cardId}"][data-delta="1"|"-1"]`（±）
  - `select[data-skill-level-input="{cardId}"][data-copy-index="{i}"]`（i 枚目の Lv）

補足: `data-count-input` / `data-count-btn` は既存 E2E（`tests/card-list.test.ts:102-107` と `tests/mycard.test.ts:34-36`）が参照しているが、現在の `CountInput.svelte` には無い（過去の改修で落ちた）。この Task で復元する。

- [ ] **Step 1: 失敗する E2E を書く**

`tests/card-list.test.ts` の「所持数コントロールが動作する」の直後に追記:

```ts
  test('所持数が 1 以上になるとスキル Lv セレクトが出て、変更がリロード後も残る', async ({ page }) => {
    const firstInput = page.locator('#table-body input[data-count-input]').first();
    await expect(firstInput).toBeVisible();
    const cardId = await firstInput.getAttribute('data-count-input');

    // 所持 0 のときは Lv セレクトが無い
    const lvSelect = page.locator(`#table-body select[data-skill-level-input="${cardId}"][data-copy-index="0"]`);
    await expect(lvSelect).toHaveCount(0);

    await page.locator(`#table-body button[data-count-btn="${cardId}"][data-delta="1"]`).first().click();
    await expect(lvSelect).toBeVisible();
    await expect(lvSelect).toHaveValue('5');

    await lvSelect.selectOption('3');
    await page.reload();
    await expect(page.locator(`#table-body select[data-skill-level-input="${cardId}"][data-copy-index="0"]`)).toHaveValue('3');

    // クリーンアップ
    await page.evaluate(() => localStorage.clear());
  });
```

- [ ] **Step 2: dev サーバーを起動し、E2E が失敗することを確認する**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
npx playwright test tests/card-list.test.ts -g "スキル Lv セレクト"
```

Expected: FAIL（`input[data-count-input]` が見つからずタイムアウト）

- [ ] **Step 3: `CountInput.svelte` を書き換える**

```svelte
<script lang="ts">
  import { getCount, setCount, deltaCount } from '../../lib/stores/cardCounts.svelte';
  import { getLevels, setLevel } from '../../lib/stores/cardSkillLevels.svelte';
  import type { SkillLevel } from '../../lib/score/deckState';

  type Props = { cardId: number };
  let { cardId }: Props = $props();

  let value = $derived(getCount(cardId));
  let levels = $derived(getLevels(cardId, value));
  const LEVEL_OPTIONS: SkillLevel[] = [1, 2, 3, 4, 5];

  function onLevelChange(e: Event, index: number) {
    const lv = Number((e.currentTarget as HTMLSelectElement).value);
    setLevel(cardId, index, lv as SkillLevel);
  }
</script>

<div class="flex flex-col items-center gap-1" onclick={(e) => e.stopPropagation()} role="presentation">
  <div class="flex items-center justify-center gap-1">
    <button
      type="button"
      class="size-6 rounded bg-gray-200 hover:bg-gray-300 text-sm font-bold leading-none"
      data-count-btn={cardId}
      data-delta="-1"
      onclick={(e) => { e.stopPropagation(); deltaCount(cardId, -1); }}
      aria-label="所持数を1減らす"
    >−</button>
    <input
      type="number"
      min="0"
      {value}
      data-count-input={cardId}
      class="w-10 h-6 text-center text-sm border border-gray-300 rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      onclick={(e) => e.stopPropagation()}
      onchange={(e) => {
        const v = Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0);
        setCount(cardId, v);
        (e.currentTarget as HTMLInputElement).value = String(v);
      }}
    />
    <button
      type="button"
      class="size-6 rounded bg-gray-200 hover:bg-gray-300 text-sm font-bold leading-none"
      data-count-btn={cardId}
      data-delta="1"
      onclick={(e) => { e.stopPropagation(); deltaCount(cardId, 1); }}
      aria-label="所持数を1増やす"
    >+</button>
  </div>
  {#if value > 0}
    <div class="flex flex-wrap items-center justify-center gap-1">
      {#each levels as lv, i (i)}
        <label class="flex items-center gap-0.5 text-[10px] text-gray-600">
          <span>Lv</span>
          <select
            class="h-5 text-[10px] border border-gray-300 rounded px-0.5 focus:outline-none focus:ring-1 focus:ring-chrome-ink"
            data-skill-level-input={cardId}
            data-copy-index={i}
            aria-label={`スキルレベル（${i + 1}枚目）`}
            value={lv}
            onclick={(e) => e.stopPropagation()}
            onchange={(e) => onLevelChange(e, i)}
          >
            {#each LEVEL_OPTIONS as opt (opt)}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </label>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 4: E2E が通ることを確認する（既存の所持数テストも）**

Run: `npx playwright test tests/card-list.test.ts -g "所持数コントロール|スキル Lv セレクト"`
Expected: 2 passed

- [ ] **Step 5: 表・タイル・モバイルの 3 表示をブラウザで確認する**

Playwright MCP / chrome-devtools MCP で `http://localhost:4321/cards/` を開き、任意の衣装の所持数を 2 にして Lv セレクトが 2 つ並ぶこと、表示モードを切り替えて（`i7_card_list_view_mode`）タイル・モバイル幅でも崩れないことを確認する。スクリーンショットを `tmp/` に保存する。表の所持数列（`CardTableRow.svelte` 側 `<th class="px-3 py-2 w-28 ...">所持数</th>` は `CardList.svelte:355`）で折り返しが窮屈なら `w-28` → `w-36` に広げる。

- [ ] **Step 6: 型チェックと lint**

```bash
npm run typecheck
npm run lint
```

Expected: エラー 0

- [ ] **Step 7: コミット**

```bash
git add src/components/cards/CountInput.svelte tests/card-list.test.ts src/components/CardList.svelte
git commit -m "✨ 所持数入力の横に 1 枚ごとのスキル Lv セレクトを表示する"
```

（`CardList.svelte` は列幅を変えた場合のみ）

---

### Task 4: スコア計算でスロットの既定 Lv を所持 Lv にする

**Files:**
- Modify: `src/components/ScoreCalc.svelte:13`（import）、`:115`（`handlePick`）
- Test: `tests/score-calc.test.ts`（describe 内の末尾に追記）

**Interfaces:**
- Consumes: `defaultSkillLevelFor`（Task 2）、`sortedLevels` / `reloadSkillLevelsFromStorage`（Task 1）、`getCount`（既存）

- [ ] **Step 1: 失敗する E2E を書く**

`tests/score-calc.test.ts` の describe 内末尾に追記:

```ts
  test('所持 Lv を登録した衣装を置くとスロットの既定 Lv になる', async ({ page }) => {
    // ピッカーの先頭衣装を所持 1 枚・Lv3 として登録してから開き直す
    await page.locator('[data-slot-btn="0"]').click();
    await page.locator('#modal-owned-only').uncheck();
    await page.locator('[data-pick-card]').first().waitFor({ timeout: 15000 });
    const cardId = await page.locator('[data-pick-card]').first().getAttribute('data-pick-card');
    await page.evaluate((id) => {
      localStorage.setItem('i7_card_counts', JSON.stringify({ [id!]: 1 }));
      localStorage.setItem('i7_card_skill_levels', JSON.stringify({ [id!]: [3] }));
      localStorage.removeItem('i7_score_calc_state');
    }, cardId);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );
    await page.locator('[data-slot-btn="0"]').click();
    await page.locator(`[data-pick-card="${cardId}"]`).first().waitFor({ timeout: 15000 });
    await page.locator(`[data-pick-card="${cardId}"]`).first().click();
    await expect(page.locator('#card-picker-modal')).toBeHidden();

    await expect(page.locator('select[data-skill-slot="0"]')).toHaveValue('3');

    // 未所持の衣装は従来どおり 5
    await page.locator('[data-slot-btn="1"]').click();
    await page.locator('#modal-owned-only').uncheck();
    await page.locator('[data-pick-card]').nth(1).waitFor({ timeout: 15000 });
    await page.locator('[data-pick-card]').nth(1).click();
    await expect(page.locator('select[data-skill-slot="1"]')).toHaveValue('5');

    await page.evaluate(() => localStorage.clear());
  });
```

- [ ] **Step 2: E2E が失敗することを確認する**

Run: `npx playwright test tests/score-calc.test.ts -g "所持 Lv を登録"`
Expected: FAIL（`select[data-skill-slot="0"]` の値が `5`）

- [ ] **Step 3: `ScoreCalc.svelte` を修正する**

import に追加（13 行目の `deckState` import を書き換え、ストア import を追加）:

```ts
  import { createEmptyDeckState, swapSlots, clampSharedBroachs, setCard, clearSlot, defaultSkillLevelFor, SLOT_LABELS } from '../lib/score/deckState';
  import { getCount, reloadFromStorage as reloadCardCounts } from '../lib/stores/cardCounts.svelte';
  import { sortedLevels, reloadSkillLevelsFromStorage } from '../lib/stores/cardSkillLevels.svelte';
```

`handlePick` を書き換え:

```ts
  function handlePick(slot: number, card: Card) {
    setCard(deckState, slot, card, defaultTierFor(card), allBroachsState);
    // 所持 Lv（降順）から既定 Lv を決める。同じ衣装が他スロットに k 枚あれば k+1 枚目の Lv
    const alreadyUsed = deckState.cards.filter((c, i) => i !== slot && c?.ID === card.ID).length;
    deckState.skillLevels[slot] = defaultSkillLevelFor(sortedLevels(card.ID, getCount(card.ID)), alreadyUsed);
    saveState();
  }
```

`onMount`（289 行目）の先頭にある `reloadBroachCountsFromStorage();` の直後に追加:

```ts
    reloadCardCounts();
    reloadSkillLevelsFromStorage();
```

- [ ] **Step 4: E2E が通ることを確認する**

Run: `npx playwright test tests/score-calc.test.ts -g "所持 Lv を登録"`
Expected: PASS

- [ ] **Step 5: 型チェックと lint、既存のスコア計算 E2E**

```bash
npm run typecheck
npm run lint
npx playwright test tests/score-calc.test.ts tests/score-calc-persistence.test.ts
```

Expected: エラー 0、E2E 全 pass

- [ ] **Step 6: コミット**

```bash
git add src/components/ScoreCalc.svelte tests/score-calc.test.ts
git commit -m "✨ スコア計算で衣装を置いたとき所持スキル Lv をスロットの既定にする"
```

---

### Task 5: 編成組合計算のコアで所持 Lv を評価に使う

**Files:**
- Modify: `src/lib/score/maxScoreFinder.ts`（`SearchInput` / `DeckRecord` / `evaluateDeck` / `SEARCH_SKILL_LEVELS`）
- Test: `tests/unit/score/maxScoreFinder.test.ts`（末尾に describe 追記）

**Interfaces:**
- Consumes: `SkillLevel`（`deckState.ts`）
- Produces:
  - `SearchInput.ownedSkillLevels?: Record<string, SkillLevel[]>`（cardId 文字列 → 降順 Lv。省略可。`ownedOnly` 時のみ使う）
  - `DeckRecord.skillLevels?: SkillLevel[]`（`ownedOnly` 時に評価に使った 6 要素）
  - `deckSkillLevels(ctx: SearchContext, deck: (Card | null)[]): SkillLevel[]`（export。スロット 0-4 は所持 Lv、5 は 5。`ownedOnly` false なら全 5）

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/maxScoreFinder.test.ts` の import に `deckSkillLevels` を追加し、末尾に追記:

```ts
describe('所持スキル Lv の評価 (ADR 0085)', () => {
  const a = testCandidates[0];
  const b = testCandidates[3];
  const ownedCounts = { [String(a.ID)]: 2, [String(b.ID)]: 1 };
  const ownedSkillLevels = { [String(a.ID)]: [5, 3] as (1 | 2 | 3 | 4 | 5)[], [String(b.ID)]: [2] as (1 | 2 | 3 | 4 | 5)[] };
  const deck = [a, a, b, a, b, a]; // a は 0-4 に 3 枚（所持 2 枚 → 3 枚目は 5）、フレンドは a

  it('deckSkillLevels: ownedOnly のとき手前の出現回数を添字に所持 Lv を引き、範囲外とフレンドは 5', () => {
    const ctx = createSearchContext(buildInput({ ownedOnly: true, ownedCounts, ownedSkillLevels }));
    expect(deckSkillLevels(ctx, deck)).toEqual([5, 3, 2, 5, 5, 5]);
  });

  it('deckSkillLevels: ownedOnly でなければ全 5、ownedSkillLevels 省略時も全 5', () => {
    expect(deckSkillLevels(createSearchContext(buildInput({ ownedCounts, ownedSkillLevels })), deck)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(deckSkillLevels(createSearchContext(buildInput({ ownedOnly: true, ownedCounts })), deck)).toEqual([5, 5, 5, 5, 5, 5]);
  });

  it('evaluateDeck: 所持 Lv を下げるとスコアが下がり、skillLevels が記録される', () => {
    const full = evaluateDeck(createSearchContext(buildInput({ ownedOnly: true, ownedCounts })), deck);
    const lowered = evaluateDeck(createSearchContext(buildInput({ ownedOnly: true, ownedCounts, ownedSkillLevels })), deck);
    expect(full.skillLevels).toEqual([5, 5, 5, 5, 5, 5]);
    expect(lowered.skillLevels).toEqual([5, 3, 2, 5, 5, 5]);
    expect(lowered.score).toBeLessThan(full.score);
  });

  it('evaluateDeck: ownedOnly でなければ skillLevels を記録しない', () => {
    const rec = evaluateDeck(createSearchContext(buildInput({ ownedCounts, ownedSkillLevels })), deck);
    expect(rec.skillLevels).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/score/maxScoreFinder.test.ts`
Expected: FAIL（`deckSkillLevels` が export されていない）

- [ ] **Step 3: `maxScoreFinder.ts` を修正する**

`SearchInput` に追加（`sharedBroachCounts` の次）:

```ts
  /** cardId(文字列) → 所持 Lv（降順）。ownedOnly 時のみ使用。省略・欠けは Lv5 (ADR 0085) */
  ownedSkillLevels?: Record<string, SkillLevel[]>;
```

`SkillLevel` の import を先頭に追加:

```ts
import type { SkillLevel } from './deckState';
```

`DeckRecord` に追加（`sharedBroachIds` の次）:

```ts
  /** ownedOnly 時に評価に使ったスロットごとのスキル Lv (ADR 0085) */
  skillLevels?: SkillLevel[];
```

`SEARCH_SKILL_LEVELS` 定数の直前のコメントと定数を次に置き換える:

```ts
// 探索条件は全カード特訓済みで固定 (移植元の旧 UI 実装と同値)。
// スキル Lv は既定 5。所持衣装検索ではスロット 0-4 を所持 Lv で評価する (ADR 0085)。
// 共通ブローチは useOwnedBroachs=false ならなし固定、true なら編成ごとにグリーディ割当
const SEARCH_SKILL_LEVELS: SkillLevel[] = [5, 5, 5, 5, 5, 5];
```

`evaluateDeck` の直前に追加:

```ts
/**
 * スロットごとの評価 Lv。所持衣装検索ではスロット 0-4 の衣装が手前に k 枚出ていれば
 * 所持 Lv（降順）の k 番目を使い、範囲外とフレンド枠は 5。それ以外は全 5 (ADR 0085)
 */
export function deckSkillLevels(ctx: SearchContext, deck: (Card | null)[]): SkillLevel[] {
  const { input } = ctx;
  if (!input.ownedOnly || !input.ownedSkillLevels) return SEARCH_SKILL_LEVELS;
  const seen = new Map<number, number>();
  const out: SkillLevel[] = [5, 5, 5, 5, 5, 5];
  for (let i = 0; i < 5; i++) {
    const id = deck[i]?.ID;
    if (id === null || id === undefined) continue;
    const k = seen.get(id) ?? 0;
    seen.set(id, k + 1);
    out[i] = input.ownedSkillLevels[String(id)]?.[k] ?? 5;
  }
  return out;
}
```

`evaluateDeck` 内の `computeTeam` 呼び出しとレコード生成を書き換え:

```ts
  const skillLevels = deckSkillLevels(ctx, deck);
  const team = computeTeam(
    deck, input.broachs, input.song, tiers, SEARCH_TRAINED, undefined,
    shared, skillLevels, input.rabbitNotes, FINDER_BROACH_OPTIONS
  );
  const exclusion = computeShrinkExclusion(team, ctx.groupSizes);
  const notes = flattenNotes(input.song, FLATTEN_SEED, exclusion);
  const rec: DeckRecord = {
    cardIds: deck.map((c) => c!.ID!),
    score: 0,
  };
  if (input.useOwnedBroachs) rec.sharedBroachIds = shared;
  if (input.ownedOnly) rec.skillLevels = skillLevels;
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/score/`
Expected: PASS（既存の maxScoreFinder 系 3 ファイルも `ownedSkillLevels` が省略可なので変更不要）

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/maxScoreFinder.ts tests/unit/score/maxScoreFinder.test.ts
git commit -m "✨ 編成組合計算の所持衣装検索でスロットの評価 Lv に所持スキル Lv を使う"
```

---

### Task 6: 編成組合計算の UI を所持 Lv に対応させる

**Files:**
- Modify: `src/components/MaxScoreFinder.svelte:37-38`（import）、`:111-112`（onMount reload）、`:165-189`（`buildSearchInput`）
- Modify: `src/components/score/SearchResults.svelte:46-72`（`sendToScoreCalc` / `bestContext`）、`:197`（詳細表の Lv）
- Modify: `src/pages/score-calc/max-score-finder/index.astro:36`（本文）、`:54`（ToolGuide steps の「所持条件とブローチを設定する」）

**Interfaces:**
- Consumes: `sortedLevels` / `reloadSkillLevelsFromStorage`（Task 1）、`SearchInput.ownedSkillLevels` / `DeckRecord.skillLevels`（Task 5）

- [ ] **Step 1: `MaxScoreFinder.svelte` で `ownedSkillLevels` を渡す**

import に追加:

```ts
  import { sortedLevels, reloadSkillLevelsFromStorage } from '../lib/stores/cardSkillLevels.svelte';
```

`onMount` 内の `reloadCardCounts();` の直後に追加:

```ts
    reloadSkillLevelsFromStorage();
```

`buildSearchInput` の `ownedCounts` 組み立てループを次に置き換え:

```ts
    const ownedCounts: Record<string, number> = {};
    const ownedSkillLevels: Record<string, SkillLevel[]> = {};
    for (const c of ownedCandidates) {
      if (c.ID === null || c.ID === undefined) continue;
      const n = ownedCountOf(c);
      ownedCounts[String(c.ID)] = n;
      ownedSkillLevels[String(c.ID)] = sortedLevels(c.ID, n);
    }
```

戻り値のオブジェクトに `ownedCounts,` の次で `ownedSkillLevels,` を追加。`SkillLevel` 型の import を追加:

```ts
  import type { SkillLevel } from '../lib/score/deckState';
```

- [ ] **Step 2: `SearchResults.svelte` で記録された Lv を使う**

`<script>` に導出を追加（`bestContext` の直前）:

```ts
  const ALL_LV5: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
  const bestSkillLevels = $derived(result.best.skillLevels ?? ALL_LV5);
```

`sendToScoreCalc` の `skillLevels: [5, 5, 5, 5, 5, 5],` を `skillLevels: [...bestSkillLevels],` に。

`bestContext` 内の `const skillLevels: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];` を `const skillLevels = bestSkillLevels;` に。

詳細表 197 行目の `{@const sl = getApSkillLevel(card, 5)}` を `{@const sl = getApSkillLevel(card, bestSkillLevels[i])}` に。

- [ ] **Step 3: ページ本文と ToolGuide を更新する**

`src/pages/score-calc/max-score-finder/index.astro` 36 行目:

```
    <br />特訓済み前提で評価します。スキルレベルは既定 Lv5 で、「所持衣装で検索」を ON にすると衣装一覧で登録したスキル Lv（センターとメンバー4枚）で評価します。フレンド枠は Lv5 のままです。固有ブローチは条件を満たすものを自動装着してスコアに反映します（衣装詳細表示で確認できます）。共通ブローチは既定では未装着として扱います。「所持共通ブローチを割り当てる」を ON にすると、登録済みの所持ブローチを自動で割り当てます。
```

ToolGuide の「所持条件とブローチを設定する」の `body` を:

```
'「所持衣装で検索」を ON にすると、手元にある衣装だけで組める編成に絞れます。このとき衣装一覧で登録したスキル Lv でスコアを評価します（未登録は Lv5、フレンド枠は常に Lv5）。共通ブローチは、所持数を登録したうえで「所持共通ブローチを割り当てる」を ON にすると、効果が高くなる割り当ても含めて探索します。どちらも既定は OFF です。'
```

- [ ] **Step 4: 型チェック・lint・単体テスト**

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Expected: エラー 0、全 pass

- [ ] **Step 5: ブラウザで動作確認する**

dev サーバー（`http://localhost:4321/`）で:

1. `/cards/` で開催中（または直近）のハイスコアイベントの金特効 UR を 1 枚所持・Lv2 に登録する
2. `/score-calc/max-score-finder/` で同イベント・任意の楽曲を選び、「所持衣装で検索」ON で探索する
3. 結果の衣装詳細表で該当衣装のスキル効果が Lv2 の値で表示されること、「スコア計算へ送る」でスロットの Lv が 2 で引き継がれることを確認する
4. スクリーンショットを `tmp/` に保存する
5. 確認後 `astro dev stop`

- [ ] **Step 6: 編成組合計算の既存 E2E**

Run: `npx playwright test tests/max-score-finder.test.ts`
Expected: PASS（CPU バウンドなので時間がかかる）

- [ ] **Step 7: コミット**

```bash
git add src/components/MaxScoreFinder.svelte src/components/score/SearchResults.svelte src/pages/score-calc/max-score-finder/index.astro
git commit -m "✨ 編成組合計算の所持衣装検索で登録したスキル Lv を結果表示と解説に反映する"
```

---

### Task 7: 仕上げ（全体検証と PR）

**Files:**
- なし（検証のみ）

- [ ] **Step 1: 全体の品質チェック**

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Expected: エラー 0、全 pass

- [ ] **Step 2: 変更に関わる E2E をまとめて回す**

dev サーバー起動状態で:

```bash
npx playwright test tests/card-list.test.ts tests/mycard.test.ts tests/score-calc.test.ts tests/score-calc-persistence.test.ts tests/max-score-finder.test.ts
```

Expected: 全 pass（`mycard.test.ts` は Task 3 で復元した `data-count-input` を使う）

- [ ] **Step 3: バックアップの往復を確認する**

dev サーバーで所持数と Lv を登録し、フッターの「エクスポート」で JSON を保存 → `localStorage.clear()` → 「インポート」で戻し、衣装一覧の Lv セレクトが復元されることを確認する（`STORAGE_KEYS` 列挙による自動対象化の実地確認）。

- [ ] **Step 4: ユーザーにスクリーンショットを提示し、確認を取る**

`tmp/` の画像を提示し、UI の見た目（3 表示モードの Lv セレクト、編成組合計算の結果表）に問題がないか確認を取る。

- [ ] **Step 5: push して PR を作成する（base は `develop`）**

```bash
git push -u origin feat/owned-card-skill-levels
gh pr create --base develop --title "✨ 所持衣装のスキル Lv を保存してスコア計算・編成組合計算に反映する (ADR 0085)" --body "$(cat <<'EOF'
## 概要
- 所持衣装ごとに 1 枚単位のスキル Lv を `i7_card_skill_levels` に保存する（衣装一覧の所持数入力の横で編集）
- スコア計算で衣装を置いたとき、所持 Lv をスロットの既定 Lv にする
- 編成組合計算の「所持衣装で検索」でセンター・メンバー4枚を所持 Lv で評価し、結果表示・スコア計算への引き渡しにも反映する
- 未登録は Lv5 扱い。既存データ・バックアップ形式はそのまま

## 関連
- ADR 0085 / `docs/superpowers/specs/2026-09-09-owned-card-skill-levels-design.md`

## 確認
- [ ] `npm run typecheck` / `npm run lint` / `npm run test:unit`
- [ ] E2E: card-list / mycard / score-calc / score-calc-persistence / max-score-finder
EOF
)"
```

以降のリリース（`develop` → `main` fast-forward）と告知ツイート作成は `release` / `release-tweet` スキルに従う。
