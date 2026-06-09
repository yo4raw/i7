# スコア計算ロジックの v1.0.6 整合プロジェクト 設計書

> 作成: 2026-06-09
> 関連調査メモ: `docs/spreadsheet-v1.0.6-investigation.md`
> 参照正: ota-life.com「アイナナスコア計算ツール」**v1.0.6**

## 背景と目的

現行 `src/lib/score/` のスコア計算と、コミュニティで使われる ota-life.com スプレッドシート
**v1.0.6** のロジック差分を**明文化・検証**し、**より良い計算ロジック**を構築する。

到達目標:

- **期待値・最大値**はスプレッドシート v1.0.6 に一致させる（検証・修正の対象）。
- **分布**は engine.ts の乱数モンテカルロが出す独自結果とし、スプレッドシートに合わせる対象外。
- 当面はスプレッドシートを参照正として差分を抽出し、差分が出たら「engine とスプレッドシートの
  どちらが実機に近いか」を個別判断する。

## プロジェクト分解

3 つのサブプロジェクトに分解し、それぞれが独立した spec → plan → 実装サイクルを持つ。
**本設計書が実装まで規定するのはサブプロジェクト A のみ**。B / C は A 完了後に別 spec を起こす。

| | サブプロジェクト | 依存 | 本書での扱い |
| --- | --- | --- | --- |
| **A** | たちばなさんロジック削除 | なし（独立） | **実装まで詳細規定** |
| **B** | v1.0.6 差分の明文化＋検証オラクル構築 | なし | 概要のみ（次 spec） |
| **C** | engine.ts を v1.0.6 に合わせて改善 | B | 概要のみ（B 完了後 spec） |

---

## サブプロジェクト A: たちばなさんロジック削除（本書の実装対象）

### 目的

スプレッドシートと同じトグル（`scoreUpFullActivation` / `shrinkFullActivation` /
`excludeNotes20` / `specialEffectActive`）を持つ代替計算 `tachibana/` は、
本プロジェクトの「本体エンジンを v1.0.6 に合わせる」方針と役割が重複する。
撤去してエンジンを単線化し、後続 B / C の見通しを良くする。

### スコープ（やること）

1. **`src/lib/score/tachibana/` をディレクトリごと削除**（`constants.ts` / `engine.ts` /
   `index.ts` / `types.ts` の 4 ファイル）。

2. **`src/components/ScoreCalc.svelte` から以下を除去**:
   - import 文（L27）: `import { computeTachibanaResult, TACHIBANA_DEFAULT_OPTIONS, type TachibanaResult } from '../lib/score/tachibana';`
   - `recalculate()` 内の `renderTachibanaResult(team)` 呼び出し（L877-879 付近）。
   - 早期 return ブランチ内の `_q('tachibana-result').classList.add('hidden');`（L843）。
   - `renderTachibanaResult()` 関数定義の全体（L881 以降。`computeTachibanaResult` を呼び結果を
     `#tachibana-result` パネルに描画する一連）。
   - UI マークアップ: チェックボックス `#opt-tachibana` とサブオプション群
     `#tachibana-options`（`#opt-tachibana-scoreup-full` / `-scoreup-boost` / `-scoreup-boost-val` /
     `-shrink-full` / `-exclude-notes20` / `-special-effect`）（L1611-1640 付近）。
   - 結果セクション `<section id="tachibana-result">`（L1828 付近）。
   - state 保存（`saveState()` 内 L1147-1169 の `tachibana` オブジェクト構築と、返却 state への `tachibana,` 追加）。
   - state 復元（`if (state.tachibana) { ... }` ブロック L1221-1233）。
   - イベントリスナー登録（L1491 付近の `#opt-tachibana` change ハンドラとサブオプション開閉）。

3. **ドキュメントのたちばな言及除去**: `CLAUDE.md` / `docs/score_calc_spec.md` 等に
   たちばな記述があれば削除（`grep -rni "tachibana\|たちばな"` で残存ゼロを確認）。

4. **リリースノート更新**（`git commit` 前に必須・プロジェクト規約）。

### スコープ外（やらないこと）

- 既存スコア計算の主機能（`calcExpectedScore` / `calcMaxScore` / `calcMinScore` /
  `runSimulation`）のロジックには一切触れない。
- `i7_score_calc_state` の旧 `tachibana` キーのマイグレーションは行わない
  （復元側を削除すれば未知キーとして自然に無視されるため不要）。

### 影響範囲

スコア計算ページのたちばな表示パネルと、その入力チェックボックス群が消えるのみ。
通常の最低/期待/最大スコア・MC分布・state 保存復元・編成シェア URL には影響しない。

### 受け入れ基準（検証）

1. `npm run test:unit` が全てパスする（スコアエンジンのユニットテスト群）。
2. `grep -rniE "tachibana|たちばな" src/` の結果が 0 件。
3. `npm run dev` でスコア計算ページ（`http://localhost:4321/score-calc/`）を開き:
   - たちばな関連 UI（チェックボックス・サブオプション・結果パネル）が表示されない。
   - 通常のスコア表示（最低/最大/期待値/MC分布）が従来どおり動作する。
   - state の保存→リロード→復元が壊れていない。
   - スクリーンショットを `tmp/` に保存しユーザー確認を取る。
4. ビルド成功は CI（PR 時の `ci.yml`）に委ねてよい（A はルート全件生成に影響しないため
   ローカル `npm run build` は必須としない）。

---

## サブプロジェクト B（次 spec・概要）

**検証手法: 案2 オラクル化 ＋ 案1 でライブ値担保**

1. v1.0.6 スコア計算シートの 817 数式を、忠実な参照実装 `src/lib/score/spreadsheetReference.ts`
   （または `tests/` 配下のリファレンス）として TS 移植する。`docs/spreadsheet-spec-v1.0.5.md` と
   既存 diff doc を下敷きにしつつ、v1.0.5→v1.0.6 の数式差分を確認して反映。
2. `tests/unit/score/` にオラクル比較テストを追加し、ランダム多数デッキで engine.ts の
   `calcExpectedScore` / `calcMaxScore` と参照実装を**構成要素別**（属性値スコア / スコアアップ /
   縮小 / 最終リザルト）に自動比較。
3. スプレッドシートのライブ値（GViz CSV）を少数のゴールデンケースとして採取し、参照実装の
   移植正しさを担保する。
4. 「期待値 ＝ スコアアップ確率UP・縮小フル発動以外のトグル状態」「最大値 ＝ フル発動トグル」の
   厳密な対応を確定し、現行 `calcExpectedScore` / `calcMaxScore` のどちらが対応するかを明文化。
5. 差分結果を `docs/spreadsheet-score-calc-diff.md` の **v1.0.6 版**として更新（既存 v1.0.5 版は
   履歴として残すか置換するかは B の spec で決める）。

**留意点（調査済み）**: スプレッドシートは単一値しか出さず、フル発動トグル ON の値を期待値と
取り違えるリスクがある。比較時は必ず「どのトグル状態の値か」を明示する。

## サブプロジェクト C（B 完了後 spec・概要）

B のオラクル比較テストを回帰テストとして使い、engine.ts の `calcExpectedScore` /
`calcMaxScore` を v1.0.6 に一致させる。差分ごとに「スプレッドシート準拠にするか、engine の方が
実機に近いとして維持するか」を個別判断する。MC 分布（`runSimulation`）は対象外。
