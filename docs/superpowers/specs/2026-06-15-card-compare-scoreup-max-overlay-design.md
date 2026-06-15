# 衣装比較 スコアアップタブに最大値を重ね、期待/最大ソートを追加

- 日付: 2026-06-15
- ステータス: ユーザー承認済み
- 関連 ADR: [0016](../../adr/0016-card-compare-shrink-coverage.md)（縮小タブの対称設計）

## 背景と問題

衣装比較ページの判定縮小タブは [0016](../../adr/0016-card-compare-shrink-coverage.md) で、期待カバー秒数（発動確率込み）と最大カバー秒数（100%発動）を2段積みで重ね、期待／最大のソートを選べるようにした。

一方スコアアップタブは「属性値由来スコア + スキル期待値」の2段積み・期待値合計の降順のみで、スキルの最大値（100%発動時の上振れ上限）が見えない。縮小タブと操作・見え方を揃え、上振れ上限も比較できるようにしたい。

## 決定

スコアアップタブを縮小タブと対称な構成にする。

### 比較値

| 値 | 式 |
|----|----|
| スキル期待値 | `floor(maxActivations × (per/100) × value)`（既存 `skillExpected`） |
| スキル最大値 | `maxActivations × value`（確率を掛けない、100%発動時。新規 `skillMax`） |
| 期待スコア合計 | `baseScore + skillExpected`（既存 `totalScore`） |
| 最大スコア合計 | `baseScore + skillMax`（新規 `maxTotalScore`） |

`value` はスコアアップスキルの1発動あたりのスコア値。判定補助系・スキルなし・判定縮小系は `skillMax = 0`（`maxTotalScore = baseScore`）。

### ソート

- スコアアップタブにソートセレクタを追加: **期待スコア合計 / 最大スコア合計**（既定=期待）
- 縮小タブの `compareShrinkBy` と対になる `compareScoreUpBy(key: 'expected' | 'max')` を新設。降順、同値は属性値由来スコアの降順
- `CardCompare` のインラインソート（`b.totalScore - a.totalScore`）を `compareScoreUpBy` に置換

## UI

### チャート（`ScoreUpChart.svelte`）

棒を下から3段積みにする:

1. 属性値由来スコア（青・実体）
2. スキル期待値（濃い橙・実体）
3. スキル最大値 − スキル期待値（薄い橙・上乗せ＝発動率による目減り）

- 棒の総高さ = 最大スコア合計。スケール基準は全表示衣装の `maxTotalScore` の最大値（クリップ防止）
- 上部ラベルに期待・最大の両方を併記（例: `期待 38.2万 / 最大 52.1万`）
- 凡例に薄い橙（最大−期待）の説明を追加

### 詳細比較パネル（`CompareDetailPanel.svelte`）

縮小タブにカバー秒数の最大/期待行を足したのと対称に、スコアアップ系の行を追加する:

- 「スキル最大値」行（既存「スキル期待値」の隣）
- 「合計（最大）」行（既存「合計」の隣）
- スコアアップスキルを持つ衣装が選択にある場合のみ表示（`skillMax > 0` のエントリが存在するとき）

## 実装範囲

- `src/lib/score/cardStrength.ts`: `CardStrengthEntry` に `skillMax` / `maxTotalScore` 追加、`buildCardStrengthEntry` で算出、`ScoreUpSortKey` 型と `compareScoreUpBy(key)` を新設
- `src/components/compare/ScoreUpChart.svelte`: 3段積み・期待/最大ラベル・凡例・スケール基準変更・`sortKey` props
- `src/components/CardCompare.svelte`: `scoreUpSort` state（既定 expected）、スコアアップタブのソートセレクタ、`scoreUpEntries` のソート置換、props 受け渡し
- `src/components/compare/CompareDetailPanel.svelte`: スキル最大値・合計(最大) 行を追加
- テスト: `cardStrength` の `skillMax`/`maxTotalScore`/`compareScoreUpBy` 単体テスト、E2E にスコアアップソートセレクタの確認を追加

## 影響範囲外（変更しない）

- 判定縮小タブ・カバー秒数算出
- 比較ページの前提条件（UR 限定 / Perfect 前提 / センター無視 / 固有ブローチ込み / 特効トグル）
