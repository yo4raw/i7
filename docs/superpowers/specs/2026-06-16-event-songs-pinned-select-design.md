# イベント対象楽曲のピン留め＋曲選択ドロップダウン共通化 設計

- 日付: 2026-06-16
- 関連 ADR: [0021](../../adr/0021-event-songs-pinned-select.md)

## 目的

`allowed-songs.json` の `allowedIds`（その ID の曲だけ表示するグローバル許可リスト）を、**イベント対象楽曲を曲選択の先頭に出すピン留め**へ転換する。全曲は表示したうえで、対象曲を最上部にグループ表示し、初期選択を対象曲の先頭にする。あわせて3か所に重複していた曲選択ドロップダウンを共通コンポーネント化する。

## データモデル

`src/data/allowed-songs.json` → `src/data/event-songs.json` にリネーム、キー `allowedIds` → `eventSongIds`。

```json
{
  "note": "曲選択ドロップダウンで「イベント対象楽曲」として先頭グループに出す楽曲 ID（配列順がそのまま表示順／先頭が既定選択）。空配列なら対象グループ非表示。",
  "eventSongIds": [67, 68, 72, 76, 135, 146, 147]
}
```

`src/lib/data/fetchSongsJson.ts`:
- `filterAllowedSongs` / `ALLOWED_SONG_IDS` を**削除**
- `getEventSongIds(): number[]` — config の配列順をそのまま返す
- `firstEventSongId(songs: Song[]): number | null` — config 順で songs に存在する最初の ID（既定選択用）。曲配列の順序には依存しない

## 共通コンポーネント `src/components/SongSelect.svelte`

Props:
- `songs: Song[]`
- `value: number | null`（bindable）
- `onChange?: (id: number | null) => void`
- `class?: string`（select の class。既定はスコア計算と同じ）
- `placeholder?: string | null`（既定 `'楽曲を選択'`。`null` で空 option を出さない）
- `id?: string`

optgroup 順: `イベント対象楽曲`（config 順）→ `選択中の曲（N曲・秒数順）`（`i7_selected_songs`、内部算出）→ `カテゴリ別`。option ラベルは統一して `曲名 (難易度) - N秒 / Mノーツ`。`value` は数値 ID で、内部で文字列⇄数値を吸収し変更時に bind 更新＋`onChange` を呼ぶ。

## 消費側の統合

- **ScoreCalc** / **MaxScoreFinder** / **CardCompare** の `<select>` を `<SongSelect>` に置換。各コンポーネントのローカル `pickedSongs` / `categorizedSongs` derive は削除（コンポーネント内部へ集約）
- 初期選択は `firstEventSongId` の先頭
  - ScoreCalc: `i7_score_calc_state` の復元を優先、なければ先頭
  - CardCompare: 旧 `DIAMOND FUSION` 既定ロジックを撤去し先頭に。`onChange` で `selectedIds` リセット（既存挙動維持）
  - MaxScoreFinder: 先頭（`selectedSongId` の型を `number | ''` → `number | null` に変更）

## 絞り込みの全廃

`filterAllowedSongs(filterValidSongs(x))` → `filterValidSongs(x)` を全 11 箇所で適用（SongList / CardCompare / MaxScoreFinder / ScoreCalc / `songs/[id]` / `index` / `score-calc/index` / `max-score-finder/index` / `songs/index` / `card-compare/index` / `decks/index`）。楽曲一覧・ホーム・詳細・選択肢すべて全曲表示に戻る。

## テスト

- 単体（`tests/unit/data/eventSongs.test.ts`）: `getEventSongIds` / `firstEventSongId` の純粋ロジック（config 順優先・該当なしで null・空配列で null）
- E2E（`tests/card-compare.test.ts`）: 先頭 optgroup が `イベント対象楽曲`、初期選択がその先頭 option と一致（config 値に依存しない）

## 検証結果

- 型チェック（`astro check`）0 errors / 単体 301 件パス
- dev サーバーで3画面とも先頭グループ「イベント対象楽曲」・全曲表示・初期選択がイベント先頭曲（スコア計算は復元優先）を確認
- 関連 E2E 12 件パス
