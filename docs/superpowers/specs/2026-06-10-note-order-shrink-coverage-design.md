# ノート並び順の修正と縮小カバー率分母の整合 設計書

> 作成: 2026-06-10
> 対象: `src/lib/score/noteFlattener.ts` / `src/lib/score/engine.ts`
> 関連仕様: `docs/shrink-skill-spec.md` §2-§4 / `docs/score_calc_spec.md` §10

## 背景と問題

### 問題1: 全体シャッフルが先頭除外の前提と矛盾する

`flattenNotes` は楽曲の集計値（ステージグループ × 属性 × 白色のノーツ数）を 1 次元配列に
展開した後、**配列全体**を Fisher-Yates シャッフルしていた。しかし:

- `notes_20` は定義上「曲の最初の 20 ノーツ」であり、この区間では縮小スキルが発動できない
  （`docs/shrink-skill-spec.md` §2）
- ライト段階（light_2 → light_6 → chorus）はライブ進行に伴い単調に上がるステージである
- `computeShrinkExclusion` は「倍率が低いグループから累積して先頭 N ノーツを除外する」
  仕様で除外ノーツを選んでいる（例: 縮小スキルの最小 count が 22 なら
  notes_20 の 20 個 + 次に倍率が低いグループの先頭 2 個 = 22 個）

全体シャッフルの結果、除外フラグ付きノーツが曲中にランダム散在し、MC シミュレーション
（`runOnce`）と `calcMaxScore` では縮小効果区間の途中に除外ノーツが混入して区間時間だけ
消費しボーナスが付かない、という実機では起きない現象が発生していた。縮小スコアが
約「除外ノーツ数 / 全ノーツ数」（Binary Vampire なら約 5%）systematic に過小評価される。

### 問題2: 期待値計算のカバー率分母がドキュメントと不一致

`calcExpectedScore` は `calcShrinkCoverage(team, notesCount, 0, excludedCount)` と
offsetSeconds=0 で呼ぶため、期待カバー率の分母が全曲尺になっていた。分子（期待縮小秒）と
基準スコア（`eligibleBaseScore`）は先頭除外後ベースなのに分母だけ全曲尺なのは非整合で、
`docs/spreadsheet-score-calc-diff.md` §5-4 の実例計算（先頭除外時間を引いた約 88.01 秒を
分母とする）とも食い違っていた。

## 設計判断（ユーザー合意済み）

| 項目 | 決定 |
| --- | --- |
| シャッフル方式 | **案A: グループ内のみシャッフル**（ステージ順は固定）。案B（シャッフル全廃）は属性の塊が生じるため不採用 |
| 除外フラグ付与 | グループ内シャッフルの**後**に先頭から付与（excluded = 曲先頭からの連続区間） |
| カバー率分母 | `calcShrinkCoverage` **内部**で先頭除外時間を控除。呼び出し側は変更不要 |
| 対応セット | 問題1と問題2は**セットで**修正（片方だけだと期待値⇔MC 間にズレが生じる） |

## 変更内容

### 変更1: `flattenNotes` — グループ内シャッフル

- ステージグループの順序（`LIGHT_MULTIPLIER` キー順 = notes_20 → light_2 → … →
  chorus_light_6）は固定
- シャッフルは各グループのスライス内のみ（シード付き Fisher-Yates は維持、再現性不変）
- 除外フラグはグループ内シャッフル後に付与: 完全除外グループは全ノーツ、部分除外
  グループは先頭 `partialCount` 個

不変条件: **excluded ノーツは配列先頭からの連続区間**（excluded の後に非 excluded が
来ることはあっても、非 excluded の後に excluded が来ることはない）。

### 変更2: `calcShrinkCoverage` — 分母から先頭除外時間を控除

```
headSeconds      = (excludeHeadCount / notesCount) × songDuration
effectiveSeconds = songDuration − offsetSeconds − headSeconds
```

`calcShrinkCoverage` の内部で計算するため、呼び出し側（`calcExpectedScore` の offset=0、
UI の発動オフセット入力）は変更不要。あわせて単一カード表示用の
`calcCardSkillExpected` / `calcCardSkillMax`（従来 `team.songDuration` を直接分母に使用）
も同じ実効秒数に揃える。

## 影響範囲

| 項目 | 影響 |
| --- | --- |
| 属性値スコア・最低スコア | **変化なし**（順序非依存。オラクル bit-exact 一致は維持） |
| 縮小スコア（MC・最大・期待値） | 約 +4〜5% 上昇（除外ノーツが効果区間に混入しなくなる＋分母縮小） |
| UI のカバー率表示 | 分母が実効秒数になり数%上昇 |
| `tests/unit/score/engine.test.ts` | シード固定の期待値を再記録 |
| `spreadsheetDiff.test.ts` | knownDiffs はコンポーネント単位分類のため変更不要（attr は順序非依存で一致維持） |
| ドキュメント | `score_calc_spec.md` §10 / `spreadsheet-score-calc-diff.md` の該当箇所を更新 |

## テスト計画

1. `flattenNotes` の新規テスト: グループ順保持／excluded が先頭に連続／同一シードで再現
2. `calcShrinkCoverage` の新規テスト: headSeconds 控除の境界（除外 0 個、全ノーツ除外、
   notesCount=0）
3. 既存テストの期待値更新（変更前後の値を比較し、+4〜5% の方向と幅が想定通りであることを
   確認してから記録）
