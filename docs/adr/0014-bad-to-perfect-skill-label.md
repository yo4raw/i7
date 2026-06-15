# 0014. 判定系スキル種別ラベルの短縮表記統一（BAD→Perfect / MISS→Perfect）

- ステータス: 承認
- 日付: 2026-06-15

## 背景

スプレッドシート由来のスキル種別 `ap_skill_type` の生値「BAD以上をPerfectに変更」「MISS以上をPerfectに変更」が長く、衣装比較ページのグラフ下ラベルなど狭い表示領域でレイアウトが崩れていた。これらの種別はサイト全体（衣装一覧/詳細/フィルタ、スコア計算、編成探索、イベント詳細、衣装比較）で表示される。加えて MISS→Perfect は「MISS以上をPerfectに変更」「MISS→Perfect」の2表記が混在していた。

## 決定

判定系スキル種別ラベルを短縮表記に統一する:

- 「BAD以上をPerfectに変更」→「**判定強化(BAD→Perfect)**」
- 「MISS以上をPerfectに変更」「MISS→Perfect」→「**判定ガード(MISS→Perfect)**」（2表記を1つに集約）

実装方針:

- 正規化を 1 箇所（`fetchCardsJson.ts` の `SKILL_TYPE_NORMALIZE`）で行い、生値を新ラベルへ変換する。`ap_skill_type` を表示する全箇所が自動的に新ラベルになる。
- ロジック照合キー `SKILL_TYPE.BAD_TO_PERFECT` / `SKILL_TYPE.MISS_TO_PERFECT` の値も新ラベルに揃える。`teamBuilder.ts` / `skillFormatter.ts` の照合は定数経由のため挙動は不変。
- 効果説明文（`skillFormatter.ts` の「…秒間BAD以上をPerfectに」）は種別ラベルではなく自然文の説明のため**変更しない**。
- バッジ短縮表記（`formatSkillBadge` の「BAD→Perfect」「MISS→Perfect」）はそのまま維持する。

## 検討した代替案

- **表示箇所ごとにラベルを置換**: 表示サイトが多く重複・漏れのリスクが高い。データ層 1 箇所の正規化を採用。
- **照合キーは生値のまま・表示だけ別ラベルにマップ**: `ap_skill_type` と定数の値がズレ、テストフィクスチャ（生値）と本番（正規化後）の不一致を招くため不採用。フィクスチャは `fetchCardsJson` 経由で再生成され新ラベルを持つため、正規化に揃えるのが一貫する。

## 影響

- `src/lib/data/fetchCardsJson.ts`（定数値＋正規化マップ）、`tests/fixtures/cards.json`（生値 → 新ラベルに同期）、`tests/unit/score/engine.test.ts`（期待値更新）。
- 表示ロジック・スコア計算は不変。
