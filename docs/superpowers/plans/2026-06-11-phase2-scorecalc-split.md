# Phase 2: ScoreCalc.svelte の分割 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/components/ScoreCalc.svelte`（約 1799 行、onMount 内の命令的 DOM 操作）を責務単位の子コンポーネント + lib に分割し、`innerHTML` 直接代入 0・宣言的 Runes ベースにする（スペック: `docs/superpowers/specs/2026-06-10-phased-refactoring-design.md` の Phase 2）。

**Architecture:** ストラングラー方式。各タスクで 1 責務を抽出し、抽出部分だけ Svelte 5 Runes の宣言的レンダリングに移行。親の deck 状態は `$state` の deep proxy（`DeckState`）として最初に確立し、以降の子コンポーネントはそれを props で受けて自動反応する。**完全に振る舞い保存**（UI・計算結果・localStorage キー/形式・共有 URL 形式を変えない）。各タスク = 1 ブランチ = 1 PR で main に逐次マージ。

**Tech Stack:** Svelte 5 (Runes: $state/$derived/$props) / TypeScript / Vitest / Playwright

**前提資料:** ScoreCalc.svelte の構造マップ（状態変数・関数一覧・呼び出し関係）は本プラン作成時に作成済み。実装者は対象の行範囲を必ず実ファイルで確認すること（タスク進行により行番号は前後にずれる）。

**ブランチ・PR 運用:** 各タスク冒頭でコントローラが main から `refactor/phase2-<name>` ブランチを作成。実装サブエージェントはコミットまで、push / PR / マージはコントローラ。

**各タスク共通の検証コマンド**（「共通検証」）:

```bash
npm run typecheck      # 0 errors
npm run test:unit      # 全 PASS（Task 2 以降 230+ 件）
npx playwright test    # dev サーバー (:4321) 再利用で全 PASS。score-calc が並列起因でタイムアウトしたら該当のみ単独再実行して PASS を確認
```

dev サーバーはコントローラが起動済み（HMR、再起動不要）。

**移植の原則:** 「ロジックの移植」と書かれたステップは、指定した既存関数の本体を**改変せずそのまま移す**こと（変数名の機械的な読み替えのみ可）。挙動の「改善」は禁止。HTML 文字列生成（innerHTML 代入）を Svelte テンプレートに変換する際は、**class 集合・テキスト・要素構造を変えない**こと。ヒストグラム等の SVG 文字列は `{@html ...}` で埋め込む（`.innerHTML =` 代入は廃止）。

---

### Task 1: E2E 補強 — 保存/読込/共有 URL の安全網（Phase 2 の事前準備）

**Branch:** `refactor/phase2-e2e-persistence`

**Files:**
- Create: `tests/score-calc-persistence.test.ts`

分割手術で最も壊れやすいのは E2E 未カバーの永続化系フロー。先にテストで固定する。実装コードは変更しない。

- [ ] **Step 1: テストを書く**

```typescript
import { test, expect } from '@playwright/test';

const BASE = '';

/** 楽曲を選択し、センタースロットに先頭の衣装を配置する共通操作 */
async function buildMinimalDeck(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('#song-select option').length > 1,
    undefined,
    { timeout: 20000 },
  );
  const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
  await page.locator('#song-select').selectOption(firstValue!);
  await page.locator('[data-slot-btn="0"]').click();
  await page.locator('#modal-owned-only').uncheck();
  await page.locator('[data-pick-card]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-pick-card]').first().click();
  await expect(page.locator('#card-picker-modal')).toBeHidden();
  return firstValue!;
}

test.describe('スコア計算ページ 永続化フロー', () => {
  test('編成状態がリロード後も localStorage から復元される', async ({ page }) => {
    await page.goto(`${BASE}/score-calc/`);
    const songValue = await buildMinimalDeck(page);

    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );
    await expect(page.locator('#song-select')).toHaveValue(songValue);
    await expect(page.locator('[data-slot-btn="0"] img').first()).toBeVisible();
  });

  test('デッキ保存 → 読込で編成が復元される', async ({ page }) => {
    await page.goto(`${BASE}/score-calc/`);
    await buildMinimalDeck(page);

    page.once('dialog', (d) => d.accept('E2Eテストデッキ'));
    await page.locator('#btn-save-deck').click();

    // 編成をクリア（ピッカーのクリアボタン）してから読込
    await page.locator('[data-slot-btn="0"]').click();
    await page.locator('#modal-clear').click();
    await expect(page.locator('[data-slot-btn="0"] img')).toHaveCount(0);

    await page.locator('#btn-load-deck').click();
    await page.locator('.load-deck-item').first().click();
    await expect(page.locator('[data-slot-btn="0"] img').first()).toBeVisible();
  });

  test('共有 URL から編成が復元される', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${BASE}/score-calc/`);
    await buildMinimalDeck(page);

    await page.locator('#btn-share-url').click();
    const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(sharedUrl).toContain('/score-calc/');

    // クリーンな状態（localStorage なし）で共有 URL を開く
    const fresh = await context.newPage();
    await fresh.goto(sharedUrl);
    await fresh.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );
    await expect(fresh.locator('[data-slot-btn="0"] img').first()).toBeVisible({ timeout: 15000 });
  });
});
```

※ 実 DOM の挙動（保存時 prompt の有無、クリア時の img 消滅、share URL の形式）が想定と違って FAIL する場合は、`ScoreCalc.svelte` の該当関数（`saveDeck` / `shareDeckUrl` / `modal-clear` ハンドラ）を読んで**テスト側を実態に合わせる**こと（実装は変更しない）。変更点は報告に明記。

- [ ] **Step 2: 実行して 3 PASS を確認**

Run: `npx playwright test tests/score-calc-persistence.test.ts`
Expected: 3 passed

- [ ] **Step 3: コミット**

```bash
git add tests/score-calc-persistence.test.ts
git commit -m "test(e2e): スコア計算ページの保存/読込/共有URLフローのテストを追加"
```

---

### Task 2: DeckState の抽出と $state 化（スペック 2.1）

**Branch:** `refactor/phase2-deck-state`

**Files:**
- Create: `src/lib/score/deckState.ts`
- Create: `tests/unit/score/deckState.test.ts`
- Modify: `src/components/ScoreCalc.svelte`（5 つの状態配列 → `$state` の DeckState に統合）

- [ ] **Step 1: deckState.ts を作る**

```typescript
import type { Card } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { EventBonusTier } from '../data/eventBonusTiers';

export type SkillLevel = 1 | 2 | 3 | 4 | 5;

export const DECK_SIZE = 6;
export const SLOT_LABELS = ['センター', 'メンバー1', 'メンバー2', 'メンバー3', 'メンバー4', 'フレンド'] as const;
export const DISPLAY_ORDER = [1, 2, 0, 3, 4, 5] as const;

/** スコア計算デッキの編成状態（6 スロット: 0=センター, 1-4=メンバー, 5=フレンド） */
export interface DeckState {
  cards: (Card | null)[];
  bonusTiers: EventBonusTier[];
  trained: boolean[];
  sharedBroachs: number[][];
  skillLevels: SkillLevel[];
}

export function createEmptyDeckState(): DeckState {
  return {
    cards: Array(DECK_SIZE).fill(null),
    bonusTiers: Array(DECK_SIZE).fill('none'),
    trained: Array(DECK_SIZE).fill(true),
    sharedBroachs: Array.from({ length: DECK_SIZE }, () => []),
    skillLevels: Array(DECK_SIZE).fill(5),
  };
}

/** 2 スロットの全属性（カード/特効/特訓/共有ブローチ/スキルLv）を交換する */
export function swapSlots(state: DeckState, a: number, b: number): void {
  // ScoreCalc.svelte の swapDeckSlots() の本体を移植（境界チェック含む）
}

/**
 * 共有ブローチ装備数の検証・切り詰め。
 * UR 以外は 0 個。UR は固有ブローチ持ちなら 1 個まで、なければ 2 個まで。
 */
export function clampSharedBroachs(state: DeckState, slotIndex: number, allBroachs: FixedBroach[]): void {
  // ScoreCalc.svelte の validateSharedBroachs() の本体を移植
}

/** カードをスロットに配置し、デフォルト特効を設定して共有ブローチを検証する */
export function setCard(
  state: DeckState,
  slotIndex: number,
  card: Card,
  defaultTier: EventBonusTier,
  allBroachs: FixedBroach[],
): void {
  // ScoreCalc.svelte のピッカー選択ハンドラのロジック
  // （deck[slot] = card; deckBonusTiers[slot] = defaultTierFor(card); validateSharedBroachs(slot)）を移植
}

/** スロットを空に戻す（modal-clear ハンドラのロジックを移植。各属性の初期値も既存と同一にする） */
export function clearSlot(state: DeckState, slotIndex: number): void {
  // ScoreCalc.svelte の modal-clear イベントハンドラの本体を移植
}
```

各関数の本体は ScoreCalc.svelte の既存実装（`swapDeckSlots` 行 175 付近 / `validateSharedBroachs` 行 71 付近 / ピッカー選択ハンドラ 行 780 付近 / `modal-clear` ハンドラ 行 1346 付近）を読んで**そのまま移植**する。引数名 `deck` → `state.cards` 等の機械的読み替えのみ可。

- [ ] **Step 2: 単体テストを書く**

```typescript
import { describe, it, expect } from 'vitest';
import { createEmptyDeckState, swapSlots, clampSharedBroachs, setCard, clearSlot, DECK_SIZE } from '../../../src/lib/score/deckState';
import { allBroachs, findCardById, findBroachsByCardId } from '../../fixtures';

/** 10th Anniversary 四葉環 (UR、固有ブローチあり) */
const urWithBroach = findCardById(2484);

describe('deckState (デッキ編成状態の操作)', () => {
  it('createEmptyDeckState: 6 スロットすべて初期値', () => {
    const s = createEmptyDeckState();
    expect(s.cards).toEqual(Array(DECK_SIZE).fill(null));
    expect(s.bonusTiers).toEqual(Array(DECK_SIZE).fill('none'));
    expect(s.trained).toEqual(Array(DECK_SIZE).fill(true));
    expect(s.sharedBroachs).toEqual([[], [], [], [], [], []]);
    expect(s.skillLevels).toEqual(Array(DECK_SIZE).fill(5));
  });

  it('setCard: カード配置 + デフォルト特効 + 共有ブローチ検証', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'gold', allBroachs);
    expect(s.cards[0]).toBe(urWithBroach);
    expect(s.bonusTiers[0]).toBe('gold');
  });

  it('swapSlots: 全属性が入れ替わる', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'gold', allBroachs);
    s.trained[0] = false;
    s.skillLevels[0] = 3;
    swapSlots(s, 0, 2);
    expect(s.cards[2]).toBe(urWithBroach);
    expect(s.cards[0]).toBeNull();
    expect(s.bonusTiers[2]).toBe('gold');
    expect(s.trained[2]).toBe(false);
    expect(s.skillLevels[2]).toBe(3);
  });

  it('clampSharedBroachs: 固有ブローチ持ち UR は共有ブローチ 1 個まで', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'none', allBroachs);
    expect(findBroachsByCardId(2484).length).toBeGreaterThan(0); // 前提確認
    s.sharedBroachs[0] = [1, 2];
    clampSharedBroachs(s, 0, allBroachs);
    expect(s.sharedBroachs[0]).toEqual([1]);
  });

  it('clampSharedBroachs: カードなしスロットは共有ブローチ 0 個', () => {
    const s = createEmptyDeckState();
    s.sharedBroachs[1] = [1];
    clampSharedBroachs(s, 1, allBroachs);
    expect(s.sharedBroachs[1]).toEqual([]);
  });

  it('clearSlot: スロットが初期値に戻る', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'gold', allBroachs);
    s.trained[0] = false;
    clearSlot(s, 0);
    expect(s.cards[0]).toBeNull();
    expect(s.bonusTiers[0]).toBe('none');
  });
});
```

※ `clearSlot` 後の trained / skillLevels の期待値は**既存 modal-clear ハンドラの実装**を読んで合わせる（変えるのは期待値であって実装ではない）。

Run: `npx vitest run tests/unit/score/deckState.test.ts` → 6 PASS

- [ ] **Step 3: ScoreCalc.svelte を DeckState に乗せ換える**

1. script 最上位（onMount の**外**）に追加:
   ```typescript
   import { createEmptyDeckState, swapSlots, clampSharedBroachs, setCard, clearSlot, SLOT_LABELS, DISPLAY_ORDER } from '../lib/score/deckState';
   const deckState = $state(createEmptyDeckState());
   ```
2. onMount 内の `let deck` / `deckBonusTiers` / `deckTrained` / `deckSharedBroachs` / `deckSkillLevels` の 5 宣言と、ローカル `SLOT_LABELS` / `DISPLAY_ORDER` 定義を**削除**する。typecheck が全参照箇所をエラーとして列挙するので、それをチェックリストとして `deck` → `deckState.cards`、`deckBonusTiers` → `deckState.bonusTiers`（以下同様）に置き換える。
3. `swapDeckSlots()` / `validateSharedBroachs()` 関数本体を削除し、呼び出しを `swapSlots(deckState, a, b)` / `clampSharedBroachs(deckState, i, allBroachs)` に置換。ピッカー選択ハンドラと modal-clear ハンドラの本体を `setCard(...)` / `clearSlot(...)` 呼び出しに置換（`defaultTierFor(card)` は引き続き親で計算して渡す）。
4. `grep -n 'deckBonusTiers\|deckTrained\|deckSharedBroachs\|deckSkillLevels\|swapDeckSlots\|validateSharedBroachs' src/components/ScoreCalc.svelte` → ヒット 0 件（`deckState.` 経由のみ）

- [ ] **Step 4: 共通検証**（unit は 228+ に増加）+ `npx playwright test tests/score-calc-persistence.test.ts tests/score-calc.test.ts` を必ず含める

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/deckState.ts tests/unit/score/deckState.test.ts src/components/ScoreCalc.svelte
git commit -m "refactor(score-calc): デッキ編成状態を DeckState として lib に抽出"
```

---

### Task 3: CardPickerModal.svelte の抽出（スペック 2.2）

**Branch:** `refactor/phase2-card-picker`

**Files:**
- Create: `src/components/score/CardPickerModal.svelte`
- Modify: `src/components/ScoreCalc.svelte`（モーダル関連のテンプレート・関数・イベント登録を削除し、子コンポーネントに置換）

- [ ] **Step 1: CardPickerModal.svelte を作る**

公開インターフェース（厳守 — 後続タスクが依存）:

```svelte
<script lang="ts">
  import type { Card } from '../../lib/data/fetchCardsJson';

  let { allCards, onPick, onClear }: {
    allCards: Card[];
    /** 衣装が選択された (slotIndex は open() で渡されたもの) */
    onPick: (slotIndex: number, card: Card) => void;
    /** クリアボタン (slotIndex のスロットを空にする) */
    onClear: (slotIndex: number) => void;
  } = $props();

  let visible = $state(false);
  let slotIndex = $state(-1);
  let slotLabel = $state('');
  let searchText = $state('');       // debounce 後の確定値
  let rarity = $state('');
  let attribute = $state('');
  let ownedOnly = $state(false);

  /** 親（命令的コード）から呼ぶ: モーダルを開く。フィルタは毎回リセット（既存挙動） */
  export function open(slot: number, label: string): void { /* 既存 openCardPicker の状態リセットを移植。ownedOnly はスロット 0〜4 で true、5 で false（既存挙動を実装から確認して合わせる） */ }
  export function close(): void { visible = false; slotIndex = -1; }
</script>
```

- テンプレートは ScoreCalc.svelte の `#card-picker-modal` ブロック（行 1760 付近〜末尾）を移植し、`hidden` class 切替を `{#if visible}` に、`#modal-card-list` の HTML 文字列生成（`renderModalCards`）を `$derived` の filtered 配列 + `{#each filtered.slice(0, 200) as card}` に変換する。**行の class・構造・表示内容（バッジ・合計値・スキル種別）は既存生成 HTML と同一にする**こと。
- フィルタロジックは既存 `renderModalCards` の filter 部を移植（`cardTextMatches` / rarity / `normalizeAttribute(attribute)` / ownedOnly + `loadJson(STORAGE_KEYS.CARD_COUNTS)`）。件数表示 `${filtered.length}件` も維持。
- 検索入力の 200ms デバウンスを維持: `<input oninput={...}>` で `setTimeout` 後に `searchText` を更新（既存挙動の保存）。
- DOM id（`card-picker-modal` / `modal-search` / `modal-rarity` / `modal-attribute` / `modal-owned-only` / `modal-result-count` / `modal-clear` / `modal-close` / `modal-close-x` / `modal-backdrop` / `modal-slot-label` / `data-pick-card` 属性）は **E2E が依存しているためすべて維持**する。
- backdrop / close ボタン / × ボタンのクリックで `close()`。クリアボタンで `onClear(slotIndex)` → `close()`。カード行クリックで `onPick(slotIndex, card)` → `close()`。

- [ ] **Step 2: ScoreCalc.svelte を子コンポーネントに乗せ換える**

1. テンプレートに `<CardPickerModal bind:this={picker} allCards={...} onPick={...} onClear={...} />` を追加（`let picker: ReturnType<typeof CardPickerModal> | undefined;` を最上位に。onMount 内からは `picker!.open(slot, SLOT_LABELS[slot])` で開く）。
   - **注意**: onMount 内コードは `allCards` をローカル変数（refreshData で更新）として持つ。最上位に `let allCardsState = $state<Card[]>(initialCards)` を導入して props に渡し、onMount 内の `allCards` 再代入箇所で `allCardsState = fresh` も更新する（または onMount 内変数を廃止して `allCardsState` に一本化する — どちらでも可、一本化推奨）。
2. `onPick` コールバック: `setCard(deckState, slot, card, defaultTierFor(card), allBroachs); renderDeckSlots(); recalculate(); saveState();`（既存ピッカー選択ハンドラと同一の後続処理）。`onClear`: `clearSlot(deckState, slot); renderDeckSlots(); recalculate(); saveState();`（既存 modal-clear と同一）。
3. 旧コードの削除: `openCardPicker` / `closeCardPicker` / `renderModalCards` 関数、モーダル関連のイベント登録（backdrop/close/clear/search debounce/rarity/attribute/owned-only）、テンプレートの `#card-picker-modal` ブロック。
4. `grep -n 'renderModalCards\|openCardPicker\|closeCardPicker\|modalDebounce' src/components/ScoreCalc.svelte` → 0 件

- [ ] **Step 3: 共通検証** — 特に `tests/score-calc.test.ts`（ピッカー操作）と `tests/score-calc-persistence.test.ts`（クリア操作）が必須。加えて dev サーバーでピッカーを目視確認（開閉・検索・絞り込み・所持のみ・選択・クリア）し、スクリーンショットを `tmp/phase2-picker.png` に保存。

- [ ] **Step 4: コミット**

```bash
git add src/components/score/CardPickerModal.svelte src/components/ScoreCalc.svelte
git commit -m "refactor(score-calc): 衣装選択モーダルを CardPickerModal に抽出 (Runes 化)"
```

---

### Task 4: DeckSlots.svelte の抽出 — D&D 含む（スペック 2.3）

**Branch:** `refactor/phase2-deck-slots`

**Files:**
- Create: `src/components/score/DeckSlots.svelte`
- Modify: `src/components/ScoreCalc.svelte`（スロット表示・D&D・`renderDeckSlots` を削除）

- [ ] **Step 1: selectedSong を $state に昇格**

`ScoreCalc.svelte` 最上位に `let selectedSong = $state<Song | null>(null);` を宣言し、onMount 内の `let selectedSong` を削除（閉包参照はそのまま動く。typecheck で全参照を確認）。

- [ ] **Step 2: DeckSlots.svelte を作る**

公開インターフェース（厳守）:

```svelte
<script lang="ts">
  import type { Card } from '../../lib/data/fetchCardsJson';
  import type { FixedBroach } from '../../lib/data/fetchFixedBroachsJson';
  import type { Song } from '../../lib/data/fetchSongsJson';
  import type { DeckState, SkillLevel } from '../../lib/score/deckState';
  import type { EventBonusTier } from '../../lib/data/eventBonusTiers';

  let { deckState, selectedSong, allBroachs, onSlotClick, onSwap, onChanged }: {
    deckState: DeckState;            // 親の $state proxy（mutate は親側）
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
    /** 空/カードありスロットのタップ（ピッカーを開く） */
    onSlotClick: (slotIndex: number) => void;
    /** D&D でスロット交換が確定した */
    onSwap: (a: number, b: number) => void;
    /** スロット内の select/checkbox 変更（tier/trained/skillLevel/sharedBroachs）。
        値の更新は子が deckState に直接行い、その後この通知で親が再計算+保存する */
    onChanged: () => void;
  } = $props();
</script>
```

- テンプレート: ScoreCalc.svelte の `#deck-slots` グリッド（`data-slot` / `data-slot-btn` 構造）と、`renderDeckSlots()`（行 311〜510 付近）が生成していたスロット内部 HTML（サムネ・バッジ・特訓チェック・特効 select・スキルLv select・共有ブローチ select・縮小順警告）を `{#each}` + `$derived` で宣言的に再現する。`resolveDeckBroachs` による表示（固有ブローチ行）と `applyBonusTierStyle` 相当の select class 切替（`EVENT_BONUS_TIERS` の selectClasses）も移植。**DOM id / data 属性 / class 集合 / 表示文字列は既存生成 HTML と同一**（E2E とユーザー見た目の互換）。
- D&D: `attachSlotPointerHandlers` / `createDragGhost` / `moveDragGhost` / `destroyDragGhost` / `findDropTargetSlot` / `highlightDropTarget` / `clearDropHighlight`（行 189〜309 付近）を移植。ドロップ確定で `onSwap(a, b)` を呼ぶ（配列操作は親）。クリック判定（threshold 未満）は `onSlotClick(i)`。
- select/checkbox の change: 子が `deckState.bonusTiers[i] = ...` 等を直接 mutate（$state proxy なので親と共有）してから `onChanged()`。
- バッジは Phase 1 の `RarityBadge` / `AttributeBadge`（`../ui/`）を sizeClass 引数付きで利用してよい（class 集合一致が条件）。

- [ ] **Step 3: ScoreCalc.svelte を乗せ換える**

1. テンプレートの `#deck-slots` 内スロット骨格を `<DeckSlots deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} onSlotClick={...} onSwap={...} onChanged={...} />` に置換（`allBroachs` も Task 3 の `allCardsState` と同様に `$state` 化して一本化する）。
2. コールバック実装: `onSlotClick`: `picker!.open(slot, SLOT_LABELS[slot])`。`onSwap`: `swapSlots(deckState, a, b); renderCardDetailTable(); recalculate(); saveState();`（既存 swap 後処理と同一）。`onChanged`: 既存の各 change ハンドラ後処理と同一（`renderCardDetailTable(); recalculate(); saveState();` — 既存実装でハンドラ毎に差があれば**広い方**（renderDeckSlots 相当は子が自動反応するため不要）に合わせ、差異を報告に明記）。
3. 旧コードの削除: `renderDeckSlots` / `applyBonusTierStyle` / D&D 関連 7 関数 / `attachSlotPointerHandlers` の呼び出し。`renderDeckSlots()` の呼び出し箇所（applyState / ピッカー後 / クリア後 等）は削除（子が deckState の変更に自動反応する）。ただし**それらの呼び出し直後にあった `renderCardDetailTable()` / `recalculate()` / `updateCalcButton()` は残す**こと。
4. `grep -n 'renderDeckSlots\|attachSlotPointerHandlers\|DragGhost\|data-slot-btn' src/components/ScoreCalc.svelte` → テンプレート側の残骸 0 件（DeckSlots 内のみに存在）

- [ ] **Step 4: 共通検証** + dev サーバーで D&D（スロット入れ替え）・特効/特訓/スキルLv/共有ブローチ変更を**目視確認**し `tmp/phase2-deck-slots.png` を保存。E2E 全件 + persistence 3 件必須。

- [ ] **Step 5: コミット**

```bash
git add src/components/score/DeckSlots.svelte src/components/ScoreCalc.svelte
git commit -m "refactor(score-calc): 編成スロットを DeckSlots に抽出 (D&D 含む Runes 化)"
```

---

### Task 5: CardDetailTable.svelte の抽出（スペック 2.4 前半）

**Branch:** `refactor/phase2-card-detail`

**Files:**
- Create: `src/components/score/CardDetailTable.svelte`
- Modify: `src/components/ScoreCalc.svelte`（`renderCardDetailTable` と該当テンプレートを削除）

- [ ] **Step 1: CardDetailTable.svelte を作る**

```svelte
<script lang="ts">
  // props（厳守）
  let { deckState, selectedSong, allBroachs }: {
    deckState: DeckState;
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
  } = $props();
</script>
```

- ScoreCalc.svelte の `#card-detail-section`（details 要素・thead 含む）テンプレートと `renderCardDetailTable()`（行 521〜712 付近: 属性値・ブローチ加算・特効倍率・特訓減算・センタースキル・ラビットノートの計算と tbody/tfoot 生成）を移植。計算部は `$derived.by` で行データ配列を作り、`{#each}` で描画する。**数値・桁区切り・class・行順（DISPLAY_ORDER）は既存と同一**。
- デッキが空のときの非表示（`hidden`）は `{#if}` で同等に。
- `loadRabbitNotes()` は計算時に都度読む既存挙動を維持（`$derived` 内で呼ぶとリアクティブ再評価で再読込されるが、既存も recalculate 毎に読んでいるため同等）。

- [ ] **Step 2: ScoreCalc.svelte を乗せ換える**

`<CardDetailTable deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} />` に置換し、`renderCardDetailTable` 関数・呼び出し（recalculate 内・onChanged 内等）・旧テンプレートを削除。呼び出し削除後も他の後続処理（recalculate / saveState）は残す。
`grep -n 'renderCardDetailTable\|card-detail-body\|card-detail-foot' src/components/ScoreCalc.svelte` → 0 件

- [ ] **Step 3: 共通検証** + dev サーバーで衣装詳細テーブルの数値が変更前と一致することを目視確認（同一編成でビフォー/アフターのスクリーンショット比較、`tmp/phase2-card-detail.png`）。

- [ ] **Step 4: コミット**

```bash
git add src/components/score/CardDetailTable.svelte src/components/ScoreCalc.svelte
git commit -m "refactor(score-calc): 衣装詳細テーブルを CardDetailTable に抽出"
```

---

### Task 6: ScoreCalcResults.svelte の抽出（スペック 2.4 後半）

**Branch:** `refactor/phase2-results`

**Files:**
- Create: `src/components/score/ScoreCalcResults.svelte`
- Modify: `src/components/ScoreCalc.svelte`

- [ ] **Step 1: ScoreCalcResults.svelte を作る**

計算結果系の全セクション（スキル詳細 breakdown / 理論値 min・max / MC 入力＋計算ボタン＋プログレス / 最終結果 / MC 統計＋ヒストグラム / タブ 3 枚: 期待値・スキル発動・面積値）と、それらを駆動する関数（`recalculate` の表示部・`runMC`・`renderSkillPerCard`・`updateShrinkCoverage`・`renderAreaValues`・`updateCalcButton`・`initResultTabs`・`initResultPlaceholders` 相当）を移植する。

```svelte
<script lang="ts">
  // props（厳守）
  let { deckState, selectedSong, allBroachs, scoreUpAssist, scoreUpBadgeRate }: {
    deckState: DeckState;
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
    scoreUpAssist: boolean;
    scoreUpBadgeRate: number;
  } = $props();

  let simulationResult = $state<SimulationResult | null>(null);
  // team / notes / exclusion / 理論値 / 期待値 / カバー率 / 面積値は $derived.by で計算
  // （既存 recalculate / updateShrinkCoverage / renderAreaValues の計算部を移植）
</script>
```

- 表示は `{#if}` / `{#each}` / `{@html renderHistogramSvg(...)}` で宣言的に。**`.innerHTML =` 代入は禁止**。
- `runMC` は子内の async 関数（ボタン onclick）。プログレスは `$state` の percent。試行回数 input / max-coverage チェックボックスは `bind:` で子の `$state` に。
- タブ切替は `$state` の activeTab + class 条件で再現（`data-tab` / `data-tab-panel` 属性と class 集合は既存と同一に維持 — E2E・見た目互換）。
- プレースホルダ表示（mc-placeholder / breakdown-placeholder）は `{#if}` で同等に再現し、MutationObserver（initResultPlaceholders）は**廃止**（宣言的に同じ見た目になるため。これは内部実装の置換であり表示は不変）。
- DOM id（`score-min` / `score-max` / `btn-calculate` / `mc-iterations-input` / `mc-results` / `mc-mean` / `final-result` / `calc-disabled-reason` / `progress-*` / `expected-score` / `skill-stats` / `area-values-section` / `shrink-*` 等）は維持。
- 縮小オフセット input（`shrink-offset-input`）等、結果系の入力も子に移す。

- [ ] **Step 2: ScoreCalc.svelte を乗せ換える**

1. オプション（`opt-scoreup-assist` / `opt-scoreup-badge-rate`）を最上位 `$state`（`scoreUpAssist` / `scoreUpBadgeRate`）+ `bind:` に変換し、props で子へ。変更時の `recalculate()` 相当は子の `$derived` が自動反応、`saveState()` のみ親で実行（既存挙動: badge-rate input → saveState）。
2. `<ScoreCalcResults deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} scoreUpAssist={scoreUpAssist} scoreUpBadgeRate={scoreUpBadgeRate} />` に置換。旧関数群（`recalculate` / `runMC` / `renderSkillPerCard` / `updateShrinkCoverage` / `renderAreaValues` / `updateCalcButton` / `initResultTabs` / `initResultPlaceholders`）と旧テンプレートを削除。`recalculate()` / `updateCalcButton()` の呼び出し箇所はすべて削除（子の `$derived` が代替）。`saveState()` 呼び出しは残す。
3. `buildStateObject` の badgeRate 読出しを `rootEl.querySelector` から `scoreUpBadgeRate` 参照に変更（保存形式は不変）。`applyState` の badgeRate 復元も `$state` 代入に変更。
4. `grep -n 'runMC\|recalculate\|renderSkillPerCard\|renderAreaValues\|updateCalcButton\|innerHTML' src/components/ScoreCalc.svelte` → 0 件

- [ ] **Step 3: 共通検証** — E2E 全件（score-calc.test.ts の MC 完走が核心）+ dev サーバーで同一編成の計算結果（理論値・期待値・MC 平均が試行回数固定でも分布は変わるため、理論値と期待値の一致を確認）をビフォー/アフター比較、`tmp/phase2-results.png` 保存。

- [ ] **Step 4: コミット**

```bash
git add src/components/score/ScoreCalcResults.svelte src/components/ScoreCalc.svelte
git commit -m "refactor(score-calc): 計算結果表示を ScoreCalcResults に抽出 (Runes 化)"
```

---

### Task 7: 親 ScoreCalc.svelte の Runes 化仕上げ（スペック 2.5）

**Branch:** `refactor/phase2-parent-runes`

**Files:**
- Modify: `src/components/ScoreCalc.svelte`

残る責務: 楽曲選択＋楽曲情報表示 / オプション / 保存・読込・共有 URL / 状態永続化 / データ refresh / 初期化。これらを宣言的に整理し、onMount を最小化する。

- [ ] **Step 1: 楽曲選択・楽曲情報を宣言化**

- `rebuildSongSelect` / `initSongSelect` / `renderSongInfo` を、`$derived`（pickedSongs / categorizedSongs / 属性カウント）+ テンプレート（`<select bind:value>` + `{#each}` optgroup、楽曲情報セクション、`{@html attrDonutSvg(...)}`）に変換。`#song-select` / `#song-info` 等の id は維持。
- 楽曲変更時の後続処理（saveState）は `onchange` で実施（再計算は子が自動反応）。

- [ ] **Step 2: 保存/読込/共有とstate入出力を整理**

- `buildStateObject` / `applyState` / `saveState` / `restoreState` / `tryRestoreFromUrl` / `shareDeckUrl` / `saveDeck` / `loadSavedDecks` / `writeSavedDecks` / `showLoadDropdown`（`{#if}` + `{#each}` 化）/ `hideLoadDropdown` / `loadDeck` を最上位の関数として整理（onMount 閉包から脱出）。`applyState` 内の `renderDeckSlots()` / `recalculate()` 呼び出しは削除済みのはず（$state 反応）。
- ボタン類は `onclick` ハンドラに（`#btn-save-deck` / `#btn-load-deck` / `#btn-share-url` の id と表示フィードバック文字列は維持）。

- [ ] **Step 3: onMount を最小化**

残してよいのは: `refreshData(...)` 3 種（更新後は `$state` へ代入）、`tryRestoreFromUrl() || restoreState()`、document click リスナ（dropdown 外側クリック）と cleanup。`_q` ヘルパと `rootEl` への querySelector 依存を全廃する。

- [ ] **Step 4: 成功基準の確認**

```bash
grep -c 'innerHTML' src/components/ScoreCalc.svelte src/components/score/*.svelte  # すべて 0（{@html} は可）
grep -n '_q(' src/components/ScoreCalc.svelte                                      # 0 件
wc -l src/components/ScoreCalc.svelte   # 目標 300 行以下（350 以下なら DONE_WITH_CONCERNS で報告）
```

- [ ] **Step 5: 共通検証**（E2E 全件 + persistence 3 件 + dev サーバー目視: 楽曲選択 → 編成 → 計算 → 保存 → 読込 → 共有 URL の一連フロー、`tmp/phase2-final.png`）

- [ ] **Step 6: コミット**

```bash
git add src/components/ScoreCalc.svelte
git commit -m "refactor(score-calc): 親コンポーネントを Runes ベースに刷新し onMount を最小化"
```

---

### Task 8: フェーズ最終検証とリリース（コントローラが実施）

- [ ] dev サーバー停止 → `npm run test:unit` && `npm run test`（本番ビルド + E2E 全件）
- [ ] 成功基準: ScoreCalc.svelte ≤ 300 行（実測値を報告）、`innerHTML` 代入 0、`as any` 0 維持
- [ ] `git tag v1.12.36 && git push origin v1.12.36`
