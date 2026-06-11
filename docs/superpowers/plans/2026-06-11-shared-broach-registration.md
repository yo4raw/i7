# 共通ブローチ所持登録と各計算機能への反映 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダーメニューに「各種登録」ドロップダウンを新設して共通ブローチ所持登録ページを追加し、スコア計算・編成組合計算で所持共通ブローチを反映できるようにする。

**Architecture:** 所持数は `i7_shared_broach_counts`（`Record<broachId, number>`）に保存し、`cardCounts.svelte.ts` と同型の runes ストアで読み書きする。スコア計算は選択肢フィルタのみ（データは壊さない）。編成組合計算は「ブローチ効果が装着カード非依存」という性質を利用し、候補編成ごとの解析的グリーディ割当（探索空間は増やさない）。

**Tech Stack:** Astro 6 / Svelte 5 (runes) / Tailwind CSS v4 / Vitest / Playwright

**Spec:** `docs/superpowers/specs/2026-06-11-shared-broach-registration-design.md`

---

## Phase 1: メニュー再編 + 登録ページ + 用語統一

ブランチ: `feature/shared-broach-registration`

### Task 1: localStorage キーと所持数ストア

**Files:**
- Modify: `src/lib/storage.ts:8-16`
- Create: `src/lib/stores/broachCounts.svelte.ts`

- [ ] **Step 1: `STORAGE_KEYS` に `SHARED_BROACH_COUNTS` を追加**

```ts
export const STORAGE_KEYS = {
  CARD_COUNTS: 'i7_card_counts',
  RABBIT_NOTES: 'i7_rabbit_notes',
  SELECTED_SONGS: 'i7_selected_songs',
  SAVED_DECKS: 'i7_saved_decks',
  SCORE_CALC_STATE: 'i7_score_calc_state',
  SHARED_BROACH_COUNTS: 'i7_shared_broach_counts',
  CARD_LIST_VIEW_MODE: 'i7_card_list_view_mode',
  THEME_MODE: 'i7_theme_mode',
} as const;
```

`FooterTools.svelte` は `Object.values(STORAGE_KEYS)` を走査するため、これだけでバックアップ対象になる。

- [ ] **Step 2: `src/lib/stores/broachCounts.svelte.ts` を作成**（`cardCounts.svelte.ts` と同型 + 上限 10 クランプ）

```ts
import { STORAGE_KEYS, loadJson, saveJson } from '../storage';

type CountMap = Record<string, number>;

/** 自チーム 5 枠 × 2 個が使用上限のため、登録もこの個数までで十分 */
export const MAX_BROACH_COUNT = 10;

let counts = $state<CountMap>(typeof window !== 'undefined' ? loadJson<CountMap>(STORAGE_KEYS.SHARED_BROACH_COUNTS, {}) : {});

function persist() {
  saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, counts);
}

export function getBroachCount(broachId: number | string): number {
  return counts[String(broachId)] || 0;
}

export function setBroachCount(broachId: number | string, value: number) {
  const v = Math.min(MAX_BROACH_COUNT, Math.max(0, Math.floor(value || 0)));
  const key = String(broachId);
  if (v === 0) {
    delete counts[key];
  } else {
    counts[key] = v;
  }
  persist();
}

export function deltaBroachCount(broachId: number | string, delta: number) {
  setBroachCount(broachId, getBroachCount(broachId) + delta);
}

export function allBroachCounts(): CountMap {
  return counts;
}

export function totalOwnedBroachs(): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export function reloadBroachCountsFromStorage() {
  const fresh = loadJson<CountMap>(STORAGE_KEYS.SHARED_BROACH_COUNTS, {});
  for (const key of Object.keys(counts)) {
    if (!(key in fresh)) delete counts[key];
  }
  for (const [k, v] of Object.entries(fresh)) {
    counts[k] = v;
  }
}
```

- [ ] **Step 3: コミット** `feat(shared-broach): 共通ブローチ所持数の localStorage キーとストアを追加`

### Task 2: HeaderNav のドロップダウン汎用化と「各種登録」追加

**Files:**
- Modify: `src/components/HeaderNav.svelte`

- [ ] **Step 1: state とアイテム定義を汎用化**

`scoreCalcOpen` / `scoreCalcMobileOpen` / `scoreCalcWrapper` を廃止し、ラベルキーの開閉管理に置き換える:

```ts
let mobileOpen = $state(false);
let openDropdown = $state<string | null>(null);
let mobileDropdownOpen = $state<Record<string, boolean>>({});
const dropdownWrappers = new Map<string, HTMLLIElement>();

function registerDropdown(node: HTMLLIElement, label: string) {
  dropdownWrappers.set(label, node);
  return { destroy() { dropdownWrappers.delete(label); } };
}

function toggleDropdown(label: string) {
  openDropdown = openDropdown === label ? null : label;
}
```

`items` のラビットノート行を「各種登録」ドロップダウンに差し替え:

```ts
const items: NavItem[] = [
  { href: base, label: 'ホーム' },
  { href: `${base}cards/`, label: '衣装一覧' },
  { href: `${base}songs/`, label: '楽曲一覧' },
  { href: `${base}events/`, label: 'イベント情報' },
  { href: `${base}mycard/`, label: '所持衣装' },
  {
    label: 'スコア計算',
    children: [
      { href: `${base}score-calc/`, label: 'スコア計算' },
      { href: `${base}score-calc/max-score-finder/`, label: '編成組合計算' },
    ],
  },
  {
    label: '各種登録',
    children: [
      { href: `${base}rabbit-note/`, label: 'ラビットノート' },
      { href: `${base}shared-broach/`, label: '共通ブローチ' },
    ],
  },
  { href: `${base}decks/`, label: '保存デッキ' },
];
```

`$effect` 内の clickHandler / keyHandler を汎用化:

```ts
const clickHandler = (e: MouseEvent) => {
  if (openDropdown === null) return;
  const wrapper = dropdownWrappers.get(openDropdown);
  if (wrapper && !wrapper.contains(e.target as Node)) {
    openDropdown = null;
  }
};
// keyHandler: Escape で openDropdown = null
```

- [ ] **Step 2: テンプレートをラベルキー参照に変更**

デスクトップ側 `{#if isDropdown(item)}` ブロック:

```svelte
<li class="relative" use:registerDropdown={item.label}>
  <button ... aria-expanded={openDropdown === item.label} onclick={() => toggleDropdown(item.label)}>
    {item.label}
    <svg class="w-3 h-3 transition-transform" class:rotate-180={openDropdown === item.label} ...>
  </button>
  {#if openDropdown === item.label}
    <ul role="menu" ...>（既存と同じ children ループ）</ul>
  {/if}
</li>
```

モバイル側は `scoreCalcMobileOpen` を `mobileDropdownOpen[item.label]` に置換（`onclick={() => mobileDropdownOpen[item.label] = !mobileDropdownOpen[item.label]}`）。

- [ ] **Step 3: `npm run dev` で表示確認**（2 つのドロップダウンが独立に開閉・外側クリックで閉じる・モバイル表示）
- [ ] **Step 4: コミット** `feat(nav): ドロップダウンを汎用化し「各種登録」メニューを追加`

### Task 3: 共通ブローチ登録ページ

**Files:**
- Create: `src/components/SharedBroachEditor.svelte`
- Create: `src/pages/shared-broach/index.astro`

- [ ] **Step 1: `SharedBroachEditor.svelte` を作成**

```svelte
<script lang="ts">
  import { SHARED_BROACHS, type SharedBroach } from '../lib/data/sharedBroachs';
  import { getBroachCount, setBroachCount, deltaBroachCount, totalOwnedBroachs, MAX_BROACH_COUNT } from '../lib/stores/broachCounts.svelte';

  type GroupKey = 'ALL' | 'Shout' | 'Beat' | 'Melody' | '条件付き';
  const GROUP_ORDER: GroupKey[] = ['ALL', 'Shout', 'Beat', 'Melody', '条件付き'];
  const GROUP_COLORS: Record<GroupKey, string> = {
    ALL: 'border-l-indigo-500',
    Shout: 'border-l-red-500',
    Beat: 'border-l-green-500',
    Melody: 'border-l-blue-500',
    '条件付き': 'border-l-purple-500',
  };

  function groupOf(sb: SharedBroach): GroupKey {
    if (sb.targetAttribute) return '条件付き';
    if (sb.shout && sb.beat && sb.melody) return 'ALL';
    if (sb.shout) return 'Shout';
    if (sb.beat) return 'Beat';
    return 'Melody';
  }

  const groups = GROUP_ORDER.map((name) => ({
    name,
    broachs: SHARED_BROACHS.filter((sb) => groupOf(sb) === name),
  }));

  function statsLabel(sb: SharedBroach): string {
    const stats: string[] = [];
    if (sb.shout) stats.push(`S+${sb.shout}`);
    if (sb.beat) stats.push(`B+${sb.beat}`);
    if (sb.melody) stats.push(`M+${sb.melody}`);
    return sb.targetAttribute ? `${sb.targetAttribute}属性枚数 × ${stats.join('/')}` : stats.join('/');
  }

  function onInput(e: Event, id: number) {
    const v = parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0;
    setBroachCount(id, v);
  }
</script>
```

テンプレート: グループごとの `<section>`（`RabbitNoteEditor` のスタイル踏襲）。各行に名前 + `statsLabel` + −/+ ボタン + 数値入力（`min=0 max={MAX_BROACH_COUNT}`）。テスト用に `data-broach-input={sb.id}` / `data-broach-btn={sb.id}` + `data-delta` を付与する。末尾に合計所持数 `{totalOwnedBroachs()}` 表示とクリアボタン（confirm 後に全 setBroachCount(id, 0)）。ダークバリアント必須（`bg-white dark:bg-slate-800` 等）。

- [ ] **Step 2: `src/pages/shared-broach/index.astro` を作成**（rabbit-note と同構成）

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import SharedBroachEditor from '../../components/SharedBroachEditor.svelte';
---

<BaseLayout title="共通ブローチ">
  <h1 class="text-2xl font-bold mb-4">共通ブローチ</h1>
  <p class="text-sm text-gray-600 dark:text-slate-300 mb-6">所持している共通ブローチの個数を登録してください。スコア計算の「所持ブローチ縛り」と編成組合計算のブローチ割当で使用されます。スコア計算に影響するのは最大10個（センター+メンバー4枠 × 2個）です。</p>

  <SharedBroachEditor client:load />
</BaseLayout>
```

- [ ] **Step 3: `npm run dev` で表示・入力・リロード後の永続化を確認**
- [ ] **Step 4: コミット** `feat(shared-broach): 共通ブローチ所持登録ページを追加`

### Task 4: 用語統一とドキュメント更新

**Files:**
- Modify: `src/components/score/DeckSlots.svelte:386`（「共有ブローチ…を選択」→「共通ブローチ…を選択」）
- Modify: `src/pages/score-calc/max-score-finder/index.astro:34`（「共有ブローチは未装着として扱います」→「共通ブローチは未装着として扱います」）
- Modify: `CLAUDE.md`（用語ポリシーに「共有ブローチ→表示は『共通ブローチ』」、Page Patterns 表 + STORAGE_KEYS 表に行追加）

- [ ] **Step 1: 上記 3 ファイルを修正**（内部識別子 `sharedBroach` / `SHARED_BROACHS` は変更しない）
- [ ] **Step 2: `grep -rn "共有ブローチ" src/` で残りがコメントのみであることを確認**
- [ ] **Step 3: コミット** `docs: ユーザー可視テキストを「共通ブローチ」に統一`

### Task 5: E2E テスト + ADR + リリース

**Files:**
- Create: `tests/shared-broach.test.ts`
- Create: `docs/adr/0004-shared-broach-registration.md`（README.md の一覧表にも行追加）

- [ ] **Step 1: E2E テストを作成**

```ts
import { test, expect } from '@playwright/test';
import { SITE_NAME } from '../src/lib/constants';

const BASE = '/i7';

test.describe('共通ブローチ登録ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/shared-broach/`);
  });

  test('タイトルが正しい', async ({ page }) => {
    await expect(page).toHaveTitle(new RegExp(`共通ブローチ.*${SITE_NAME}`));
  });

  test('+ボタンで所持数が増え localStorage に保存される', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('button[data-broach-btn="1"][data-delta="1"]').click();
    await expect(page.locator('input[data-broach-input="1"]')).toHaveValue('1');
    const stored = await page.evaluate(() => localStorage.getItem('i7_shared_broach_counts'));
    expect(JSON.parse(stored!)['1']).toBe(1);
  });

  test('ヘッダーの「各種登録」から遷移できる', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: '各種登録' }).click();
    await page.getByRole('menuitem', { name: '共通ブローチ' }).click();
    await expect(page).toHaveURL(new RegExp('/shared-broach/'));
  });
});
```

- [ ] **Step 2: ADR 0004 を作成**（メニュー再編・用語統一・所持登録の決定。グリーディ割当採用と総当たり却下も記録）
- [ ] **Step 3: `npm run test:unit` → 全 PASS、`npm run test` → 全 PASS（build 込み 5〜7 分）**
- [ ] **Step 4: push → PR 作成 → merge**

## Phase 2: スコア計算ページに「所持ブローチ縛り」

ブランチ: `feature/shared-broach-score-calc`

### Task 6: 在庫計算の純粋モジュール（TDD）

**Files:**
- Create: `src/lib/score/broachInventory.ts`
- Test: `tests/unit/score/broachInventory.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { countUsedBroachs, broachViolations } from '../../../src/lib/score/broachInventory';

describe('broachInventory', () => {
  it('countUsedBroachs: slot 0-4 のみ数え、フレンド枠(5)は無視する', () => {
    const shared = [[1], [1, 2], [], [], [3], [1, 1]];
    const used = countUsedBroachs(shared);
    expect(used.get(1)).toBe(2);
    expect(used.get(2)).toBe(1);
    expect(used.get(3)).toBe(1);
  });

  it('countUsedBroachs: excludeSlot/excludeIdx で対象セレクト自身を除外できる', () => {
    const shared = [[1], [1, 2], [], [], [], []];
    const used = countUsedBroachs(shared, 1, 0);
    expect(used.get(1)).toBe(1);
  });

  it('countUsedBroachs: 0 (未選択) は数えない', () => {
    const used = countUsedBroachs([[0, 1], [], [], [], [], []]);
    expect(used.get(1)).toBe(1);
    expect(used.has(0)).toBe(false);
  });

  it('broachViolations: 所持数超過の broachId を返す', () => {
    const shared = [[1, 1], [1], [], [2], [], []];
    expect(broachViolations(shared, { '1': 2, '2': 1 })).toEqual([1]);
    expect(broachViolations(shared, { '1': 3, '2': 1 })).toEqual([]);
  });
});
```

- [ ] **Step 2: `npm run test:unit` → FAIL を確認**
- [ ] **Step 3: 実装**

```ts
/**
 * 共通ブローチ所持数と装備状況の突合ヘルパ。
 * 所持制約の対象は自チーム 5 枠 (slot 0-4) のみ。フレンド枠 (slot 5) は対象外。
 */

/** slot 0-4 で使用中の共通ブローチ個数を broachId ごとに数える */
export function countUsedBroachs(
  sharedBroachs: number[][],
  excludeSlot?: number,
  excludeIdx?: number,
): Map<number, number> {
  const used = new Map<number, number>();
  for (let slot = 0; slot <= 4; slot++) {
    const arr = sharedBroachs[slot] ?? [];
    for (let idx = 0; idx < arr.length; idx++) {
      if (slot === excludeSlot && idx === excludeIdx) continue;
      const id = arr[idx];
      if (!id) continue;
      used.set(id, (used.get(id) ?? 0) + 1);
    }
  }
  return used;
}

/** 所持数を超過して装備されている broachId のリスト (slot 0-4 のみ対象) */
export function broachViolations(
  sharedBroachs: number[][],
  counts: Record<string, number>,
): number[] {
  const over: number[] = [];
  for (const [id, n] of countUsedBroachs(sharedBroachs)) {
    if (n > (counts[String(id)] ?? 0)) over.push(id);
  }
  return over;
}
```

- [ ] **Step 4: `npm run test:unit` → PASS**
- [ ] **Step 5: コミット** `feat(score): 共通ブローチ在庫突合ヘルパを追加`

### Task 7: DeckSlots の選択肢制限と ScoreCalc のトグル

**Files:**
- Modify: `src/components/score/DeckSlots.svelte`
- Modify: `src/components/ScoreCalc.svelte`

- [ ] **Step 1: DeckSlots に props 追加と選択肢フィルタ実装**

props に `ownedBroachLimit: boolean` と `broachCounts: Record<string, number>` を追加。`countUsedBroachs` を import し:

```ts
/** 所持ブローチ縛り時の選択肢。slot 5 (フレンド) と OFF 時は全種を返す */
function selectableBroachs(slot: number, idx: number): SharedBroach[] {
  if (!ownedBroachLimit || slot === 5) return SHARED_BROACHS;
  const used = countUsedBroachs(deckState.sharedBroachs, slot, idx);
  const current = deckState.sharedBroachs[slot]?.[idx] ?? 0;
  return SHARED_BROACHS.filter((sb) => {
    if (sb.id === current) return true; // 選択中は常に残す
    return (broachCounts[String(sb.id)] ?? 0) - (used.get(sb.id) ?? 0) > 0;
  });
}
```

テンプレートの `{#each SHARED_BROACHS as sb (sb.id)}` を `{#each selectableBroachs(i, s) as sb (sb.id)}` に変更。

- [ ] **Step 2: ScoreCalc にトグル + 永続化 + 警告/未登録案内を追加**

```ts
import { allBroachCounts, reloadBroachCountsFromStorage, totalOwnedBroachs } from '../lib/stores/broachCounts.svelte';
import { broachViolations } from '../lib/score/broachInventory';
import { SHARED_BROACHS } from '../lib/data/sharedBroachs';

let ownedBroachLimit = $state(false);

const broachCounts = $derived(allBroachCounts());
const violationNames = $derived(
  broachViolations(deckState.sharedBroachs, broachCounts)
    .map((id) => SHARED_BROACHS.find((sb) => sb.id === id)?.name ?? `#${id}`)
);
```

- `buildStateObject()` に `ownedBroachLimit` を追加、`applyState()` に `if (typeof state.ownedBroachLimit === 'boolean') ownedBroachLimit = state.ownedBroachLimit;` を追加
- `onMount` で `reloadBroachCountsFromStorage()` を呼ぶ
- スキルオプション section にチェックボックス:

```svelte
<label class="flex items-center gap-2">
  <input type="checkbox" id="opt-owned-broach-limit" class="rounded" bind:checked={ownedBroachLimit} onchange={saveState} />
  <span>所持ブローチ縛り（登録した共通ブローチの所持数の範囲で選択。フレンド枠は対象外）</span>
</label>
```

- デッキ編成 section 内 `<DeckSlots …/>` の直後に案内/警告:

```svelte
{#if ownedBroachLimit && totalOwnedBroachs() === 0}
  <p class="mt-2 text-xs text-amber-600">共通ブローチが未登録です。<a class="underline" href={`${base}shared-broach/`}>共通ブローチ登録ページ</a>で所持数を登録してください。</p>
{/if}
{#if ownedBroachLimit && violationNames.length > 0}
  <p class="mt-2 text-xs text-red-600">⚠️ 所持数を超える共通ブローチが装備されています: {violationNames.join('、')}（選択し直すと所持数の範囲に制限されます）</p>
{/if}
```

- `<DeckSlots>` に `ownedBroachLimit={ownedBroachLimit} broachCounts={broachCounts}` を渡す

- [ ] **Step 3: `npm run dev` で動作確認**（トグル ON で選択肢が絞られる・他スロット装備分が在庫から引かれる・フレンド枠は全種・OFF で従来どおり・リロードでトグル状態復元）
- [ ] **Step 4: `npm run test:unit` → PASS、コミット** `feat(score-calc): 所持ブローチ縛りトグルを追加`
- [ ] **Step 5: push → PR 作成 → merge**

## Phase 3: 編成組合計算へのブローチ割当

ブランチ: `feature/shared-broach-finder`

### Task 8: グリーディ割当モジュール（TDD）

**Files:**
- Create: `src/lib/score/broachAssignment.ts`
- Test: `tests/unit/score/broachAssignment.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

合成カード（`{ rarity: 'UR', attribute: 'シャウト', cardID: 'c1' } as unknown as Card` 形式）で以下を検証:

```ts
import { describe, it, expect } from 'vitest';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import {
  calcAttrWeights, countDeckAttrs, broachValue, broachCapacity, assignBroachs,
} from '../../../src/lib/score/broachAssignment';
import type { FlatNote } from '../../../src/lib/score/types';

const ur = (attribute: string, cardID: string): Card =>
  ({ rarity: 'UR', attribute, cardID } as unknown as Card);
const sr = (attribute: string, cardID: string): Card =>
  ({ rarity: 'SR', attribute, cardID } as unknown as Card);

// Shout 偏重の重み (Shout ノーツのみの譜面相当)
const W = { Shout: 10, Beat: 1, Melody: 1 };
const noFixed = () => false;

describe('broachAssignment', () => {
  it('calcAttrWeights: ノーツの属性ごとに NOTE_RATE×LIGHT_MULTIPLIER を合算する', () => {
    const notes = [
      { attribute: 'Shout', type: 'white', group: 'normal' },
      { attribute: 'Beat', type: 'color', group: 'normal' },
    ] as unknown as FlatNote[];
    const w = calcAttrWeights(notes);
    expect(w.Shout).toBeGreaterThan(0);
    expect(w.Beat).toBeGreaterThan(w.Shout); // color > white
    expect(w.Melody).toBe(0);
  });

  it('broachCapacity: UR=2 / 固有ブローチ持ち UR=1 / UR 以外=0', () => {
    expect(broachCapacity(ur('シャウト', 'a'), noFixed)).toBe(2);
    expect(broachCapacity(ur('シャウト', 'a'), () => true)).toBe(1);
    expect(broachCapacity(sr('シャウト', 'a'), noFixed)).toBe(0);
    expect(broachCapacity(null, noFixed)).toBe(0);
  });

  it('broachValue: 条件付きブローチは対象属性枚数を乗じる', () => {
    const sb = { id: 24, name: 'S枚数分', shout: 300, beat: 0, melody: 0, targetAttribute: 'Shout' as const };
    expect(broachValue(sb, W, { Shout: 3, Beat: 0, Melody: 0 })).toBe(300 * 10 * 3);
    expect(broachValue(sb, W, { Shout: 0, Beat: 3, Melody: 0 })).toBe(0);
  });

  it('assignBroachs: 寄与値の高い順に所持数の範囲で slot 0-4 に割当てる', () => {
    const deck = [ur('シャウト', 'a'), ur('シャウト', 'b'), null, null, null, null];
    // Shout1100(id=6) 1個 + ALL750(id=1) 3個 所持 → Shout 偏重なら Shout1100 が先頭
    const sel = assignBroachs(deck, { '6': 1, '1': 3 }, W, noFixed);
    const own = [...sel[0], ...sel[1]];
    expect(own).toHaveLength(4); // 容量 2+2
    expect(own.filter((id) => id === 6)).toHaveLength(1); // 所持 1 個まで
    expect(own.filter((id) => id === 1)).toHaveLength(3);
  });

  it('assignBroachs: 所持合計が容量未満ならあるだけ割当てる', () => {
    const deck = [ur('シャウト', 'a'), null, null, null, null, null];
    const sel = assignBroachs(deck, { '1': 1 }, W, noFixed);
    expect(sel[0]).toEqual([1]);
  });

  it('assignBroachs: フレンド枠は所持制約なしで最良ブローチを重複割当てる', () => {
    const deck = [null, null, null, null, null, ur('シャウト', 'f')];
    const sel = assignBroachs(deck, {}, W, noFixed);
    expect(sel[5]).toHaveLength(2);
    expect(sel[5][0]).toBe(sel[5][1]); // 同種 2 個
    expect(sel[5][0]).toBe(6); // Shout1100 が Shout 偏重で最良
  });

  it('assignBroachs: 固有ブローチ持ちフレンドは 1 個のみ', () => {
    const deck = [null, null, null, null, null, ur('シャウト', 'f')];
    const sel = assignBroachs(deck, {}, W, (c) => c.cardID === 'f');
    expect(sel[5]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: `npm run test:unit` → FAIL を確認**
- [ ] **Step 3: 実装**

```ts
/**
 * 編成組合計算用の共通ブローチ・グリーディ割当。
 *
 * 共通ブローチの効果は装着カードに依存しない（条件付きブローチもデッキ全体の
 * 属性枚数で決まる）ため、候補編成ごとに「装備可能枠数 × 寄与値上位」の貪欲割当が
 * 線形近似のもとで最適になる。ブローチ組合せの総当たりは行わない (ADR 0004)。
 */
import type { Card } from '../data/fetchCardsJson';
import type { FlatNote, AttributeName } from './types';
import { normalizeAttribute } from './types';
import { NOTE_RATE, LIGHT_MULTIPLIER } from './constants';
import { SHARED_BROACHS, type SharedBroach } from '../data/sharedBroachs';

export interface AttrWeights {
  Shout: number;
  Beat: number;
  Melody: number;
}

/** 楽曲ノーツから属性 1 ポイントあたりのスコア寄与重みを線形近似で求める (floor 無視) */
export function calcAttrWeights(notes: FlatNote[]): AttrWeights {
  const w: AttrWeights = { Shout: 0, Beat: 0, Melody: 0 };
  for (const n of notes) {
    w[n.attribute] += NOTE_RATE[n.type] * LIGHT_MULTIPLIER[n.group];
  }
  return w;
}

/** デッキ 6 枠の属性別カード枚数 (条件付きブローチの倍率算出用、teamBuilder と同じ規則) */
export function countDeckAttrs(deck: (Card | null)[]): Record<AttributeName, number> {
  const counts: Record<AttributeName, number> = { Shout: 0, Beat: 0, Melody: 0 };
  for (const c of deck) {
    if (!c) continue;
    const a = normalizeAttribute(c.attribute);
    if (a in counts) counts[a]++;
  }
  return counts;
}

/** ブローチ 1 個あたりの重み付き寄与値 */
export function broachValue(
  sb: SharedBroach,
  weights: AttrWeights,
  attrCounts: Record<AttributeName, number>,
): number {
  const mult = sb.targetAttribute ? attrCounts[sb.targetAttribute] : 1;
  return (sb.shout * weights.Shout + sb.beat * weights.Beat + sb.melody * weights.Melody) * mult;
}

/** カード 1 枚の共通ブローチ装備可能数 (UR のみ、固有ブローチ持ちは 1 / それ以外は 2) */
export function broachCapacity(card: Card | null, hasFixedBroach: (card: Card) => boolean): number {
  if (!card || card.rarity !== 'UR') return 0;
  return hasFixedBroach(card) ? 1 : 2;
}

/**
 * slot 0-4 に所持共通ブローチを寄与値降順でグリーディ割当し、
 * slot 5 (フレンド) には全種から最良ブローチを容量分割当てた selections を返す。
 */
export function assignBroachs(
  deck: (Card | null)[],
  ownedCounts: Record<string, number>,
  weights: AttrWeights,
  hasFixedBroach: (card: Card) => boolean,
): number[][] {
  const attrCounts = countDeckAttrs(deck);
  const selections: number[][] = [[], [], [], [], [], []];

  const units: { id: number; value: number }[] = [];
  for (const sb of SHARED_BROACHS) {
    const n = ownedCounts[String(sb.id)] ?? 0;
    if (n <= 0) continue;
    const v = broachValue(sb, weights, attrCounts);
    if (v <= 0) continue;
    for (let i = 0; i < n; i++) units.push({ id: sb.id, value: v });
  }
  units.sort((a, b) => b.value - a.value);

  let u = 0;
  for (let slot = 0; slot <= 4 && u < units.length; slot++) {
    const cap = broachCapacity(deck[slot], hasFixedBroach);
    for (let k = 0; k < cap && u < units.length; k++) {
      selections[slot].push(units[u++].id);
    }
  }

  const friendCap = broachCapacity(deck[5], hasFixedBroach);
  if (friendCap > 0) {
    let best: SharedBroach | null = null;
    let bestValue = 0;
    for (const sb of SHARED_BROACHS) {
      const v = broachValue(sb, weights, attrCounts);
      if (v > bestValue) {
        best = sb;
        bestValue = v;
      }
    }
    if (best) {
      for (let k = 0; k < friendCap; k++) selections[5].push(best.id);
    }
  }
  return selections;
}
```

- [ ] **Step 4: `npm run test:unit` → PASS、コミット** `feat(score): 共通ブローチのグリーディ割当モジュールを追加`

### Task 9: maxScoreFinder への組み込み

**Files:**
- Modify: `src/lib/score/maxScoreFinder.ts`
- Test: `tests/unit/score/maxScoreFinder.test.ts`（追記）

- [ ] **Step 1: 型と SearchContext を拡張**

`SearchInput` に追加:

```ts
  /** 所持共通ブローチを slot 0-4 にグリーディ割当する (false なら従来どおりブローチなし) */
  useOwnedBroachs: boolean;
  /** broachId(文字列) → 所持数 (useOwnedBroachs 時に使用) */
  sharedBroachCounts: Record<string, number>;
```

`SearchContext` に追加:

```ts
  attrWeights: AttrWeights;
  hasFixedBroach: (card: Card) => boolean;
```

`createSearchContext` 内:

```ts
  const fixedIds = new Set(input.broachs.map((b) => b.card_id));
  const notes = flattenNotes(input.song, FLATTEN_SEED);
  return {
    ...,
    attrWeights: calcAttrWeights(notes),
    hasFixedBroach: (c) => fixedIds.has(c.cardID),
    notesCount: input.song.notes_count || notes.length,
  };
```

`DeckRecord` に追加: `sharedBroachIds?: number[][];`

- [ ] **Step 2: `evaluateDeck` で割当を適用**

```ts
  let shared: number[][] = SEARCH_EMPTY_SHARED;
  if (input.useOwnedBroachs) {
    shared = assignBroachs(deck, input.sharedBroachCounts, ctx.attrWeights, ctx.hasFixedBroach);
  }
  const team = computeTeam(
    deck, input.broachs, input.song, tiers, SEARCH_TRAINED, undefined,
    shared, SEARCH_SKILL_LEVELS, input.rabbitNotes
  );
  ...
  const rec: DeckRecord = { cardIds: ..., score: 0 };
  if (input.useOwnedBroachs) rec.sharedBroachIds = shared;
```

`SEARCH_EMPTY_SHARED` 上のコメントを「useOwnedBroachs=false 時はブローチなし固定」に更新。

- [ ] **Step 3: 既存テストの SearchInput 構築箇所に `useOwnedBroachs: false, sharedBroachCounts: {}` を追加し、回帰がないことを確認**
- [ ] **Step 4: 統合テストを追記**（フィクスチャの楽曲・UR カードで `useOwnedBroachs: true` + `{ '1': 2 }` のとき `evaluateDeck` のスコアが false 時以上になり、`sharedBroachIds` の slot 0-4 合計が min(2, 容量) になる）
- [ ] **Step 5: `npm run test:unit` → PASS、コミット** `feat(max-score-finder): 探索評価に所持共通ブローチ割当を組み込み`

### Task 10: MaxScoreFinder UI と SearchResults 表示

**Files:**
- Modify: `src/components/MaxScoreFinder.svelte`
- Modify: `src/components/score/SearchResults.svelte`
- Modify: `src/pages/score-calc/max-score-finder/index.astro`（説明文）

- [ ] **Step 1: MaxScoreFinder にトグル追加**

```ts
import { allBroachCounts, reloadBroachCountsFromStorage, totalOwnedBroachs } from '../lib/stores/broachCounts.svelte';

let useOwnedBroachs = $state(false);
const ownedBroachTotal = $derived(totalOwnedBroachs());
```

- `$effect` の refresh ブロックに `reloadBroachCountsFromStorage();` を追加
- `buildSearchInput()` に追加: `useOwnedBroachs: useOwnedBroachs && ownedBroachTotal > 0, sharedBroachCounts: { ...allBroachCounts() },`
- 検索オプション section（shrinkPairOnly の下）にチェックボックスと未登録案内:

```svelte
<label class="flex items-center gap-2 text-xs">
  <input type="checkbox" bind:checked={useOwnedBroachs} class="rounded" />
  <span><b>所持共通ブローチを割り当てる</b> — 登録した共通ブローチを所持数の範囲でセンター + メンバー4枠に自動割当します。フレンド枠は全種から推奨ブローチを割当（OFF はブローチなしで探索）</span>
</label>
{#if useOwnedBroachs && ownedBroachTotal === 0}
  <p class="text-[11px] text-amber-600 pl-6">共通ブローチが未登録のため、ブローチなしで探索します。<a class="underline" href={`${base}shared-broach/`}>共通ブローチ登録ページ</a>で所持数を登録してください。</p>
{/if}
```

- [ ] **Step 2: SearchResults に割当ブローチを反映**

- `bestContext` の `computeTeam` / `sendToScoreCalc` の `sharedBroachs` を `result.best.sharedBroachIds ?? [[], [], [], [], [], []]` に変更（属性合計・+表示に共通ブローチ分が乗る）
- `import { SHARED_BROACHS } from '../../lib/data/sharedBroachs';` を追加し、衣装詳細テーブルに「共通ブローチ」列を追加:

```svelte
<td class="py-1 px-1">
  {#each (result.best.sharedBroachIds?.[i] ?? []) as id}
    {@const sb = SHARED_BROACHS.find((b) => b.id === id)}
    {#if sb}<div class="text-[9px] text-purple-700">💠 {sb.name}</div>{/if}
  {:else}
    <span class="text-[10px] text-gray-300 dark:text-slate-600">—</span>
  {/each}
</td>
```

（ヘッダー行にも `<th>共通ブローチ</th>` を追加。フレンド行の割当は「推奨」を含意するため `title="推奨ブローチ"` を付ける）

- [ ] **Step 3: max-score-finder ページ説明文を更新**（「共通ブローチは未装着として扱います」→「共通ブローチは未装着として扱います（『所持共通ブローチを割り当てる』ON 時は登録した所持ブローチを自動割当します）」）
- [ ] **Step 4: `npm run dev` で動作確認**（トグル ON で探索 → スコア上昇・衣装詳細に割当表示・スコア計算ページへ送ると共通ブローチ装備済み・OFF で従来結果と一致）
- [ ] **Step 5: ADR 0004 のステータス確認・必要なら追記、`npm run test:unit` + `npm run test` → PASS**
- [ ] **Step 6: コミット → push → PR 作成 → merge → リリースタグ発行**（`git tag v1.x.x && git push origin v1.x.x`）

## 線形性の前提検証（Task 8 実施時）

`calcNoteScore` は `floor(appeal × NOTE_RATE) × LIGHT_MULTIPLIER` の floor を含むため厳密には非線形だが、属性値に対して単調非減少。グリーディ割当は「floor を無視した線形近似での厳密最適」であり、floor による誤差はノーツあたり最大 1 点 × 倍率で、ブローチ寄与値（数百〜千単位の属性値 × ノーツ数）に対して無視できる。この近似採用を ADR 0004 に明記する。

## 各フェーズ共通の検証フロー

1. `npm run dev` をバックグラウンド起動し、Playwright MCP / chrome-devtools MCP でスクリーンショットを `tmp/` に保存
2. `npm run test:unit`（約 1 秒）
3. フェーズ最終コミット前に `npm run test`（build 込み 5〜7 分、timeout 600000ms）
4. コミットメッセージは Conventional Commits（リリースノートは git タグから自動生成されるため、メッセージ自体がリリースノートになる）
