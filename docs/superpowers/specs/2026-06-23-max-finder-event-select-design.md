# 編成組合計算：ハイスコアイベント選択機能 設計

- 日付: 2026-06-23
- 対象: `src/components/MaxScoreFinder.svelte` / `src/pages/score-calc/max-score-finder/index.astro` / `src/lib/storage.ts`

## 目的

編成組合計算（max-score-finder）は現状、`isEventLive` で判定した**現在開催中のイベント**の金/銀特効 UR 衣装しか探索対象にできない。開催中イベントが無い期間や、過去のハイスコアイベントを振り返って理論値最大編成を検討したいケースに対応できない。

そこで、**過去のハイスコアライブイベントを選択**し、その金/銀特効 UR 衣装を対象に理論値最大編成を探索できるようにする。衣装比較画面（`CardCompare.svelte`）に既存のイベント選択 UI / 永続化パターンがあるため、それを踏襲する。

## 決定事項

- 選択対象は**ハイスコアライブイベントのみ**（`isHighScoreEvent` でフィルタ）。ポイント/ミッション系イベントは選択肢に出さない。
- 選択中イベントは**編成組合計算専用の localStorage キー**に永続化する（衣装比較の `i7_compare_event_id` とは独立。両画面の選択は連動させない）。

## アーキテクチャ

CardCompare.svelte の前例を踏襲する。

### 1. イベントリストと既定選択

- `events`（`EventForBonus & { eventname; eventtype }`）を `isHighScoreEvent(eventtype)` で絞り、`start_date` 降順に並べた `highScoreEvents` を構築する。
- 既定選択 `defaultEventId` = 開催中（`isEventLive`）のハイスコアイベントがあればその `id`、無ければ `highScoreEvents` 先頭（最新）の `id`。
- これにより、開催中イベントがある期間に開いた既存ユーザーには従来通り「開催中イベント」が選択された状態となり、体感挙動は変わらない。

### 2. 候補・ティアの導出元を「選択中の単一イベント」に切り替え

現状は以下が `currentLiveEvents`（日時依存）に依存している:

- `currentTierMap`（`buildLiveTierMap`）
- `currentCandidates` / `goldCandidates` / `silverCandidates` / `shrinkCandidates`
- `buildSearchInput()` の `candidates` / `tierByCardId`

これらを**選択中イベント** `selectedEvent`（単一）を起点に再定義する:

- ティアマップ: 日付非依存の `buildTierMapForEvent(selectedEvent)` を使用（過去イベントでも金/銀/銅を正しく再現する）。
- 候補集合: `selectedEvent.gold` ∪ `selectedEvent.silver` の UR 衣装。
- `selectedEvent` が null の場合（ハイスコアイベントが 1 件も無い理論上のケース）は候補空・探索無効とする。

既存の所持枚数集計（`ownedCandidates` / `ownedGoldCount` / `ownedSilverCount`）・組合せ数（`comboCount`）・探索ロジックは候補集合の参照先が変わるだけで、構造は変更しない。

### 3. UI

- 既存セクション見出し「📅 現在開催中のイベント」→「📅 対象イベント」に変更。
- セクション先頭に `<select>` を追加（CardCompare と同じスタイル。各 option に開催中バッジ相当の表示）。
- セレクタの下は従来通り、選択中イベントの金/銀特効枚数・候補合計・評価組合せ数・候補衣装の展開（`<details>`）を表示する。
- ページ冒頭の説明文「開催中イベントの 金特効 / 銀特効 …」→「選択したイベントの 金特効 / 銀特効 …」に調整。
- 探索無効理由の文言「開催中イベントに金/銀特効 UR 衣装がありません」→「選択中イベントに金/銀特効 UR 衣装がありません」に調整。

### 4. 永続化

- `src/lib/storage.ts` の `STORAGE_KEYS` に `MAX_FINDER_EVENT_ID: 'i7_max_finder_event_id'` を追加。
- `onMount` で保存値を読み込み、`highScoreEvents` に存在する `id` のときのみ採用（無効値は既定選択にフォールバック）。
- 選択変更時に `saveJson` で保存（`mounted` フラグでマウント直後の上書きを防ぐ、CardCompare と同じ作法）。
- `FooterTools.svelte` のバックアップは `STORAGE_KEYS` を列挙するため、新キーは自動的にエクスポート/インポート対象に含まれる。
- `CLAUDE.md` の localStorage キー一覧表に 1 行追記する。

### 5. ADR

- `docs/adr/0029-max-finder-event-select.md` を追加し、README.md の一覧表にも行を追加する。

## スコープ外（YAGNI）

- ポイント/ミッション系イベントの選択。
- 複数イベントの同時選択・横断探索。
- イベント選択の衣装比較画面との連動（専用キーで独立させる）。

## テスト方針

- `npm run dev`（HMR）で以下を確認:
  - セレクタにハイスコアイベントが新しい順で表示され、開催中があれば既定選択されること。
  - 選択切替で候補枚数・評価組合せ数・候補衣装展開が更新されること。
  - 選択がリロード後に復元されること（localStorage）。
- 既存 E2E に max-score-finder 対象テストがあれば影響有無を確認。無ければ最小の表示確認に留める。
