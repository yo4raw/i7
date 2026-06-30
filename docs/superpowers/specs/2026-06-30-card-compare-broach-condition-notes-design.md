# 衣装比較: 全属性編成ブローチの加算と条件付きブローチの前提注記

- 日付: 2026-06-30
- 関連 ADR: [0035](../../adr/0035-card-compare-broach-condition-notes.md)
- 関連: [0007 衣装比較ページ](../../adr/0007-card-compare-page.md)、`src/lib/score/cardStrength.ts`、`src/lib/score/broachResolver.ts`、`src/components/compare/CompareDetailPanel.svelte`

## 目的

1. 種類7「全属性編成」ブローチを衣装比較でも発動扱いにし、属性値を加算する。
2. 比較で加算された条件付きブローチ（種類4/5/7/9）について、その発動前提を詳細パネルに注記する。

## 背景（現状の評価モデル）

衣装比較は各衣装を 1 枚デッキ `[card, null×5]` で評価する純粋関数群（`cardStrength.ts`）で成り立つ。`calcCardStrengthAppeal` はカードの固有ブローチを 1 個ずつ装備し、`resolveDeckBroachs` で条件判定して属性値由来スコアが最大になるブローチを採用する。

種類別の 1 枚デッキでの発動可否（現状）:

| 種類 | 条件 | 1 枚デッキ判定 |
|------|------|----------------|
| 1 属性UP | 無条件 | 発動・加算 |
| 4 グループ指定 | 自枠に他グループ無し | 発動・加算（自分のみなので成立） |
| 5 アイドル属性指定 | 同アイドル同属性 1 枚以上 | 発動・倍率 1 で加算 |
| 6 属性UP上限あり | 無条件（上限はデッキ全体） | 発動・加算 |
| **7 全属性編成** | デッキに 3 属性すべて | **未発動（加算されない）** |
| 8 オート専用 | スコープ外 | 常に無効 |
| 9 スコアアップ | 楽曲一致 | 楽曲一致時にスコアボーナス |

唯一の計算上の欠落は種類7。それ以外（4/5/9）は既に加算されているが、どの前提で効いているかが画面に出ていない。

## 設計

### 1. `resolveDeckBroachs` のオプション化（broachResolver.ts）

`resolveDeckBroachs` に第 5 引数 `options?: { assumeAllAttributes?: boolean }` を追加する。`checkBroachCondition` に同フラグを伝播し、種類7（`ALL_ATTRIBUTES`）のとき:

```
case BROACH_TYPE.ALL_ATTRIBUTES:
  return assumeAllAttributes || hasAllAttributes(deck);
```

- 既定（未指定）は `false` → 従来どおり `hasAllAttributes(deck)` 判定。ScoreCalc / MaxScoreFinder は引数を渡さないため**挙動不変**。
- 種類7の発動上限（`type:7` を limit 枚まで）処理は既存のまま機能する。1 枚デッキでは 1 件のみのため limit に抵触しない。

### 2. 採用ブローチの追跡（cardStrength.ts）

`calcCardStrengthAppeal` の戻り値型を拡張する:

```
{ appeal: CardAppeal; broachScoreBonus: number; appliedBroach: FixedBroach | null }
```

- ベースライン（ブローチ無し）を初期 best とし、`appliedBroach = null` で開始。
- 各ブローチ候補がスコアを更新したとき、その `FixedBroach` を `appliedBroach` に記録。
- `resolveDeckBroachs` 呼び出し時に `{ assumeAllAttributes: true }` を渡す。

`CardStrengthEntry` に `appliedBroach: FixedBroach | null` を追加し、`buildCardStrengthEntry` で格納する。

### 3. 前提注記の対応表（cardStrength.ts）

種類→前提文を返すヘルパーを公開する:

```
export function broachPremiseNote(broach: FixedBroach | null): string | null
```

| broach_type | 戻り値 |
|-------------|--------|
| 4 | 「同グループ編成が前提」 |
| 5 | 「同アイドル・同属性編成が前提（比較では1枚分のみ加算）」 |
| 7 | 「全属性編成が前提」 |
| 9 | 「対象楽曲でのみ発動」 |
| 1 / 6 / null | `null`（注記なし） |

### 4. 詳細パネルへの注記行（CompareDetailPanel.svelte）

`appliedBroach` を持つカードのいずれかに注記があるとき、テーブルに「ブローチ前提」行を追加する（`hasShrink` 等と同様に `hasBroachNote` で出し分け）。各セルは `broachPremiseNote(entry.appliedBroach) ?? '-'` を表示。文言が長いため `text-[10px]` 程度の補助スタイルとし、折り返し可とする。

メインの `ScoreUpChart` / `ShrinkChart` には注記を出さない。

## テスト

### 単体（追加・更新）

- `tests/unit/score/broachResolverBranches.test.ts`: `assumeAllAttributes: true` で種類7が 3 属性不在デッキでも発動すること、未指定で従来どおり未発動であること。
- `tests/unit/score/cardStrength.test.ts`: 種類7ブローチを持つカードで `appeal` / `baseScore` に属性値が加算され、`appliedBroach.broach_type === 7` であること。`broachPremiseNote` の各種類の戻り値。`appliedBroach` がブローチ無し時に `null` であること。
- 既存の ScoreCalc 系単体テストが不変であること（フラグ未指定経路）。

### E2E（更新）

- `tests/card-compare.test.ts`: 種類7ブローチ衣装を選択した詳細パネルに「ブローチ前提」行と前提文が表示されること。

### カバレッジ

ADR 0032 の 95% ゲートを維持する（新規分岐はテストで網羅）。

## 非対象

- スコア計算ページ・編成組合計算の挙動変更。
- 種類5の倍率変更（比較では 1 のまま）。
- 種類8（オート専用）対応。
- メインチャート一覧への注記表示。
