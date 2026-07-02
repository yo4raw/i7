# 0039: 共有ブローチ容量ルールの単一ソース化と CardDetailTable の engine 出力化

- 日付: 2026-07-02
- ステータス: 承認

## 背景

「共通ブローチは UR のみ装備可・固有ブローチ持ち UR は 1 個・それ以外の UR は 2 個」というゲームルールが、`deckState.ts clampSharedBroachs` / `broachAssignment.ts broachCapacity` / `CardDetailTable.svelte` の 3 箇所に独立実装されていた。計算エンジン（`computeTeam`）自体はこのルールを持たず、clamp を通らない経路（状態注入・手書き localStorage）では「スコアには加算されるがテーブルには表示されない」食い違いが起こり得る。

また `CardDetailTable.svelte` は特訓減算・ラビットノート・特効倍率・ブローチ合算・センター/フレンド floor・アシストまで `computeTeam` の全計算を手で再実装しており、現在は数式が一致しているものの、修正時に片側だけ直すと即座に乖離するドリフトリスクが監査で指摘された。

## 決定

1. **容量ルールを `broachCapacity`（broachAssignment.ts）へ一本化する。** `clampSharedBroachs` は `broachCapacity` を呼ぶ実装に変更する。
2. **`computeTeam` が共有ブローチ加算時に容量ルールを適用する。** 非 UR のカードや容量超過分の共有ブローチは加算しない。UI の clamp は入力補正として残すが、エンジンが最終的な正となる（防御的多重化）。
3. **`CardDetailTable.svelte` の属性値手計算を廃止する。** `computeTeam` の出力（`team.cards` の per-card 値・チーム合計・センター/フレンド内訳）から表示を組み立て、重複実装を解消する。UR ガードの独自実装はエンジン側の容量ルールに吸収される。

## 検討した代替案

- **現状維持（clamp が常に走る前提を維持）** — 3 実装の同期を人力で保証し続けることになり、監査で確認したとおり既に UR ガードの有無という差分が生じている。却下。
- **容量ルールを `computeTeam` のみに置き UI の clamp を廃止** — 装備 UI 上で超過選択がそのまま残り、ユーザーに「効いていない装備」が見える。入力補正（clamp）と計算防御（engine）の両輪とする。

設計の詳細は [docs/superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md](../superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md) を参照。
