# スコア計算ロジック矛盾調査レポート (2026-07-02)

調査観点: (1) コード内部の整合性 (2) ADR/spec との食い違い (3) 数理的な妥当性。
対象: `src/lib/score/` 全体、`src/components/score/`、衣装比較 (`cardStrength.ts`)、`docs/adr/`、`docs/*spec*.md`。
検証状況: `npm run test:unit` 630 テスト全パス。CONFIRMED = 実データ or 実行で再現確認済み、PLAUSIBLE = コード読解上の指摘。

## 総括

コアは概ね堅牢。**ADR と計算ロジックの乖離はゼロ**、`min ≤ MC ≤ max` は構造的に保証され、noteFlattener の保存則・histogram の binning・丸め規則はすべて spec と一致していた。

一方で、**不変条件 `期待値 ≤ 理論最大値` は 4 系統で破れ、うち 2 系統は実データ＋デフォルト設定で実際に到達可能**（CONFIRMED）。また判定ガード/スコアダウンスキルの誤加点、RNG の品質問題、表示と計算の分母不一致など、実質的な矛盾が複数見つかった。

---

## 深刻度: 高

### H1. 期待値が理論最大値を超える（expected > max）— CONFIRMED

`min ≤ expected ≤ max` のうち expected ≤ max が 4 系統で破れる。

**(a) 縮小 rate 混在時の maxRate 採用** — `simulation.ts:349-361`
`calcExpectedScore` はデッキ内縮小スキルの **rate 最大値を合算カバー秒全体に適用**するが、`calcMaxScore` は発動区間ごとに固有 rate を使う。再現例: rate1.6×1枚(count40) + rate1.2×4枚(count20)、appeal 10007、100s/400ノーツ → expected 187,792 > max 143,135（+31%）。
`docs/shrink-skill-spec.md` §7-10 は「UI は Lv 一括選択なので実害なし」とするが不成立: **縮小カード 135 枚中 104 枚は L5 データが不完全**で、`resolveEffectiveSkillLevel`（`teamBuilder.ts:70-82`）が L4（rate 1.5）へ自動フォールバックするため、デフォルト「全員 Lv5」でも rate 1.6/1.5 混在が普通に発生する（実効 rate の分布: 1.1 / 1.2 / 1.5 / 1.6 を実データで確認）。

**(b) 発動率 per > 100 の実データが無クランプで流入** — `simulation.ts:337,394` / `teamBuilder.ts:24-61`
期待値は `per/100` をそのまま乗算（per=360 なら理論最大の 3.6 倍）、MC は `roll < per` で 100% 扱い、max は 100% 扱い — 3 つの推定量の解釈が三者三様。
実データ: ID 54/936（L2-L4 per=102-106、L5 空 → L4 フォールバックで per=106 が有効）、**ID 3144/3171（L1 per=360、おそらく 36.0% の入力ミス。L5 空 → L1 フォールバックで per=360 が有効）**。再現: ID 3144 相当で expected 126,140 > max 112,100。

**(c) 期待カバー率 100% 飽和時の構造的超過** — `simulation.ts:341-362`
期待値の 100% キャップは「非除外ノーツ全部カバー」前提だが、理論最大でもカウント型縮小は先頭 count−1 ノーツを構造的にカバーできない。再現: count=20/per=54/value=5/rate=1.6 ×5 枚、100s/400 ノーツ → expected 170,720 > max 167,660（全パラメータ実データ範囲内）。

**(d) 丸めの非対称（微小）** — `simulation.ts:299,359`
max はノート毎 floor、expected は一括 floor。count=1/per=100/rate=1.3/401 ノーツで expected が max を +133 上回る。

**対処案**: parseSkill での per クランプ [0,100]（＋シートデータ修正）、expected/max の rate 採用ロジック統一（例: expected も区間比例の加重 rate にする、または max 側と同じ代表 rate で揃える）。

### H2. 判定ガード/判定拡大スコアダウンが「スコアアップ」として誤加点 — CONFIRMED

`teamBuilder.ts:27` の除外リストが `MISS_TO_GOOD` と `BAD_TO_PERFECT` のみで、`判定ガード(MISS→Perfect)` と `判定拡大スコアダウン` が漏れている。usable なスキルデータを持つ **判定ガード 31 枚（うち UR 5 枚）とスコアダウン全 32 枚**が `skillType='scoreUp'` になり、value（実際はガード持続秒数など）を発動ごとに加点する。スコア**ダウン**を正の加点として扱うのは符号レベルで誤り。
例: ID 142（判定ガード、L4 count=15/per=39/value=4）→ 500 ノーツで約 +51 点。絶対値は微小（スコア 10 万超に対し数十〜百点）だが、「スキル発動」タブに発動回数付きで列挙されユーザー可視。`parseSkill` のコメント（「判定補助系スキルはスコアに影響しないため null」）および `cardStrength.ts:34` の自己文書とも矛盾しており、意図的仕様ではないと判断。

---

## 深刻度: 中

### M1. RNG が非標準実装で一様性が有意に不合格 — CONFIRMED

`rng.ts` は「XorShift128Plus」を名乗るが、実体は **32bit 状態ペアに 64bit 版のシフト定数 (23/17/26) を適用した非標準変種**。実測: χ²(16bin, 10 万サンプル, 5% 臨界値 25.0) が seed 依存で 179〜371（Math.random は 11.7）と壊滅的不合格。実利用パターンでの発動率に最大 ±0.38pt の系統偏差、連続ペアに相関あり。さらに `seed * 2654435761`（rng.ts:13）は `Date.now()` 級シードで 2^53 を超え浮動小数点精度落ちが発生。
デフォルト 100 試行では標本誤差が支配的で mean への実害は小さいが、mcMin/mcMax/p90 の裾統計と「MC が期待値へ収束する」という spec §5-4 の前提を損なう。対処案: 正規の xorshift128+（BigInt 不要なら sfc32 / mulberry32 + splitmix32 初期化）へ差し替え。

### M2. 縮小スキルの「最大発動回数」が同一画面内で二重定義 — CONFIRMED

`calcCardSkillMaxActivations`（`simulation.ts:424-436`、先頭除外を引かない）と `calcShrinkActivationCount`（`simulation.ts:176-189`、先頭除外を引く）が併存。実シミュレーション（runOnce/calcMaxScore の Phase B）は excluded ノーツでカウンタを進めないため後者が実挙動。結果、「スキル発動」タブの発動回数列と `DeckSkillDistribution` の二項分布 n（前者ベース）が、同じ行の期待値/最高値（後者ベース）より大きくなる。前者の docstring は「先頭除外は発動回数に影響しない」と主張するが実挙動と矛盾。

### M3. 編成組合計算 → スコア計算の引き継ぎで scoreOptions が欠落 — CONFIRMED

`SearchResults.svelte:44-58` の `sendToScoreCalc` が保存する state に `scoreUpAssist` / `scoreUpBadgeRate` が含まれない。探索はアシスト/バッジ込みで評価（`MaxScoreFinder.svelte:165`）するため、「スコア計算で開く」後にスコア計算側の保存値で再計算され、ヘッドラインの数値が探索結果と一致しない。

### M4. CardDetailTable が computeTeam を完全重複実装（ドリフトリスク） — CONFIRMED

`CardDetailTable.svelte:43-169` が特訓減算・ラビットノート・特効倍率・ブローチ合算・センター/フレンド floor・アシストを手で再実装。現在数式は一致しているが、**共有ブローチ加算を `rarity === 'UR'` でガードする点だけ `computeTeam` と異なる**（engine 側にレアリティチェックなし）。「共有ブローチは UR のみ・固有持ち 1 個/他 2 個」のルールが `clampSharedBroachs` / `broachCapacity` / `CardDetailTable` の 3 箇所に分散しており、clamp を通らない経路では計算と表示が食い違う。同種のドリフトリスク: 条件付き共有ブローチ倍率の三重実装（teamBuilder / CardDetailTable / broachAssignment）、`deckSkillDistribution.ts:44-56` のセンタースキル再実装。

---

## 深刻度: 低（意図的仕様の可能性・潜在リスク・文書課題）

| # | 内容 | 状態 |
|---|------|------|
| L1 | 衣装比較（cardStrength）がラビットノートを加算しない。「ユーザー非依存の比較」という意図的仕様と思われるが ADR 0007 にもファイルヘッダにも未文書 | PLAUSIBLE |
| L2 | 縮小 rate の `>= 10 なら /100` 正規化が `skillFormatter.ts:22` の表示側にのみ存在し、計算側 (parseSkill) に防御なし。% 表記データ混入時に表示 1.6 倍/計算 ×159 倍の乖離 | PLAUSIBLE |
| L3 | 「面積値」タブ（`ScoreCalcResults.svelte:171-173`）がアシスト未適用の属性値＋一括 floor で、隣の衣装詳細テーブル（アシスト適用・per-note floor）と不一致 | PLAUSIBLE |
| L4 | ノーツ総数のソースが `notes_count`（シート列、期待値系）と `notes.length`（MC/理論値）で混在。現 145 曲は全一致だがシート列が食い違うと乖離 | PLAUSIBLE |
| L5 | 縮小区間の秒→ノート floor 換算で MC/max が期待値より約 5% 下振れ（spec §5-4 に既記載の意図的仕様）。ただし極端な低密度曲（durationNotes=0）では expected > max に転じる（実楽曲密度 2.95〜6.17 ノーツ/秒では発生せず） | 一部 CONFIRMED |
| L6 | ADR 0026: 開催中イベントがある期間に「特効なし」を明示選択してもリロードで復元されない（`CardCompare.svelte:62-65`）。design spec 自体が ADR と矛盾しており実装は spec に忠実 | CONFIRMED（軽微） |
| L7 | 探索後にイベント選択を変えると SearchResults の詳細テーブルだけ新 tier で再計算され見出しスコアと食い違う（一時的 UI 状態） | PLAUSIBLE |
| L8 | 期待値のデッキ合計と per-card 合計の不一致（rate 混在時）— `calcCardSkillExpected` の docstring に明記済みの意図的仕様 | 文書化済み |
| L9 | spec 文書の追従漏れ: engine.ts 分割後の行番号参照、`ComputedTeam` Assisted フィールド記述、`maxScoreUpCoverage`/`maxShrinkCoverage` 未記載、§6-3 の effectiveSeconds 式の headSeconds 控除漏れ、§5-4 サンプルの先頭除外範囲、`calcShrinkCoverage`「4 指標」vs 実装 9 フィールド。いずれも数値影響なし | CONFIRMED（文書のみ） |
| L10 | 統計の慣行差: p90 が実質 91 パーセンタイル / stddev が母標準偏差(÷n) / MC_ITERATIONS=100 で SE ≈ σ/10 | 実害なし |

---

## 検証済み・問題なしの領域

- **ADR 0002〜0035 のスコア計算関連 15 件すべて実装準拠**（計算ロジックの乖離ゼロ）。ADR 0035（全属性編成ブローチ）は `assumeAllAttributes` が衣装比較のみに閉じ、注記と計算の前提が一致
- **maxScoreFinder は engine を re-use** しており別実装による食い違いは構造上なし（探索もラビットノート込み）
- **min ≤ MC ≤ max は構造的に保証**（runOnce は calcMaxScore の発動サブセット）
- **noteFlattener**: 145 曲全てでノーツ総数・構成・順序が保存。**histogram**: binning にオフバイワンなし
- **丸め規則**（特効 round / センター・フレンド独立 floor / アシスト floor / ノーツ 2 段 floor）と定数（NOTE_RATE / LIGHT_MULTIPLIER / センタースキル率 / 特効倍率 / TRAIN_BONUS）は spec と完全一致
- `getCenterSkillRate` は全経路で同一関数・同一式
- 破棄 ADR の残骸コードなし

## 推奨対応（優先順）

1. **parseSkill に per の [0,100] クランプ追加** ＋ シートの入力ミス修正（ID 3144/3171 の per=360、ID 54/936 の per=102-106 の妥当性確認）
2. **判定ガード/スコアダウンを parseSkill の除外リストへ追加**（`MISS_TO_PERFECT` 定数は定義済み。スコアダウンは SKILL_TYPE 定数の新設が必要）
3. **expected と max の縮小 rate 採用ロジック統一**（L5 フォールバックによる rate 混在が常態である前提で設計）
4. RNG を既知の良性アルゴリズムへ差し替え
5. 発動回数表示の分母統一（M2）、探索→スコア計算の scoreOptions 引き継ぎ（M3）
6. computeTeam 重複実装の解消・共有ブローチ装備ルールの engine 集約（M4）
7. spec 文書の追従（L9）と意図的仕様の明文化（L1 ほか）
