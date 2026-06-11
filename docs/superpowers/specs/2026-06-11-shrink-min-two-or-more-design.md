# 判定縮小条件「2枚以上」化 設計

日付: 2026-06-11
ステータス: ユーザー承認済み
ADR: [docs/adr/0003-shrink-min-two-or-more.md](../../adr/0003-shrink-min-two-or-more.md)（背景・理由・代替案はそちらを参照）

## ゴール

編成組合計算（max-score-finder）の追加条件「判定縮小2枚編成」を、デッキ 6 枠中の縮小スキル持ち**ちょうど 2 枚**から**2 枚以上（上限なし）**に変更する。

## 仕様

### 条件の定義

| モード | 現状 | 変更後 |
| ------ | ---- | ------ |
| 通常（特効候補のみ） | 6 枠合計ちょうど 2 枚 | 6 枠合計 2 枚以上（6 枚全縮小も可） |
| 所持衣装縛り | own5 = 2 → 非縮小フレンド / それ以外 → 縮小フレンド | own5 ≥ 2 → フレンドは**全候補** / own5 ≤ 1 → **縮小フレンドのみ**（除外しない） |
| フレンド差し替え Top5 | 固定 5 枠の縮小 = 2 → 非縮小プール / それ以外 → 縮小プール | 固定 5 枠の縮小 ≥ 2 → **全候補プール** / ≤ 1 → **縮小プール** |

own5 = センター + メンバー 4 枠の縮小枚数。所持 0〜1 枚のケースを除外しないのは「その場合フレンドは確実に縮小になるはずで、最良の縮小フレンドを推薦してほしい」というユーザー要望による。

### 実装（`src/lib/score/maxScoreFinder.ts`）

- 定数 `SHRINK_PAIR_TARGET = 2` → `SHRINK_MIN = 2` にリネーム（意味: 固定枚数 → 最低枚数）。doc コメントも更新
- `enumerateChunkDecks` の `shrinkPair` 分岐: メンバー縮小枚数 `k = SHRINK_MIN - s2` 固定 → `k = max(0, SHRINK_MIN - s2)` 〜 `4` のループに一般化（縮小候補が k 枚に満たない場合は多重集合の列挙が空になるだけで特別扱い不要）。チャンク型 `{ kind: 'shrinkPair', s2, aIdx, bIdx }` は不変
- `countCombos`:
  - 非所持: `Σ_{s2=0..2} pairs(s2) × Σ_{k=max(0,2−s2)..4} C'(S,k) × C'(T,4−k)`（C' = 重複組合せ）
  - 所持: `friendPool = own5 ≥ 2 ? 全候補数 : 縮小候補数`（現状の `own5 === 2 ? 非縮小 : 縮小` を置換）
- `evaluateFriendSwap`: `pool = fixedShrink ≥ 2 ? ctx.candidates : ctx.shrink`
- 列挙と countCombos の整合（列挙総数 = countCombos）を維持する

### UI（`src/components/MaxScoreFinder.svelte`）

- チェックボックスラベル: 「判定縮小2枚編成」→「判定縮小**2枚以上**編成」
- 説明文: 新規則（own5 ≥ 2 → 全フレンド / own5 ≤ 1 → 縮小フレンドのみ、通常モードは合計 2 枚以上のみ探索）を反映
- 0 件時メッセージ「判定縮小2枚編成の条件を…」も文言更新

### テスト（`tests/unit/score/maxScoreFinder.test.ts`）

- 「全デッキの縮小枚数がちょうど 2」の検証 → 「2 以上」かつ「列挙数 = countCombos」に更新
- countCombos の期待値を新式で再計算して更新
- 所持モードの own5 別フレンドプール検証を新規則（≥2 → 全候補 / ≤1 → 縮小のみ）に更新
- `evaluateFriendSwap` のプール検証を新規則に更新
- 追加ケース: 縮小 3 枚以上のデッキが列挙に含まれること

## 非スコープ

- 最低枚数の UI パラメータ化（ADR-0003 で却下）
- 共有ブローチ・スキル Lv・特訓状態の探索条件（従来どおり固定）
- ScoreCalc（手動計算）側の挙動

## 検証

- `npm run test:unit` 全件パス
- `npm run test`（E2E、`max-score-finder.test.ts` の探索完走を含む）パス
- dev サーバーで UI 文言と組合せ数表示（条件 ON 時に増えること）を目視確認
