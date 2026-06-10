# Phase 1: 重複排除と型統一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント特効ロジック・型定義・バッジ生成・カードフィルタの重複を排除し、`as any` を一掃する（スペック: `docs/superpowers/specs/2026-06-10-phased-refactoring-design.md` の Phase 1）。

**Architecture:** 完全に振る舞い保存（UI・計算結果・localStorage・URL 不変）。各タスク = 1 ブランチ = 1 PR で main に逐次マージ。検証は Phase 0 の安全網（unit 217 件 + E2E）+ `npm run typecheck` を使う。E2E はタスク中は dev サーバー（:4321、HMR）に対して実行し、フェーズ最後に本番ビルドで通し確認する。

**Tech Stack:** Svelte 5 (Runes) / TypeScript / Vitest / Playwright

**ブランチ・PR 運用:** 各タスク冒頭でコントローラが main から `refactor/phase1-<name>` ブランチを作成する。実装サブエージェントはそのブランチ上でコミットまで行い、push / PR 作成 / マージはコントローラが行う。

**各タスク共通の検証コマンド**（タスク内で「共通検証」と呼ぶ）:

```bash
npm run typecheck      # 型エラーなし
npm run test:unit      # 217+ 件 PASS
npx playwright test    # dev サーバー (:4321) 再利用で E2E 全 PASS (9 passed / 2 skipped)
```

dev サーバーはコントローラが `npm run dev` でバックグラウンド起動済み。HMR が効くため再起動不要。

**スペックからの計画的逸脱（理由付き）:**

1. **1.3 バッジ**: `EventBonusCardGrid.svelte` は属性バッジのフォールバック色が `bg-gray-400`（他は `bg-gray-300`）と異なるため置換対象から除外。`ScoreCalc.svelte` / `EventSharePanel.astro` の文字列レンダラー部分は Svelte コンポーネントを使えないため Phase 2（宣言的レンダリング化）で対応。`.astro` ページ（cards/[id] 等）はビルド時レンダリングで重複の害が小さいため対象外。
2. **1.5 フィルタ**: CardList は Set ベース複数選択 + 生属性値比較、ScoreCalc ピッカーは単一値 + 正規化属性比較、MaxScoreFinder は開催イベント由来の候補プール構築であり、3 者のフィルタ意味論は異なる。無理に統一すると振る舞いが変わるため、**完全に同一実装である名前検索述語のみ** `src/lib/cardFilter.ts` に抽出する。

---

### Task 1: イベント特効ロジック統一（スペック 1.1）

**Branch:** `refactor/phase1-event-tier`

**Files:**
- Modify: `src/components/ScoreCalc.svelte:11-12`（import 追加）, `:27-34`（ローカル型削除）, `:59-78`（重複実装削除）

`ScoreCalc.svelte` 内のローカル `EventForBonus` 型と `buildDefaultTierMap()`（`TIER_RANK` 含む）は `src/lib/data/eventBonusTiers.ts` の `EventForBonus` / `buildLiveTierMap()` / `TIER_RANK` と完全に同一ロジック（Phase 0 の `tests/unit/data/eventBonusTiers.test.ts` が挙動を固定済み）。

- [ ] **Step 1: import を差し替える**

`src/components/ScoreCalc.svelte` の 11〜12 行目:

```typescript
// 変更前
import { EVENT_BONUS_TIERS, EVENT_BONUS_MULTIPLIER, BONUS_LABEL, BONUS_CLASS, ALL_SELECT_CLASSES } from '../lib/data/eventBonusTiers';
import type { EventBonusTier } from '../lib/data/eventBonusTiers';
// 変更後
import { EVENT_BONUS_TIERS, EVENT_BONUS_MULTIPLIER, BONUS_LABEL, BONUS_CLASS, ALL_SELECT_CLASSES, buildLiveTierMap } from '../lib/data/eventBonusTiers';
import type { EventBonusTier, EventForBonus } from '../lib/data/eventBonusTiers';
```

※ 11〜12 行目の正確な現行テキストは上記と一致することを確認済み。異なっていた場合はファイルを読んで該当 import を特定する。

- [ ] **Step 2: ローカル型定義を削除する**

27〜34 行目の以下を削除:

```typescript
type EventForBonus = {
  id: number;
  start_date: string;
  end_date: string;
  gold: number[];
  silver: number[];
  bronze: number[];
};
```

- [ ] **Step 3: 重複実装を削除して共通関数に置換する**

59〜78 行目の以下のブロック:

```typescript
const TIER_RANK: Record<EventBonusTier, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };

function buildDefaultTierMap(): Map<number, EventBonusTier> {
  const now = Date.now();
  const map = new Map<number, EventBonusTier>();
  const upgrade = (id: number, tier: EventBonusTier) => {
    const cur = map.get(id) ?? 'none';
    if (TIER_RANK[tier] > TIER_RANK[cur]) map.set(id, tier);
  };
  for (const ev of allEventsForBonus) {
    const start = Date.parse(`${ev.start_date}T00:00:00+09:00`);
    const end = Date.parse(`${ev.end_date}T17:00:00+09:00`);
    if (!(now >= start && now < end)) continue;
    for (const id of ev.gold) upgrade(id, 'gold');
    for (const id of ev.silver) upgrade(id, 'silver');
    for (const id of ev.bronze) upgrade(id, 'bronze');
  }
  return map;
}
const defaultTierMap = buildDefaultTierMap();
```

を 1 行に置換:

```typescript
const defaultTierMap = buildLiveTierMap(allEventsForBonus);
```

※ `buildLiveTierMap` の第 2 引数 `now` はデフォルト `Date.now()` なので省略で同一挙動。

- [ ] **Step 4: 共通検証 + 残骸チェック**

```bash
grep -n 'buildDefaultTierMap\|TIER_RANK' src/components/ScoreCalc.svelte   # ヒット 0 件
npm run typecheck && npm run test:unit && npx playwright test
```

- [ ] **Step 5: コミット**

```bash
git add src/components/ScoreCalc.svelte
git commit -m "refactor(score-calc): イベント特効ティア計算を eventBonusTiers の共通実装に統一"
```

---

### Task 2: `as any` 排除（スペック 1.2）

**Branch:** `refactor/phase1-song-group-types`

**Files:**
- Modify: `src/lib/data/fetchSongsJson.ts:42` 直後（キー定数追加）
- Modify: `src/lib/score/broachResolver.ts:61-65, 106-111`（song 引数を `Pick<Song, 'song_name'>` に）
- Modify: `src/components/ScoreCalc.svelte:175-178, 341, 558, 961-962`（`as any` 4 箇所排除）

- [ ] **Step 1: ノートグループキー定数を追加する**

`src/lib/data/fetchSongsJson.ts` の `Song` インターフェース（42 行目 `}` ）の直後に追加:

```typescript
/** ノートグループの 8 キー（ステージ進行順）。LIGHT_MULTIPLIER (score/constants.ts) のキー順と一致 */
export const SONG_NOTE_GROUP_KEYS = [
  'notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6',
] as const;
```

※ `LIGHT_MULTIPLIER` のキーと順序が一致していることは確認済み（notes_20 → light_2..6 → chorus_light_5/6）。

- [ ] **Step 2: broachResolver の song 引数を必要最小の型に絞る**

`src/lib/score/broachResolver.ts` — `checkBroachCondition`（61 行目付近）と `resolveDeckBroachs`（106 行目付近）の `song: Song` を `song: Pick<Song, 'song_name'>` に変更（2 箇所）。この関数群は `song.song_name` しか参照しない（92 行目の種類 9 判定のみ）。フル `Song` を渡す既存呼び出し（engine.ts / MaxScoreFinder / テスト）は `Pick` を満たすので無変更で通る。

```typescript
// checkBroachCondition
function checkBroachCondition(
  broach: FixedBroach,
  deck: (Card | null)[],
  song: Pick<Song, 'song_name'>,
): boolean {
// resolveDeckBroachs
export function resolveDeckBroachs(
  deck: (Card | null)[],
  allBroachs: FixedBroach[],
  song: Pick<Song, 'song_name'>,
  selectedBroachIds?: (number | null)[],
): Map<number, ResolvedBroach[]> {
```

- [ ] **Step 3: ScoreCalc の `as any` 4 箇所を排除する**

`src/components/ScoreCalc.svelte`:

(a) 24 行目の import に `SONG_NOTE_GROUP_KEYS` を追加:

```typescript
import { fetchSongsJson, filterValidSongs, filterAllowedSongs, SONG_NOTE_GROUP_KEYS } from '../lib/data/fetchSongsJson';
```

(b) 175〜178 行目付近:

```typescript
// 変更前
const NOTE_GROUPS: (keyof Song)[] = ['notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6'];
let sCount = 0, bCount = 0, mCount = 0;
for (const gk of NOTE_GROUPS) {
  const g = selectedSong[gk] as any;
// 変更後
let sCount = 0, bCount = 0, mCount = 0;
for (const gk of SONG_NOTE_GROUP_KEYS) {
  const g = selectedSong[gk];
```

(c) 341 行目と 558 行目（2 箇所、同じパターン）:

```typescript
// 変更前 (341)
const slotDummySong = selectedSong || { song_name: '' } as any;
// 変更後 (341)
const slotDummySong = selectedSong || { song_name: '' };
// 変更前 (558)
const dummySong = selectedSong || { song_name: '' } as any;
// 変更後 (558)
const dummySong = selectedSong || { song_name: '' };
```

（Step 2 の `Pick<Song, 'song_name'>` 化により `{ song_name: '' }` がそのまま型適合する）

(d) 961〜962 行目付近:

```typescript
// 変更前
for (const [groupKey, mult] of Object.entries(LIGHT_MULTIPLIER)) {
  const g = (song as any)[groupKey];
// 変更後
for (const gk of SONG_NOTE_GROUP_KEYS) {
  const mult = LIGHT_MULTIPLIER[gk];
  const g = song[gk];
```

（後続の `g.shout_white` 等の参照はそのまま。`LIGHT_MULTIPLIER` のキー集合・順序は `SONG_NOTE_GROUP_KEYS` と同一なので反復順も挙動も不変）

- [ ] **Step 4: 共通検証 + 残骸チェック**

```bash
grep -n 'as any' src/components/ScoreCalc.svelte   # ヒット 0 件
npm run typecheck && npm run test:unit && npx playwright test
```

- [ ] **Step 5: コミット**

```bash
git add src/lib/data/fetchSongsJson.ts src/lib/score/broachResolver.ts src/components/ScoreCalc.svelte
git commit -m "refactor(score): ノートグループキーを型付き定数化し as any を排除"
```

---

### Task 3: 小掃除 — 二重 import と re-export の廃止（スペック 1.4）

**Branch:** `refactor/phase1-cleanup`

**Files:**
- Modify: `src/components/ScoreCalc.svelte:20, 49-51`（loadJson 二重 import 解消）
- Modify: `src/lib/score/constants.ts:37`（EventBonusTier re-export 削除）
- Modify: `src/lib/score/engine.ts:17`（import 元を直接参照に変更）

- [ ] **Step 1: ScoreCalc の loadJson 二重 import を解消する**

`src/components/ScoreCalc.svelte` 20 行目を削除:

```typescript
import { loadJson as loadStorageJson } from '../lib/storage';
```

（17 行目に `import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';` が既にある）

49〜51 行目の `loadCounts` を修正:

```typescript
// 変更前
function loadCounts(): Record<string, number> {
  return loadStorageJson<Record<string, number>>(STORAGE_KEYS.CARD_COUNTS, {});
}
// 変更後
function loadCounts(): Record<string, number> {
  return loadJson<Record<string, number>>(STORAGE_KEYS.CARD_COUNTS, {});
}
```

`grep -n 'loadStorageJson' src/components/ScoreCalc.svelte` でヒット 0 件を確認。

- [ ] **Step 2: EventBonusTier の re-export を廃止する**

`src/lib/score/engine.ts` 17 行目:

```typescript
// 変更前
import type { EventBonusTier } from './constants';
// 変更後
import type { EventBonusTier } from '../data/eventBonusTiers';
```

`src/lib/score/constants.ts` 37 行目を削除:

```typescript
export type { EventBonusTier } from '../data/eventBonusTiers';
```

`grep -rn "EventBonusTier' } from\|EventBonusTier } from './constants'\|EventBonusTier.*from '.*score/constants'" src tests` でヒット 0 件を確認（他に re-export 経由の利用者がいないこと）。

- [ ] **Step 3: 共通検証**

```bash
npm run typecheck && npm run test:unit && npx playwright test
```

- [ ] **Step 4: コミット**

```bash
git add src/components/ScoreCalc.svelte src/lib/score/constants.ts src/lib/score/engine.ts
git commit -m "refactor(score): loadJson 二重 import と EventBonusTier re-export を整理"
```

---

### Task 4: 属性/レアリティバッジのコンポーネント化（スペック 1.3）

**Branch:** `refactor/phase1-badges`

**Files:**
- Create: `src/components/ui/RarityBadge.svelte`
- Create: `src/components/ui/AttributeBadge.svelte`
- Modify: `src/components/cards/CardTableRow.svelte:86-94`
- Modify: `src/components/cards/CardTileCard.svelte:50-55`
- Modify: `src/components/cards/CardMobileCard.svelte:61-66`
- Modify: `src/components/DeckList.svelte:112-118`
- Modify: `src/components/MaxScoreFinder.svelte:557-570`

対象 5 ファイルのバッジは「サイズ系クラス + `font-bold text-white rounded` + 色クラス（`|| 'bg-gray-300'` フォールバック）」の同型 span。サイズとラベルフォールバックだけ差があるため props で吸収する。**置換後の class 集合・ラベル文字列が変更前と完全一致すること**が合格条件。

- [ ] **Step 1: バッジコンポーネントを新規作成する**

`src/components/ui/RarityBadge.svelte`:

```svelte
<script lang="ts">
  import { RARITY_BADGE_CLASSES } from '../../lib/constants';

  let { rarity, sizeClass, fallbackLabel = '' }: {
    rarity: string | null | undefined;
    /** px/py/text サイズ系クラス（呼び出し元の既存表示を踏襲） */
    sizeClass: string;
    fallbackLabel?: string;
  } = $props();
</script>

<span class="{sizeClass} font-bold text-white rounded {RARITY_BADGE_CLASSES[rarity || ''] || 'bg-gray-300'}">
  {rarity || fallbackLabel}
</span>
```

`src/components/ui/AttributeBadge.svelte`:

```svelte
<script lang="ts">
  import { ATTR_BADGE_BG } from '../../lib/constants';

  let { attribute, sizeClass, fallbackLabel = '?' }: {
    attribute: string | null | undefined;
    /** px/py/text サイズ系クラス（呼び出し元の既存表示を踏襲） */
    sizeClass: string;
    fallbackLabel?: string;
  } = $props();
</script>

<span class="{sizeClass} font-bold text-white rounded {ATTR_BADGE_BG[attribute || ''] || 'bg-gray-300'}">
  {attribute || fallbackLabel}
</span>
```

- [ ] **Step 2: カード一覧系 3 コンポーネントを置換する**

`src/components/cards/CardTableRow.svelte`（86〜94 行目）:

```svelte
<!-- 変更前 -->
<span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded {RARITY_BADGE_CLASSES[card.rarity] || 'bg-gray-300'}">
  {card.rarity}
</span>
...
<span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded {ATTR_BADGE_BG[card.attribute] || 'bg-gray-300'}">
  {card.attribute || '?'}
</span>
<!-- 変更後 -->
<RarityBadge rarity={card.rarity} sizeClass="inline-block px-1.5 py-0.5 text-xs" />
...
<AttributeBadge attribute={card.attribute} sizeClass="inline-block px-1.5 py-0.5 text-xs" />
```

import を `<script>` に追加: `import RarityBadge from '../ui/RarityBadge.svelte'; import AttributeBadge from '../ui/AttributeBadge.svelte';`

`CardTileCard.svelte`（50〜55 行目）は同じ置換で `sizeClass="inline-block px-1.5 py-0.5 text-[10px]"`。
`CardMobileCard.svelte`（61〜66 行目）は `sizeClass="inline-block px-1.5 py-0.5 text-xs"`。

各ファイルで置換後に `RARITY_BADGE_CLASSES` / `ATTR_BADGE_BG` が未使用になったら import から除去する（`ATTR_BG` / `ATTR_HEX` 等、他で使用中のものは残す）。

- [ ] **Step 3: DeckList と MaxScoreFinder を置換する**

`src/components/DeckList.svelte`（117〜118 行目）:

```svelte
<!-- 変更前 -->
<span class="px-0.5 py-px text-[7px] font-bold text-white rounded {rarityClass}">{card.rarity || '?'}</span>
<span class="px-0.5 py-px text-[7px] font-bold text-white rounded {attrBgClass}">{attr}</span>
<!-- 変更後 -->
<RarityBadge rarity={card.rarity} sizeClass="px-0.5 py-px text-[7px]" fallbackLabel="?" />
<AttributeBadge attribute={attr} sizeClass="px-0.5 py-px text-[7px]" />
```

直前の `{@const rarityClass = ...}` `{@const attrBgClass = ...}` 行を削除（`attr` の `{@const}` は残す）。未使用になった import（`RARITY_BADGE_CLASSES`, `ATTR_BADGE_BG`）を除去。

`src/components/MaxScoreFinder.svelte`（569〜570 行目、同様のパターン）:

```svelte
<!-- 変更前 -->
<span class="px-1 py-0.5 text-[9px] font-bold text-white rounded {rarityClass}">{card.rarity || '?'}</span>
<span class="px-1 py-0.5 text-[9px] font-bold text-white rounded {attrBgClass}">{attr}</span>
<!-- 変更後 -->
<RarityBadge rarity={card.rarity} sizeClass="px-1 py-0.5 text-[9px]" fallbackLabel="?" />
<AttributeBadge attribute={attr} sizeClass="px-1 py-0.5 text-[9px]" />
```

557〜558 行目の `{@const rarityClass = ...}` `{@const attrBgClass = ...}` を削除。MaxScoreFinder 内に同パターンのバッジが**他にもないか** `grep -n 'rarityClass\|attrBgClass' src/components/MaxScoreFinder.svelte` で確認し、あれば同様に置換する。置換後、`RARITY_BADGE_CLASSES` / `ATTR_BADGE_BG` が未使用になったら import から除去（`ATTR_HEX` は枠線色で使用中のため残る見込み）。

**対象外（変更しないこと):** `EventBonusCardGrid.svelte`（属性フォールバックが `bg-gray-400` で異なる）、`ScoreCalc.svelte` / `EventSharePanel.astro`（文字列レンダラー、Phase 2 対応）、`.astro` ページ群。

- [ ] **Step 4: 共通検証 + 表示確認スクリーンショット**

```bash
npm run typecheck && npm run test:unit && npx playwright test
```

dev サーバー（:4321 稼働中）に対して変更ページのスクリーンショットを取得し、バッジ表示が変わっていないことを目視確認:

```bash
mkdir -p tmp
npx playwright screenshot --wait-for-timeout=8000 http://localhost:4321/cards/ tmp/phase1-badges-cards.png
npx playwright screenshot --wait-for-timeout=3000 http://localhost:4321/decks/ tmp/phase1-badges-decks.png
```

（/cards/ はリスト表示 = CardTableRow。バッジの色・サイズ・ラベルが従来どおりか確認）

- [ ] **Step 5: コミット**

```bash
git add src/components/ui/ src/components/cards/ src/components/DeckList.svelte src/components/MaxScoreFinder.svelte
git commit -m "refactor(ui): 属性/レアリティバッジを共通コンポーネント化"
```

---

### Task 5: カード名検索述語の共通化（スペック 1.5・縮小スコープ）

**Branch:** `refactor/phase1-card-filter`

**Files:**
- Create: `src/lib/cardFilter.ts`
- Create: `tests/unit/cardFilter.test.ts`
- Modify: `src/components/CardList.svelte:41-44`
- Modify: `src/components/ScoreCalc.svelte:775-781`

CardList と ScoreCalc ピッカーで完全同一実装になっている「衣装名/キャラ名の部分一致検索」を抽出する（レアリティ・属性フィルタは両者で意味論が異なるため対象外 — 冒頭の逸脱メモ参照）。

- [ ] **Step 1: 共通述語とテストを書く**

`src/lib/cardFilter.ts`:

```typescript
/**
 * 衣装名(cardname)・キャラ名(name) の部分一致検索。
 * query は呼び出し元で小文字化済みのものを渡す。空文字なら常に true。
 */
export function cardTextMatches(
  card: { cardname: string | null; name: string | null },
  lowerQuery: string,
): boolean {
  if (!lowerQuery) return true;
  return (card.cardname || '').toLowerCase().includes(lowerQuery)
    || (card.name || '').toLowerCase().includes(lowerQuery);
}
```

`tests/unit/cardFilter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { cardTextMatches } from '../../src/lib/cardFilter';

describe('cardTextMatches (衣装名/キャラ名の部分一致検索)', () => {
  const card = { cardname: 'MEMORiES MELODiES', name: '七瀬陸' };

  it('空クエリは常にマッチ', () => {
    expect(cardTextMatches(card, '')).toBe(true);
  });

  it('衣装名の部分一致 (小文字化して比較)', () => {
    expect(cardTextMatches(card, 'memories')).toBe(true);
  });

  it('キャラ名の部分一致', () => {
    expect(cardTextMatches(card, '七瀬')).toBe(true);
  });

  it('どちらにも含まれなければ不一致', () => {
    expect(cardTextMatches(card, 'trigger')).toBe(false);
  });

  it('cardname/name が null でも落ちない', () => {
    expect(cardTextMatches({ cardname: null, name: null }, 'x')).toBe(false);
    expect(cardTextMatches({ cardname: null, name: null }, '')).toBe(true);
  });
});
```

`npx vitest run tests/unit/cardFilter.test.ts` → 5 tests PASS。

- [ ] **Step 2: CardList.svelte を置換する**

44 行目:

```typescript
// 変更前
if (t && !(card.cardname || '').toLowerCase().includes(t) && !(card.name || '').toLowerCase().includes(t)) return false;
// 変更後
if (!cardTextMatches(card, t)) return false;
```

`<script>` に import 追加: `import { cardTextMatches } from '../lib/cardFilter';`
（`t` は 42 行目で `text.toLowerCase()` 済み。空文字時に `cardTextMatches` が true を返すので `if (t && ...)` のガードと等価）

- [ ] **Step 3: ScoreCalc.svelte のピッカーを置換する**

777〜781 行目:

```typescript
// 変更前
if (text) {
  const name = (card.cardname || '').toLowerCase();
  const charName = (card.name || '').toLowerCase();
  if (!name.includes(text) && !charName.includes(text)) return false;
}
// 変更後
if (!cardTextMatches(card, text)) return false;
```

import 追加: `import { cardTextMatches } from '../lib/cardFilter';`
（`text` は 769 行目で小文字化済み）

- [ ] **Step 4: 共通検証**

```bash
npm run typecheck && npm run test:unit && npx playwright test
```

加えて dev サーバーで `/cards/` の名前検索（例: 「環」と入力して絞り込まれること）を E2E が拾わないため、ブラウザ確認またはスクリーンショットで確認する。

- [ ] **Step 5: コミット**

```bash
git add src/lib/cardFilter.ts tests/unit/cardFilter.test.ts src/components/CardList.svelte src/components/ScoreCalc.svelte
git commit -m "refactor(cards): 衣装名/キャラ名検索の述語を cardFilter に共通化"
```

---

### Task 6: フェーズ最終検証とリリース（コントローラが実施）

- [ ] **Step 1: dev サーバーを停止し、本番ビルドで通し検証**

```bash
npm run test:unit   # 全 PASS
npm run test        # build + preview で E2E 全 PASS（約 10〜15 分）
```

- [ ] **Step 2: 成功基準の確認**

```bash
grep -c 'as any' src/components/ScoreCalc.svelte          # 0
grep -n 'type EventForBonus' src/components/ScoreCalc.svelte  # ヒットなし
grep -n 'EventBonusTier' src/lib/score/constants.ts        # ヒットなし
wc -l src/components/ScoreCalc.svelte                      # 1831 から減少していること
```

- [ ] **Step 3: タグ push でリリース**

```bash
git checkout main && git pull
git tag v1.12.35 && git push origin v1.12.35
```

（5 つの PR はタスクごとにマージ済み。タグでリリースノート自動生成 + Cloudflare Workers デプロイ）
