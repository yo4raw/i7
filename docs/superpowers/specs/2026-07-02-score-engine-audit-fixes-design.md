# スコア計算エンジン監査指摘（深刻度 高・中）修正 設計

- 日付: 2026-07-02
- 対象: `claudedocs/score-logic-audit-2026-07-02.md` の H1 / H2 / M1 / M2 / M3 / M4
- 関連 ADR: [0036](../../adr/0036-expected-score-rate-weighting.md) / [0037](../../adr/0037-parse-skill-input-hygiene.md) / [0038](../../adr/0038-replace-rng-sfc32.md) / [0039](../../adr/0039-shared-broach-capacity-single-source.md)

## 目的

スコア計算エンジンの監査で確認された「期待値 ≤ 理論最大値の不変条件の破れ」「判定ガード/スコアダウンの誤加点」「RNG 品質」「表示と計算の分母不一致」「画面間の設定引き継ぎ欠落」「計算ロジックの重複実装」を解消し、期待値・理論値・MC・表示の整合を回復する。

## H1: 期待値が理論最大値を超える問題

### (a) 縮小 rate の加重化（simulation.ts `calcExpectedScore`）

現行はデッキ内縮小スキルの **rate 最大値** を合算期待カバー秒全体へ適用しており、rate 混在時（L5 データ欠落による L4 フォールバックで常態的に発生）に期待値が理論最大を超える。

変更後の式:

```
weightedSec  = Σᵢ ( numActᵢ × valueᵢ × perᵢ/100 × (rateᵢ − 1) )
rawSec       = Σᵢ ( numActᵢ × valueᵢ × perᵢ/100 )
scale        = rawSec > capSeconds ? capSeconds / rawSec : 1   // 比例縮小キャップ
shrinkExpected = floor( eligibleBaseScore × weightedSec × scale / effectiveSeconds )
```

- 縮小スキルが 1 種類の rate のみの場合、現行式と**数値完全一致**（`(maxRate−1) × min(rawSec, cap)/effective` と同型）。既存 golden テスト・スプレッドシートオラクル照合は不変。
- 実装は `calcShrinkCoverage` に rate 加重フィールドを追加し、`calcExpectedScore` がそれを使う。表示用の既存フィールド（カバー率系）は変更しない。

### (c) 飽和キャップの補正

期待カバー秒の上限 `capSeconds` を `effectiveSeconds` から「構造的に到達可能な秒数」へ補正する:

```
capSeconds = effectiveSeconds − (minCount / notesCount) × songDuration
minCount   = デッキ内ノート型縮小スキルの count 最小値（タイマー型のみなら補正なし）
```

理論最大値の発動モデルでもノート型縮小の初回発動は先頭から count ノーツ目以降であり、それ以前の区間は理論上カバー不能なため。

### (d) 残差のクランプによる厳密保証

rate 加重・構造キャップ後も、縮小の秒→ノート離散化（floor）やキュー配信順の近似誤差で期待値が理論最大値を 1% 未満上回る縮退ケースが残る。このため `calcMaxScore` の内部合計を `calcMaxBaseTotal`（バッジ・ブローチ適用前）として抽出し、縮小スキルを含むデッキでは期待値のライブ終了スコアを `min(liveEnd, maxBaseTotal)` でクランプする。クランプ時は `shrinkExpected` を差分調整して内訳の合計整合を保つ。`applyFinalBonus` は単調のため最終値も理論最大以下が保証される。縮小スキルなしのデッキでは追加コストなし。

### (b) per クランプ → ADR 0037（下記 H2 と同じ parseSkill で対処）

## H2: 判定ガード / 判定拡大スコアダウンの誤加点（+ H1(b)）

`teamBuilder.ts parseSkill` を変更:

1. `SKILL_TYPE` に `SCORE_DOWN: '判定拡大スコアダウン'` を追加し、除外リストへ `MISS_TO_PERFECT` / `SCORE_DOWN` を追加 → 両スキルは `null`（スキルなし）扱い。判定補助系を無視する既存ポリシーに揃え、スコアダウンの減点モデル化は行わない。
2. `per` を `Math.min(per, 100)` にクランプ。per>100 の実データ（ID 54/936 の 102〜106、ID 3144/3171 の 360）が期待値だけ理論値の per/100 倍になる非整合を防ぐ。期待値・MC・理論値の三者が「100% 発動」で一致する。

表示側（`skillFormatter`）は両スキル種別に効果文を返さない現行挙動のままで計算と一致する。

## M1: RNG 差し替え（rng.ts）

現行 `XorShift128Plus` は 32bit 状態に 64bit 版シフト定数を適用した非標準変種で、χ² 一様性検定に大差で不合格・発動率に系統偏差・`Date.now()` シードで浮動小数点精度落ちがある。

- **sfc32** に差し替え、シードは **splitmix32** で 4 状態へ展開（`seed >>> 0` の 32bit で受けるため精度落ちなし）
- クラス名は実体に合わせ `Sfc32` へ変更。`constructor(seed: number)` / `next(): number`（[0,1)）の API は維持
- import 3 箇所（noteFlattener / simulation / specDiagrams）を更新
- シード固定の MC 回帰テスト（mcMin/mcMax/mean/stddev の固定値）は新値へ更新する

## M2: 発動回数の分母統一（simulation.ts `calcCardSkillMaxActivations`）

ノート型縮小スキルの最大発動回数を実挙動（excluded ノーツではカウンタが進まない）と同じ `floor((notesCount − excludedCount) / count)` に統一する。

- シグネチャに `excludedCount: number = 0` を追加し、内部は `calcShrinkActivationCount` へ委譲
- 呼び出し元: `ScoreCalcResults.svelte`（スキル発動タブ）と `deckSkillDistribution.ts`（二項分布の n）が excluded 数を渡す
- 「先頭除外は発動回数に影響しない」とする docstring を削除・訂正

## M3: 探索 → スコア計算の scoreOptions 引き継ぎ（SearchResults.svelte / ScoreCalc.svelte）

`sendToScoreCalc` が保存する state に `scoreUpAssist` / `badgeRate` を追加する（キー名は `ScoreCalc.svelte` の `applyState` に合わせる）。実装調査で `ScoreCalc` 側は `badgeRate` のみ永続化しており `scoreUpAssist` は保存・復元されていないことが判明したため、受け側にも `scoreUpAssist` の保存（`buildStateObject`）・復元（`applyState`）・チェックボックス変更時の即時保存を追加する。これにより探索時の評価条件とスコア計算画面の再計算条件が一致する。

## M4: 共有ブローチ容量ルールの一本化と CardDetailTable のリファクタ

1. **容量ルールの単一ソース化**: 「UR のみ装備可・固有ブローチ持ち UR は 1 個・それ以外の UR は 2 個」を `broachAssignment.ts broachCapacity` に一本化し、`deckState.ts clampSharedBroachs` はそれを呼ぶ
2. **engine での防御適用**: `computeTeam` が共有ブローチ加算時に容量ルールを適用（非 UR・容量超過分を無視）。clamp を通らない経路（状態注入・手書き localStorage）でも計算が正になる
3. **CardDetailTable の再実装廃止**: `CardDetailTable.svelte` の属性値手計算（特訓減算・ラビットノート・特効・ブローチ・センター/フレンド floor）を削除し、`computeTeam` の出力（`team.cards` の per-card 値・`team.Shout` 等）から表示を組み立てる。UR ガードの独自実装は engine 側の容量ルールに吸収される

## テスト戦略

- 監査で再現した不変条件破れ（rate 混在 / per>100 / 飽和 / 判定ガード誤加点）を先に失敗テストとして追加し、修正で green にする（TDD）
- 既存 golden（348,051 等）とスプレッドシートオラクル照合は単一 rate 前提のため不変を確認
- RNG 差し替えに伴う MC 固定値テストのみ新値へ更新
- `npm run test:unit` 全パス + カバレッジゲート維持
- `npm run dev` でスコア計算 / 編成組合計算 / 衣装比較のスクリーンショット確認

## スコープ外

- 深刻度「低」の指摘（衣装比較のラビットノート非加算、rate 正規化の非対称、面積値タブ、spec 文書の行番号追従など）
- スプレッドシート側のデータ修正（ID 3144/3171 の per=360 など。シート管理者へ報告事項）
- 判定ガード / スコアダウンの効果そのもののモデル化（判定精度・減点のシミュレーション）
