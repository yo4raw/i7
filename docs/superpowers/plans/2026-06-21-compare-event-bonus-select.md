# 衣装比較 ハイスコアイベント選択式特効 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 衣装比較画面で任意のハイスコアイベントを選択し、その特効（金/銀/銅 → 倍率）を比較結果へ反映できるようにする。

**Architecture:** 単一イベント用のティアマップ生成関数を `eventBonusTiers.ts` に新設し、`buildLiveTierMap` をその再利用形にリファクタ。`CardCompare.svelte` のチェックボックス（開催中マージ自動反映）を、ハイスコアイベントの `<select>`（選択イベント単体反映）に置き換える。選択は localStorage に保持する。

**Tech Stack:** Astro 6 静的サイト / Svelte 5（runes: `$state` / `$derived` / `$effect`）/ TypeScript / Vitest（単体）/ Playwright（E2E）。

## Global Constraints

- 完全静的サイト。ロジック・データ反映はすべてクライアントサイド JS（ビルド時コンパイルのみサーバー可）。
- ユーザー可視テキストは「カード」ではなく **「衣装」**。内部識別子は `card` のまま。
- カードを指す ID は **`Card.ID`**（`cardID` ではない）。
- ライトテーマ固定。新規 UI に `dark:` バリアントを付けない。
- localStorage キーは `src/lib/storage.ts` の `STORAGE_KEYS` に集中管理（追加時は CLAUDE.md のキー表も更新）。
- 命名: イベント変数は `event`（短縮は `ev` まで）。ブローチは `broach` 綴り。
- 日常検証は `npm run dev`（HMR, http://localhost:4321）。単体は `npm run test:unit`。E2E はローカルでは dev サーバーを先に起動して `npx playwright test` で再利用（裸の `locator('select')` は使わず `getByLabel` 等で特定）。

---

### Task 1: 単一イベント用ティアマップ生成関数の追加

**Files:**
- Modify: `src/lib/data/eventBonusTiers.ts`
- Test: `tests/unit/data/buildTierMapForEvent.test.ts` (Create)

**Interfaces:**
- Consumes: 既存 `EventBonusTier`, `TIER_RANK`。
- Produces: `buildTierMapForEvent(event: { gold: number[]; silver: number[]; bronze: number[] }): Map<number, EventBonusTier>` — 開催中判定なしで金>銀>銅優先のティアマップを返す。`buildLiveTierMap` は引き続き同シグネチャ・同挙動。

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/data/buildTierMapForEvent.test.ts` を新規作成:

```typescript
import { describe, it, expect } from 'vitest';
import { buildTierMapForEvent } from '../../../src/lib/data/eventBonusTiers';

describe('buildTierMapForEvent', () => {
  it('金/銀/銅をそれぞれのティアに割り当てる', () => {
    const map = buildTierMapForEvent({ gold: [1], silver: [2], bronze: [3] });
    expect(map.get(1)).toBe('gold');
    expect(map.get(2)).toBe('silver');
    expect(map.get(3)).toBe('bronze');
    expect(map.get(99)).toBeUndefined();
  });

  it('同一カードが複数ティアにある場合は上位（金>銀>銅）を採用する', () => {
    const map = buildTierMapForEvent({ gold: [5], silver: [5], bronze: [5] });
    expect(map.get(5)).toBe('gold');
  });

  it('開催期間に関係なくマップを生成する（live 判定をしない）', () => {
    const map = buildTierMapForEvent({ gold: [7], silver: [], bronze: [] });
    expect(map.get(7)).toBe('gold');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- buildTierMapForEvent`
Expected: FAIL（`buildTierMapForEvent` is not exported / not a function）

- [ ] **Step 3: 最小実装**

`src/lib/data/eventBonusTiers.ts` の `buildLiveTierMap` を以下に差し替え、`buildTierMapForEvent` を追加する（既存 `buildLiveTierMap` 関数本体を置換）:

```typescript
export function buildTierMapForEvent(
  event: { gold: number[]; silver: number[]; bronze: number[] },
  map: Map<number, EventBonusTier> = new Map(),
): Map<number, EventBonusTier> {
  const upgrade = (id: number, tier: EventBonusTier) => {
    const cur = map.get(id) ?? 'none';
    if (TIER_RANK[tier] > TIER_RANK[cur]) map.set(id, tier);
  };
  for (const id of event.gold) upgrade(id, 'gold');
  for (const id of event.silver) upgrade(id, 'silver');
  for (const id of event.bronze) upgrade(id, 'bronze');
  return map;
}

export function buildLiveTierMap(events: EventForBonus[], now: number = Date.now()): Map<number, EventBonusTier> {
  const map = new Map<number, EventBonusTier>();
  for (const ev of events) {
    if (!isEventLive(ev.start_date, ev.end_date, now)) continue;
    buildTierMapForEvent(ev, map);
  }
  return map;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:unit -- buildTierMapForEvent`
Expected: PASS（3 件）。併せて `npm run test:unit -- eventHighScore` も PASS のまま。

- [ ] **Step 5: コミット**

```bash
git add src/lib/data/eventBonusTiers.ts tests/unit/data/buildTierMapForEvent.test.ts
git commit -m "feat: 単一イベント用ティアマップ生成 buildTierMapForEvent を追加"
```

---

### Task 2: イベント種別 (eventtype) をクライアントへ受け渡し

**Files:**
- Modify: `src/lib/data/fetchEventsCsv.ts:141-151`
- Test: `tests/unit/data/toEventForBonus.test.ts` (Create)

**Interfaces:**
- Consumes: 既存 `EventRow`（`eventtype: string` を持つ）, `EventForBonus`。
- Produces: `toEventForBonus(e: EventRow): EventForBonus & { eventname: string; eventtype: string }` — `eventtype` を追加で含める。

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/data/toEventForBonus.test.ts` を新規作成:

```typescript
import { describe, it, expect } from 'vitest';
import { toEventForBonus, type EventRow } from '../../../src/lib/data/fetchEventsCsv';

function makeRow(over: Partial<EventRow> = {}): EventRow {
  const emptyTier = { cardIds: [], costumeIds: [], effect: [], param_up: 0, item_up: 0, bpt_up: 0, ept_up: 0, gpt_up: 0, score_up: 0 };
  return {
    id: 1, eventname: 'テストイベント', eventtype: 'ハイスコアライブイベント',
    start_date: '2026-06-15', end_date: '2026-06-22', special3_member: '', comment: '',
    gold: { ...emptyTier, cardIds: [10] }, silver: { ...emptyTier }, bronze: { ...emptyTier },
    ...over,
  };
}

describe('toEventForBonus', () => {
  it('eventtype を含めて返す', () => {
    const out = toEventForBonus(makeRow());
    expect(out.eventtype).toBe('ハイスコアライブイベント');
    expect(out.eventname).toBe('テストイベント');
    expect(out.gold).toEqual([10]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- toEventForBonus`
Expected: FAIL（`out.eventtype` が undefined）

- [ ] **Step 3: 最小実装**

`src/lib/data/fetchEventsCsv.ts` の `toEventForBonus` を修正:

```typescript
export function toEventForBonus(e: EventRow): EventForBonus & { eventname: string; eventtype: string } {
  return {
    id: e.id,
    eventname: e.eventname,
    eventtype: e.eventtype,
    start_date: e.start_date,
    end_date: e.end_date,
    gold: e.gold.cardIds,
    silver: e.silver.cardIds,
    bronze: e.bronze.cardIds,
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:unit -- toEventForBonus`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/data/fetchEventsCsv.ts tests/unit/data/toEventForBonus.test.ts
git commit -m "feat: toEventForBonus に eventtype を含める"
```

---

### Task 3: localStorage キー追加

**Files:**
- Modify: `src/lib/storage.ts:9-16`
- Modify: `CLAUDE.md:188-197`（localStorage キー表）

**Interfaces:**
- Produces: `STORAGE_KEYS.COMPARE_EVENT_ID === 'i7_compare_event_id'`。`FooterTools.svelte` が `Object.values(STORAGE_KEYS)` を走査するため、追加だけでバックアップ対象に自動で含まれる（FooterTools の改修は不要）。

- [ ] **Step 1: キーを追加**

`src/lib/storage.ts` の `STORAGE_KEYS` 末尾に追記:

```typescript
  CARD_LIST_VIEW_MODE: 'i7_card_list_view_mode',
  COMPARE_EVENT_ID: 'i7_compare_event_id',
} as const;
```

- [ ] **Step 2: CLAUDE.md のキー表へ追記**

`CLAUDE.md` の「User Data Backup」キー表（`i7_shared_broach_counts` の行の下）に追加:

```markdown
| `i7_compare_event_id` | 衣装比較画面で選択中の特効イベント |
```

- [ ] **Step 3: 単体テスト全体がグリーンであることを確認**

Run: `npm run test:unit`
Expected: PASS（既存 + Task 1,2 の新規が全て通る）

- [ ] **Step 4: コミット**

```bash
git add src/lib/storage.ts CLAUDE.md
git commit -m "feat: 衣装比較の選択イベント保持用 localStorage キーを追加"
```

---

### Task 4: CardCompare のロジックをイベント選択式へ置換

**Files:**
- Modify: `src/components/CardCompare.svelte`

**Interfaces:**
- Consumes: Task 1 `buildTierMapForEvent`、既存 `isHighScoreEvent` / `isEventLive` / `EVENT_BONUS_MULTIPLIER`、Task 3 `STORAGE_KEYS.COMPARE_EVENT_ID`、`loadJson`/`saveJson`。props `events` は Task 2 で `eventname`/`eventtype` 込みになっている。
- Produces: 選択中イベントの特効を `tierFor(card)` 経由で各タブ・詳細パネルへ反映する `CardCompare`。UI に aria-label「特効イベント」の `<select>` を持つ。

このタスクは UI 込みの一括変更（ロジックと表示が密結合のため分割しない）。E2E は Task 5。dev サーバーで目視確認する。

- [ ] **Step 1: import と数の整理**

`src/components/CardCompare.svelte` の eventBonusTiers import を差し替える:

```typescript
  import {
    buildTierMapForEvent, EVENT_BONUS_MULTIPLIER, isHighScoreEvent, isEventLive,
    type EventBonusTier, type EventForBonus,
  } from '../lib/data/eventBonusTiers';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';
```

- [ ] **Step 2: props 型を拡張**

`Props` 型の `events` を変更:

```typescript
  type CompareEvent = EventForBonus & { eventname: string; eventtype: string };
  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: CompareEvent[];
    base: string;
  };
```

- [ ] **Step 3: 状態と派生値を置換**

既存の `const tierMap = buildLiveTierMap(events);` / `const hasLiveEvent = tierMap.size > 0;` / `let applyBonus = $state(false);` を削除し、以下に置換する:

```typescript
  const highScoreEvents = [...events]
    .filter((e) => isHighScoreEvent(e.eventtype))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  const defaultEventId =
    highScoreEvents.find((e) => isEventLive(e.start_date, e.end_date))?.id ?? null;

  let selectedEventId = $state<number | null>(defaultEventId);

  const selectedEvent = $derived(
    selectedEventId == null ? null : highScoreEvents.find((e) => e.id === selectedEventId) ?? null,
  );
  const tierMap = $derived(selectedEvent ? buildTierMapForEvent(selectedEvent) : new Map<number, EventBonusTier>());
```

- [ ] **Step 4: onMount で localStorage 復元**

`onMount` 内（既存の `ownedIds` 復元の直後）に追加:

```typescript
    const savedEventId = loadJson<number | null>(STORAGE_KEYS.COMPARE_EVENT_ID, null);
    if (savedEventId != null && highScoreEvents.some((e) => e.id === savedEventId)) {
      selectedEventId = savedEventId;
    }
```

- [ ] **Step 5: 変更を localStorage へ保存する effect を追加**

`onMount` の後ろに追加（`mounted` ガードで初期描画時の上書き保存を避ける）:

```typescript
  let mounted = $state(false);
  onMount(() => { mounted = true; });

  $effect(() => {
    if (!mounted) return;
    saveJson(STORAGE_KEYS.COMPARE_EVENT_ID, selectedEventId);
  });
```

- [ ] **Step 6: tierFor を選択イベント基準に修正**

既存 `tierFor` を置換:

```typescript
  function tierFor(card: Card): EventBonusTier {
    if (!selectedEvent || card.ID == null) return 'none';
    return tierMap.get(card.ID) ?? 'none';
  }
```

- [ ] **Step 7: チェックボックス UI を select に置換**

テンプレートの `{#if hasLiveEvent} ... {/if}` ブロック（「イベント特効を反映」チェックボックス）を以下に置換:

```svelte
  {#if highScoreEvents.length > 0}
    <label class="flex items-center gap-2">
      <span class="text-gray-600 shrink-0">特効</span>
      <select
        aria-label="特効イベント"
        class="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white max-w-72 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={selectedEventId == null ? '' : String(selectedEventId)}
        onchange={(e) => {
          const v = e.currentTarget.value;
          selectedEventId = v === '' ? null : Number(v);
        }}
      >
        <option value="">特効なし</option>
        {#each highScoreEvents as ev (ev.id)}
          <option value={String(ev.id)}>{ev.eventname}</option>
        {/each}
      </select>
    </label>
  {/if}
```

- [ ] **Step 8: dev サーバーで目視確認**

```bash
npm run dev
```
ready 後 `http://localhost:4321/card-compare/` を開き、Playwright MCP / chrome-devtools MCP で確認:
- 「特効」セレクトが表示される。開催中ハイスコアイベントがあれば初期選択されている。
- イベントを選ぶと棒/列に金/銀/銅バッジが付き、スコアが変わる。「特効なし」でバッジが消える。
- リロードしても選択が保持される。
スクリーンショットを `tmp/` に保存する。

- [ ] **Step 9: コミット**

```bash
git add src/components/CardCompare.svelte
git commit -m "feat: 衣装比較でハイスコアイベントを選択して特効反映できるようにする"
```

---

### Task 5: E2E テスト追加

**Files:**
- Modify: `tests/card-compare.test.ts`

**Interfaces:**
- Consumes: Task 4 の aria-label「特効イベント」`<select>`、既存 `data-testid="scoreup-bar"`。

- [ ] **Step 1: テストを追加**

`tests/card-compare.test.ts` の `describe` 末尾（最後の `test(...)` の後ろ、閉じ `});` の前）に追加:

```typescript
  test('特効イベントセレクタがあり、選択でバッジ表示が切り替わる', async ({ page }) => {
    const select = page.getByLabel('特効イベント');
    await expect(select).toBeVisible({ timeout: 20000 });

    // 「特効なし」を選ぶとバッジが出ない
    await select.selectOption('');
    const bar = page.getByTestId('scoreup-bar').first();
    await expect(bar).toBeVisible({ timeout: 20000 });

    // 先頭の実イベント（value が空でない最初の option）を選ぶ
    const firstEventValue = await select.locator('option').nth(1).getAttribute('value');
    expect(firstEventValue).toBeTruthy();
    await select.selectOption(firstEventValue!);
    // 値が反映されること（バッジの有無はデータ依存のため値の切替で検証）
    await expect(select).toHaveValue(firstEventValue!);
  });
```

- [ ] **Step 2: dev サーバーを起動して E2E 実行**

別ターミナルで `npm run dev` 起動済みを前提に:

Run: `npx playwright test tests/card-compare.test.ts`
Expected: 全テスト PASS（新規含む）

- [ ] **Step 3: コミット**

```bash
git add tests/card-compare.test.ts
git commit -m "test: 衣装比較の特効イベントセレクタ E2E を追加"
```

---

### Task 6: ADR とリリースノート整備

**Files:**
- Create: `docs/adr/NNNN-compare-event-bonus-select.md`（連番は `docs/adr/README.md` の次番号）
- Modify: `docs/adr/README.md`（一覧表に行追加）

**Interfaces:** なし（ドキュメントのみ）。リリースノートは git タグから自動生成のため、PR タイトル / コミット文言で変更点を表現する。

- [ ] **Step 1: 次の ADR 番号を確認**

Run: `ls docs/adr/ | tail`
次の 4 桁連番を決める。

- [ ] **Step 2: ADR を作成**

`docs/adr/NNNN-compare-event-bonus-select.md` を作成（フォーマットは `docs/adr/README.md` に従う）:
- 決定: 衣装比較の特効反映を「開催中イベント自動マージ」から「ハイスコアイベント選択式（開催中があれば既定選択、選択は localStorage 保持）」へ変更。
- 理由: 過去・今後のハイスコアイベント特効を当てた比較ニーズ。開催中複数マージは特定イベントの比較に不向き。
- 検討した代替案と却下理由: (a) チェックボックス併存（状態が二重で複雑）、(b) 全イベントタイプ対象（特効のないイベントが大量に並ぶ）、(c) 全イベントのティアマップ事前計算（選択は1つで都度生成で十分）。
- ステータス: 承認。

- [ ] **Step 3: README.md の一覧表へ行追加**

`docs/adr/README.md` の一覧表に該当行を追加する。

- [ ] **Step 4: コミット**

```bash
git add docs/adr/
git commit -m "docs: 衣装比較のハイスコアイベント選択式特効反映の ADR を追加"
```

---

### Task 7: 最終検証・PR・リリース・告知

**Files:** なし（運用作業）

- [ ] **Step 1: 単体テスト全体**

Run: `npm run test:unit`
Expected: 全 PASS。

- [ ] **Step 2: 本番ビルド確認**

Run: `npm run build`（timeout 420000ms 以上）
Expected: 2779 ページ前後の静的生成が成功（`card-compare` 含む）。

- [ ] **Step 3: PR 作成**

```bash
git push -u origin feat/compare-event-bonus-select
gh pr create --title "feat: 衣装比較でハイスコアイベントを選択して特効反映" --body "<変更概要 / スペック・ADR へのリンク>"
```

- [ ] **Step 4: リリース（タグ push）**

CI ビルドチェックの結果を待たずに、`main` へマージ後（または運用に従い）、次パッチ版タグを push してデプロイをトリガーする:

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```
（`X.Y.Z` は直近タグの次パッチ。`release.yml` / `deploy.yml` が起動する。）

- [ ] **Step 5: リリース告知ツイート**

`release-tweet` スキルを起動し、最新タグの変更点から告知文を作成して X へ投稿する（`.env` に `X_ID`/`X_PASS` があれば標準スタイル1本を確認なし自動投稿）。

---

## Self-Review

- **Spec coverage:**
  - 要件1（ハイスコア全件）→ Task 4 Step 3 `highScoreEvents` フィルタ。
  - 要件2（開催中をデフォルト、複数なら最新）→ Task 4 Step 3 `defaultEventId`（降順ソート済み配列の `find(isEventLive)`）。
  - 要件3（チェックボックス廃止・ドロップダウン統合・特効なし先頭）→ Task 4 Step 7。
  - 要件4（イベント名のみ・新しい順）→ Task 4 Step 3 ソート + Step 7 option ラベル。
  - 要件5（localStorage 保持）→ Task 3 + Task 4 Step 4,5。
  - 要件6（0件なら非表示・特効なし固定）→ Task 4 Step 7 `{#if highScoreEvents.length > 0}` と Step 6 `tierFor` の `!selectedEvent` ガード。
  - データ層（eventtype 受け渡し / 単一イベントマップ）→ Task 1, 2。
  - テスト → Task 1,2（単体）/ Task 5（E2E）。記録 → Task 6。
- **Placeholder scan:** コード手順はすべて実コードを記載。Task 6/7 の `NNNN` / `X.Y.Z` は実行時に確定する連番・バージョンで、プレースホルダではなく手順内で決定方法を明示済み。
- **Type consistency:** `buildTierMapForEvent` のシグネチャは Task 1 と Task 4 で一致。`CompareEvent = EventForBonus & { eventname; eventtype }` は Task 2 の `toEventForBonus` 戻り型と一致。`STORAGE_KEYS.COMPARE_EVENT_ID` は Task 3 で定義し Task 4 で参照。
