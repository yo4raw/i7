# 衣装比較画面：ハイスコアイベント選択式の特効反映

- 日付: 2026-06-21
- ステータス: 設計合意済み

## 背景・目的

衣装比較画面（`/card-compare/`）は現在、「イベント特効を反映」チェックボックス1つだけを持ち、ON にすると **開催中イベント全体をマージした特効**（`buildLiveTierMap`）を自動反映する。任意のイベントを選ぶ手段がなく、過去・今後のハイスコアイベントの特効を当てた比較ができない。

本変更では、衣装比較画面で **ハイスコアイベントを選択**できるようにし、選択イベントの特効（金/銀/銅 → 倍率）を比較結果へ反映する。

## 要件（合意事項）

1. 選択候補は **ハイスコアイベント全件**（過去・開催中・今後すべて。`isHighScoreEvent()` で判定）。
2. **開催中のハイスコアイベントがあればデフォルト選択**。開催中が複数ある場合は最新（`start_date` 降順の先頭）。開催中が無ければ「特効なし」。
3. 既存のチェックボックスは廃止し、**ドロップダウンに統合**。先頭に「特効なし（反映しない）」、続いてイベントを並べる。
4. ドロップダウンのラベルは **イベント名のみ**、**新しい順**（`start_date` 降順）。
5. 選択は **localStorage に保持**し、再読み込み後も復元する。
6. ハイスコアイベントが0件のときはドロップダウンを表示せず、特効なし固定とする。

## 設計

### データ層

- **`src/lib/data/fetchEventsCsv.ts`**
  - `toEventForBonus()` の戻り値に `eventtype: e.eventtype` を追加する。戻り型は `EventForBonus & { eventname: string; eventtype: string }`。

- **`src/lib/data/eventBonusTiers.ts`**
  - 単一イベント用のティアマップ生成関数 `buildTierMapForEvent(event)` を新設する。
    - 引数は `{ gold: number[]; silver: number[]; bronze: number[] }`（`EventForBonus` のサブセットで可）。
    - `TIER_RANK` を使って金 > 銀 > 銅 の優先で `Map<number, EventBonusTier>` を構築する。
    - **開催中判定（`isEventLive`）は行わない**。選ばれたイベントは期間に関係なく特効を反映する。
  - `buildLiveTierMap()` は内部で `buildTierMapForEvent` を再利用する形にリファクタする（開催中イベントを集約）。挙動は不変。

- **`src/lib/storage.ts`**
  - `STORAGE_KEYS` に `COMPARE_EVENT_ID: 'i7_compare_event_id'` を追加する。
  - これにより `FooterTools.svelte` のバックアップ対象・CLAUDE.md のキー一覧へ自動で含まれる（CLAUDE.md のキー表も更新する）。

### `src/components/CardCompare.svelte`

- props の `events` 型を `eventname` / `eventtype` 込みに拡張する（`EventForBonus & { eventname: string; eventtype: string }` の配列）。
- 派生値:
  - `highScoreEvents = events.filter((e) => isHighScoreEvent(e.eventtype))` を `start_date` 降順にソート。
  - `defaultEventId`: 開催中（`isEventLive`）のハイスコアイベントのうち最新の `id`。無ければ `null`。
- 状態: `selectedEventId: number | null` を `$state`（`null` = 特効なし）。
  - `applyBonus: boolean` と `hasLiveEvent` は廃止。
  - `onMount` で localStorage（`COMPARE_EVENT_ID`）から復元する。保存値が `highScoreEvents` に存在する id のときのみ採用し、無効なら `defaultEventId` にフォールバックする。
  - 選択変更時は `$effect` で localStorage に保存する（`null` も保存対象とし、保持要件を満たす）。
- 特効反映:
  - `selectedEvent = highScoreEvents.find((e) => e.id === selectedEventId) ?? null`。
  - `tierMap = selectedEvent ? buildTierMapForEvent(selectedEvent) : new Map()`。
  - `tierFor(card)`: `selectedEvent` が無い／`card.ID` が無いときは `'none'`、それ以外は `tierMap.get(card.ID) ?? 'none'`。
- UI:
  - 既存のチェックボックス（`{#if hasLiveEvent} ... {/if}`）を撤去する。
  - 楽曲セレクトの並びに `<select>`（aria-label: 「特効イベント」）を追加する。
    - 先頭 `<option value="">特効なし</option>`。
    - `highScoreEvents` を `eventname` のみで列挙（新しい順）。
    - `highScoreEvents.length === 0` のときは `<select>` 自体を非表示。
  - `selectedEventId` は数値 or `null` のため、`<select>` の値（文字列）との変換ヘルパーを挟む。

### 反映範囲

スコアアップタブ・判定縮小タブ・詳細パネル（`CompareDetailPanel`）はいずれも既存の `tierOf` / `EVENT_BONUS_MULTIPLIER[tierFor(c)]` 経路を通る。ソースが「開催中マージ」から「選択イベント単体」に変わるだけで、配線は現行のまま。

## テスト

- **E2E**（`tests/card-compare.test.ts`）
  - 特効イベント `<select>` が存在することを確認。
  - イベントを選択するとカード行に特効バッジ（金/銀/銅）が表示されること、「特効なし」でバッジが消えることを確認。
  - dev サーバー再利用で実行（裸の `locator('select')` は使わず `getByLabel` 等で特定）。
- **単体**（`tests/unit/` に追加）
  - `buildTierMapForEvent`: 金/銀/銅の集約と、同一カードが複数ティアに含まれる場合の優先順位（金 > 銀 > 銅）を検証。

## 記録

- リリースノート（git タグ起点の自動生成のため、コミット文言で表現）を意識した PR タイトル／コミットにする。
- ADR を追加: 「衣装比較のイベント特効反映を『開催中自動』から『ハイスコアイベント選択式』へ変更」。検討した代替案（チェックボックス併存、全イベント対象、ティアマップ事前計算）と却下理由を記載する。

## スコープ外（YAGNI）

- スコア計算画面のようなスロット個別のティア手動上書きは行わない（選択イベントの特効をそのまま反映）。
- ハイスコア以外のイベントタイプの選択は対象外。
