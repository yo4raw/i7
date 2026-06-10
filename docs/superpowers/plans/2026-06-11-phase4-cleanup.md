# Phase 4: 周辺整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to実装 task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.astro` ページのデータ変換重複の解消・`scripts/` の用途明記・CLAUDE.md の命名規約と stale 記述の更新（スペック Phase 4。任意・低優先のため 2 PR に集約 — 各項目 1 PR 原則からの計画的逸脱）。

**Architecture:** 完全に振る舞い保存。Task 1 はビルド時データ変換の共通化（クライアント挙動不変）、Task 2 はコメント・ドキュメントのみ。

**共通検証:** `npm run typecheck` / `npm run test:unit` / `npx playwright test`（dev サーバー :4321 再利用）。

---

### Task 1: eventsForBonus 変換の共通化と re-export 残骸の整理（スペック 4.1）

**Branch:** `refactor/phase4-event-transform`

**Files:**
- Modify: `src/lib/data/fetchEventsCsv.ts`（変換関数を追加）
- Modify: `src/pages/score-calc/index.astro:18-25` / `src/pages/score-calc/max-score-finder/index.astro:18-26` / `src/pages/cards/index.astro:14` 付近（重複 map を共通関数に置換）
- Modify: `src/lib/score/teamBuilder.ts:15` / `src/lib/score/constants.ts:36`（EVENT_BONUS_MULTIPLIER の re-export 廃止）

- [ ] **Step 1: 変換関数を追加**

`src/lib/data/fetchEventsCsv.ts` 末尾に追加:

```typescript
import type { EventForBonus } from './eventBonusTiers';  // 型のみ（ビルド成果物に fs 依存を持ち込まない）

/** EventRow をクライアントへ渡す特効ボーナス用の最小形に変換する（各ページで重複していた map を集約） */
export function toEventForBonus(e: EventRow): EventForBonus & { eventname: string } {
  return {
    id: e.id,
    eventname: e.eventname,
    start_date: e.start_date,
    end_date: e.end_date,
    gold: e.gold.cardIds,
    silver: e.silver.cardIds,
    bronze: e.bronze.cardIds,
  };
}
```

3 つの .astro ページの `const eventsForBonus = allEvents.map(e => ({...}))` を `const eventsForBonus = allEvents.map(toEventForBonus);` + import に置換。**注意**: score-calc / cards の既存変換には `eventname` がないが、追加フィールドはコンポーネント側（ScoreCalc / CardList の `EventForBonus[]` props）で無視されるため挙動不変。MaxScoreFinder は `LiveEvent = EventForBonus & { eventname: string }` を要求しており型適合する。

- [ ] **Step 2: EVENT_BONUS_MULTIPLIER の re-export 廃止**

`src/lib/score/teamBuilder.ts` の `EVENT_BONUS_MULTIPLIER` を `'./constants'` からの import から外し、`'../data/eventBonusTiers'` からの直接 import に変更。`src/lib/score/constants.ts:36` の `export { EVENT_BONUS_MULTIPLIER } from '../data/eventBonusTiers';` を削除。`grep -rn "EVENT_BONUS_MULTIPLIER" src | grep constants` → 0 件を確認。

- [ ] **Step 3: 共通検証 + コミット**

```bash
git add src/lib/data/fetchEventsCsv.ts src/pages/score-calc/index.astro src/pages/score-calc/max-score-finder/index.astro src/pages/cards/index.astro src/lib/score/teamBuilder.ts src/lib/score/constants.ts
git commit -m "refactor(data): eventsForBonus 変換を fetchEventsCsv に共通化し re-export を整理"
```

---

### Task 2: scripts/ の用途明記と CLAUDE.md の更新（スペック 4.2 / 4.3）

**Branch:** `docs/phase4-naming-and-scripts`

**Files:**
- Modify: `scripts/apply-dark-variants.mjs` / `scripts/refetch-card-images.mjs` / `scripts/verify-card-images.mjs` / `scripts/fetch-song-images.mjs` / `scripts/generate-pwa-icons.mjs` / `scripts/extract-test-fixtures.ts`（先頭コメント）
- Modify: `CLAUDE.md`

- [ ] **Step 1: 各スクリプトの先頭に用途ヘッダを追記**

既にあるものは整える程度でよい。形式（各ファイルの実際の内容を読んで正確に書く）:

```javascript
/**
 * <一行の用途>
 * 実行: node scripts/<name>.mjs [引数]
 * 頻度: <一回限り（YYYY-MM 実施済み）/ 必要時のみ / npm run xxx から定期>
 */
```

- [ ] **Step 2: CLAUDE.md を更新**

1. **stale 記述の修正**: Client-Side Modules 表の `src/lib/cardListRenderer.ts`（存在しない）を実態（`src/lib/cardListData.ts` — カード一覧の行データ構築。フィルタ/ソート/ページネーションは `src/components/CardList.svelte`）に修正。
2. **コンポーネント構成の追記**: `src/components/score/`（CardPickerModal / DeckSlots / CardDetailTable / ScoreCalcResults / SearchResults / ShrinkPlayground）と `src/components/ui/`（RarityBadge / AttributeBadge）、`src/lib/score/deckState.ts` / `searchWorkerPool.ts` / `cardFilter.ts` を Client-Side Modules 周辺の適切な表に追記。
3. **用語・命名規約セクションの追記**（既存「用語ポリシー」の直後）:

```markdown
## 命名規約

- イベント変数は `event`（ループ内の短縮は `ev` まで可。`evt` 等は使わない）
- ブローチは内部識別子で `broach`（ゲーム内表記に合わせた本リポジトリの慣用綴り。`brooch` に直さない）。固有ブローチ = `FixedBroach`（カード紐付き）、共有ブローチ = `SHARED_BROACHS`
- スロット index は `slotIndex`（0=センター, 1-4=メンバー, 5=フレンド。表示順は `DISPLAY_ORDER`）
- デッキ編成状態は `DeckState`（`src/lib/score/deckState.ts`）を使い、個別配列を新設しない
```

（文言は既存コードの実態に合わせて調整してよい）

- [ ] **Step 3: 共通検証（typecheck のみで可 — コメント/ドキュメント変更のため）+ コミット**

```bash
git add scripts/ CLAUDE.md
git commit -m "docs: スクリプトの用途明記と CLAUDE.md の命名規約・構成更新"
```

---

### Task 3: フェーズ最終検証とリリース（コントローラが実施）

- [ ] `npm run test:unit` && `npm run test`（本番ビルド + E2E）
- [ ] `git tag v1.12.38 && git push origin v1.12.38`
