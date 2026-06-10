# max-score-finder 探索ロジック抽出と Web Worker 並列化 設計書

> 作成: 2026-06-10
> 対象: `src/components/SecretsTool.svelte` / `src/lib/score/`（新規モジュール追加）
> 関連: PR #265 / #266（縮小2枚条件の探索フィルタ）

## 背景と問題

編成組合計算（max-score-finder）の総当たり探索には 2 つの構造的問題がある。

### 問題1: メインスレッド単線実行による速度と UI 応答性の限界

探索ループは `SecretsTool.svelte` 内でメインスレッド実行され、1 デッキごとに
`computeTeam` → `computeShrinkExclusion` → `flattenNotes` → `calcExpectedScore` /
`calcMaxScore` を呼ぶ。3,000 評価ごとに `setTimeout(0)` で yield しているものの、
数百万通りの組合せでは分単位の待ち時間になり、その間ブラウザの応答性も劣化する。
CPU コアは 1 つしか使われていない。

### 問題2: 探索ロジックが UI コンポーネントに同居しテスト不能

組合せ数学（`binomial` / `multichoose` / `countMultisetsWithLimits`）、多重集合
ジェネレーター、3 分岐する探索ループ（通常 / 縮小2枚条件 / 所持衣装検索）がすべて
984 行の Svelte コンポーネント内にある。PR #265 / #266 で `ownedOnly` ×
`shrinkPairOnly` の分岐が増えて複雑化が進んでいるが、「`comboCount` の事前計算値と
実際の列挙数が一致する」という基本不変条件すら単体テストされていない。

## 設計判断（ユーザー合意済み）

| 項目 | 決定 |
| --- | --- |
| スコープ | **抽出 + Worker 並列化のみ**。flattenNotes キャッシュ・枝刈り（branch & bound）は今回含めず、効果測定後に別途判断 |
| 並列化方式 | **案A: チャンクキュー方式**。メインがチャンクをキューに積み、Worker プールが空き次第取得。案B（静的 N 等分）は ownedOnly の skip による負荷偏りを吸収できず、案C（メイン列挙 + Worker 評価のみ）はメインスレッドの列挙負荷が残るため不採用 |
| 結果の同一性 | 評価関数は現行と同一のため**スコアは完全一致**。列挙順序の変化により Top10 内の同点順位のみ入れ替わる可能性を許容 |
| 中断機構 | postMessage + Worker 側の定期 yield でフラグ確認。SharedArrayBuffer は COOP/COEP ヘッダーが必要になるため不採用 |

## モジュール構成

```
src/lib/score/maxScoreFinder.ts         # 純粋ロジック（新規・SecretsTool から抽出）
src/lib/score/maxScoreFinder.worker.ts  # Worker エントリ（新規・薄いラッパー）
src/components/SecretsTool.svelte       # UI + Worker プール管理のみに縮小
```

`engine.ts` / `noteFlattener.ts` / `broachResolver.ts` 等は**変更なし**
（Worker からそのまま import する）。

### `maxScoreFinder.ts` の公開 API

| 関数 | 役割 |
| --- | --- |
| `countCombos(config)` | 評価対象の組合せ総数。現行 `comboCount` の $derived 計算を移管し、UI の事前表示と進捗分母の両方で同一関数を使う |
| `generateChunks(config)` | チャンク記述子を列挙するジェネレーター |
| `evaluateChunk(chunk, config, data, callbacks)` | チャンク内のデッキを列挙・評価し、ローカル Top-K と評価件数を返す。`callbacks` 経由で定期 yield・進捗通知・中断確認 |
| `mergeTopK(lists, k)` | 複数のローカル Top-K リストをスコア降順でマージ |

組合せ数学（`binomial` / `multichoose` / `countMultisetsWithLimits`）と多重集合
ジェネレーター（`multisetIndices` / `multisetIndicesOrEmpty`）も本モジュールへ移動。

`config` は探索モード（evalMode / ownedOnly / shrinkPairOnly）・候補カード集合・
所持上限・ScoreOptions を含むプレーンオブジェクト。`data` は楽曲・ブローチ・特効
tier・ラビットノートなど評価に必要な静的データ。すべて structured clone 可能。

## チャンク分割

| モード | チャンク単位 | チャンク数の目安 | チャンク内仕事量 |
| --- | --- | --- | --- |
| 通常 | (center, friend) 多重集合ペア 1 つ | multichoose(N,2)。N=30 で 465 | multichoose(N,4)。N=30 で約 4.1 万デッキ |
| 縮小2枚条件 | s2 グループ内の (c0, c5) ペア 1 つ | 全 s2 合計で同程度 | multichoose(S,k) × multichoose(T,4−k) |
| 所持衣装検索（縮小条件併用含む） | センター 1 枚 | 所持候補数 | 所持上限内の 4-多重集合 × フレンドプール |

数百チャンク × 数秒粒度のため、所持枚数違反 skip による仕事量の偏りはキュー方式で
自然に均される。

## Worker プロトコル

```
メイン → Worker:
  { type: 'init', config, data }          # 起動時に 1 回
  { type: 'chunk', descriptor }           # 空き Worker へ逐次ディスパッチ
  { type: 'abort' }                       # 中断要求

Worker → メイン:
  { type: 'progress', evaluatedDelta, localBest }  # 3,000 評価ごと
  { type: 'result', topK, evaluated }              # チャンク完了ごと
```

- Worker は 3,000 評価ごとに `await`（マイクロタスク yield）してメッセージループに
  制御を返し、abort フラグを確認する
- メインは `result` 受信のたびに `mergeTopK` でグローバル Top10 を更新し、次の
  チャンクをディスパッチする
- 進捗バー・ETA・暫定 1 位の表示は `progress` の集約で現行 UI を維持する。進捗
  テキストに並列数を添える（例:「探索中… 45%（8並列）」）
- Worker 数: `min(8, max(1, navigator.hardwareConcurrency − 1))`
- Worker 生成: `new Worker(new URL('./maxScoreFinder.worker.ts', import.meta.url),
  { type: 'module' })`。Vite が自動バンドルする。実行はすべてクライアント端末上で
  あり、完全静的サイト原則（CLAUDE.md）に適合する
- 探索終了・中断時は Worker プールを terminate して解放する

## 探索後処理

フレンド差し替え Top5（最適編成の center + member4 を固定してフレンドのみ全候補で
再評価、最大でも候補数ぶん ≒ 数十件）は現行どおりメインスレッドで実行する。
ロジックは抽出済みモジュールを共用する。

## 影響範囲

| 項目 | 影響 |
| --- | --- |
| 探索結果（best / Top10 / フレンド Top5 のスコア） | **完全一致**（同点順位の並びのみ変動しうる） |
| 探索時間 | 並列数倍の短縮を期待（4〜8 コア環境で 1/4〜1/8 目安） |
| UI 応答性 | 探索中もメインスレッドが空くため改善 |
| `SecretsTool.svelte` | 探索ロジック約 250 行が削除され UI + プール管理のみに |
| 既存テスト | `engine.ts` 等は無変更のため影響なし |

## テスト計画（`tests/unit/score/maxScoreFinder.test.ts`）

1. **列挙数の一致**: 全モード（通常 / 縮小2枚 / 所持 / 所持×縮小2枚）× 複数
   パラメータで `countCombos(config)` と実列挙デッキ数が一致すること
2. **分割の完全性**: 全チャンクを順次 `evaluateChunk` した結果と、チャンク順を
   シャッフルして実行し `mergeTopK` した結果が一致すること（重複・漏れの検出）
3. **Top-K マージ**: 同点・件数不足・空リストの境界ケース
4. **中断**: 途中で abort しても部分結果（Top-K・評価件数）が整合していること

評価には既存フィクスチャ（`tests/fixtures/`）を使用。Worker エントリは薄い
ラッパーのため Vitest 対象外とし、ロジックはすべて純粋モジュール側で検証する。
動作確認は `npm run dev` + ブラウザで実探索を実行し、並列化前後のスコア一致と
所要時間を比較する。

## 実測結果（2026-06-10 検証）

検証環境: ローカル dev サーバー（並列版・8 Worker）vs 本番 https://i7.yo4raw.com
（v1.12.29・旧逐次実装）。イベント「IDOLiSH7記念日2026」（金特効 7 / 銀特効 84、
候補 91 枚）、楽曲 MONSTER GENERATiON (EXPERT+)、評価指標 = 算術期待値、
アシスト OFF / バッジ 0%。所持データはテスト用に 7 種各 1 枚
（cardID 743〜747, 1195, 1362）を localStorage に設定し両環境で共通化。

### 結果一致（旧実装との比較）

| 条件 | 組合せ数 | 最終リザルト | 旧実装（本番） | 一致 |
| --- | --- | --- | --- | --- |
| 所持衣装で検索 | 9,555 | 2,833,667 | 2,833,667 | ✅ 内訳・編成・フレンド Top5・Top10 すべて一致 |
| 所持 × 判定縮小2枚 | 5,370 | 2,707,025 | 2,707,025 | ✅ 同上 |

スコア内訳（属性値スコア / スコアアップ期待値 / 判定縮小期待値 / ライブ終了時）も
全項目一致。`countCombos` の事前表示も旧実装と一致（9,555 / 5,370 / 653,853,915）。

### 探索時間

| 条件 | 旧実装（本番・逐次） | 並列版（8 Worker） | 短縮率 |
| --- | --- | --- | --- |
| 9,555 通り | 3.17 秒 | 279 ms | 約 11.4 倍 |
| 5,370 通り | 1.81 秒 | 216 ms | 約 8.4 倍 |

※ 本番は minify 済みビルド、ローカルは dev ビルドでの計測（dev 側が不利な条件でも
8〜11 倍）。並列数は `min(8, hardwareConcurrency − 1, チャンク数)`。

### 動作確認

- 進捗表示: 「探索中… N%（8並列, 評価数 / 総数, 残り約 X 分, 暫定 1位: Y）」が
  Worker からの progress 集約で更新されることを 6.5 億通りの探索で確認
- 5,000,000 通り超の confirm ダイアログ表示・キャンセルが機能
- 中断: 6.5 億通り探索を 312,000 件評価時点で中断 → 「※探索中断」表示 +
  部分結果（暫定 1 位 2,621,385）が正しく表示され、Worker は terminate される
- コンソールエラーなし（DataCloneError・Worker エラーの発生なし）
- フレンドプール規則（スロット0-4 の縮小枚数による切替）が探索結果・フレンド
  Top5 の両方で遵守されることを確認
