# たちばなさんロジック削除 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スコア計算ページから「たちばなさんロジック」代替計算を完全に撤去し、スコアエンジンを単線化する。

**Architecture:** `src/lib/score/tachibana/` ディレクトリと、`src/components/ScoreCalc.svelte` 内の 8 箇所の参照（import / 描画呼び出し / 早期return内参照 / 関数定義 / UIマークアップ2箇所 / state保存 / state復元 / イベントリスナー）を削除する。削除のみで新規挙動は無いため、検証は「`grep` で残存ゼロ」「既存ユニットテスト継続パス」「dev サーバーでコンパイル成功＋UI確認」で行う。

**Tech Stack:** Astro 6 / Svelte 5 / TypeScript / Vitest（ユニットテスト）/ Playwright（参考）

参照: 設計書 `docs/superpowers/specs/2026-06-09-score-calc-spreadsheet-alignment-design.md`（サブプロジェクト A）、調査メモ `docs/spreadsheet-v1.0.6-investigation.md`。作業ブランチ: `feat/remove-tachibana-logic`（作成済み）。

---

## File Structure

| ファイル | 責務 | 変更 |
| --- | --- | --- |
| `src/lib/score/tachibana/` | たちばな代替計算（constants/engine/index/types） | **ディレクトリごと削除** |
| `src/components/ScoreCalc.svelte` | スコア計算ページの UI とロジック統合 | たちばな参照 8 箇所を削除 |

`src/lib/score/engine.ts` 等の本体ロジックには触れない。`i7_score_calc_state` の旧 `tachibana` キーはマイグレーション不要（復元側削除で自然に無視される）。

---

### Task 1: ScoreCalc.svelte からたちばな参照を全削除し、tachibana/ ディレクトリを削除する

**Files:**
- Delete: `src/lib/score/tachibana/` (constants.ts, engine.ts, index.ts, types.ts)
- Modify: `src/components/ScoreCalc.svelte`

> 注意: 行番号は計画作成時点（2026-06-09）の目安。実行時は下記の「削除する文字列」で一致箇所を特定すること。Svelte の `<script>` から HTML を参照しているため、import を消すだけだと未使用シンボルが残るので、**8 箇所すべてを一括で消してからコンパイル確認する**。

- [ ] **Step 1: import 文を削除（L27 付近）**

削除する行:
```ts
  import { computeTachibanaResult, TACHIBANA_DEFAULT_OPTIONS, type TachibanaResult } from '../lib/score/tachibana';
```

- [ ] **Step 2: `recalculate()` 内の描画呼び出しを削除（L877-879 付近）**

削除する箇所（コメント＋呼び出しの 2 行）:
```ts
      // たちばなさんロジック（チェックON時のみ）
      renderTachibanaResult(team);
```

- [ ] **Step 3: 早期 return ブランチ内の参照を削除（L843 付近）**

削除する 1 行（`recalculate()` の「楽曲/デッキ未選択」分岐内）:
```ts
        _q('tachibana-result').classList.add('hidden');
```

- [ ] **Step 4: `renderTachibanaResult()` 関数定義を全削除（L881-922 付近）**

`function renderTachibanaResult(team: ComputedTeam) {` から、その閉じ括弧 `}`（直後に `function renderSkillPerCard(` が続く）までの関数定義ブロック全体を削除する。先頭・末尾の目印:
```ts
    function renderTachibanaResult(team: ComputedTeam) {
      const enabled = _q<HTMLInputElement>('opt-tachibana')?.checked ?? false;
      // ... 中略 ...
      _q('tachi-cards-body').innerHTML = rows;
    }
```
削除後、次の `function renderSkillPerCard(team: ComputedTeam, ...) {` が残ること。

- [ ] **Step 5: UI マークアップ（チェックボックス＋サブオプション）を削除（L1609-1638 付近）**

`<div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">` から対応する `</div>` までのブロック全体を削除する。先頭・末尾の目印:
```html
      <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
        <label class="flex items-center gap-2 text-sm" title="ON にすると、たちばなさん作のスプレッドシート計算ツール...">
          <input type="checkbox" id="opt-tachibana" class="rounded" />
          <span>たちばなさんロジックで計算する</span>
        </label>
        <div id="tachibana-options" ...>
          ... サブオプション群 ...
        </div>
      </div>
```
直前の `<p class="text-[11px] ...">バッジ倍率: 0 で未装着、例: 15 → ×1.15</p>` が残ること。

- [ ] **Step 6: 結果セクション `#tachibana-result` を削除（L1827-1864 付近）**

HTML コメント＋`<section id="tachibana-result" ...>` から対応する `</section>` までを削除する。先頭・末尾の目印:
```html
    <!-- たちばなさんロジック結果パネル（チェックON時にのみ表示） -->
    <section id="tachibana-result" class="hidden bg-white dark:bg-slate-800 rounded-lg shadow p-4">
      ... テーブル・内訳 ...
    </section>
```
直後の `<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4">`（🎲 シミュレーション統計）が残ること。

- [ ] **Step 7: state 保存から tachibana を削除（L1147-1167 付近）**

`buildStateObject()` 内の `tachibana` IIFE を削除:
```ts
      const tachibana = (() => {
        const el = rootEl.querySelector<HTMLInputElement>('#opt-tachibana');
        if (!el) return undefined;
        return {
          enabled: el.checked,
          scoreUpFull: _q<HTMLInputElement>('opt-tachibana-scoreup-full').checked,
          scoreUpBoost: _q<HTMLInputElement>('opt-tachibana-scoreup-boost').checked,
          scoreUpBoostVal: parseFloat(_q<HTMLInputElement>('opt-tachibana-scoreup-boost-val').value) || 0,
          shrinkFull: _q<HTMLInputElement>('opt-tachibana-shrink-full').checked,
          excludeNotes20: _q<HTMLInputElement>('opt-tachibana-exclude-notes20').checked,
          specialEffect: _q<HTMLInputElement>('opt-tachibana-special-effect').checked,
        };
      })();
```
さらに return オブジェクト内の `tachibana,` の 1 行も削除する。

- [ ] **Step 8: state 復元から tachibana を削除（L1220-1234 付近）**

コメント＋復元ブロック全体を削除:
```ts
      // たちばなさんロジック オプション復元
      if (state.tachibana) {
        const t = state.tachibana;
        // ... 各チェックボックス復元 ...
      }
```
直後の `if (typeof state.badgeRate === 'number') {` が残ること。

- [ ] **Step 9: イベントリスナー登録を削除（L1491-1514 付近）**

コメント＋チェックボックスハンドラ＋サブオプション for ループ全体を削除:
```ts
    // たちばなさんロジック チェックボックス・サブオプション
    const tachibanaCheckbox = _q<HTMLInputElement>('opt-tachibana');
    const tachibanaSubOptions = _q('tachibana-options');
    tachibanaCheckbox.addEventListener('change', () => {
      // ...
    });
    for (const id of [
      'opt-tachibana-scoreup-full',
      // ...
      'opt-tachibana-special-effect',
    ]) {
      const el = _q<HTMLInputElement>(id);
      const evt = el.type === 'number' ? 'input' : 'change';
      el.addEventListener(evt, () => { recalculate(); saveState(); });
    }
```
直前の `_q('opt-scoreup-badge-rate').addEventListener(...)` と直後の `_q('shrink-offset-input').addEventListener(...)` が残ること。

- [ ] **Step 10: tachibana ディレクトリを削除**

Run:
```bash
git rm -r src/lib/score/tachibana
```
Expected: 4 ファイル（constants.ts / engine.ts / index.ts / types.ts）が削除される。

- [ ] **Step 11: 残存参照ゼロを確認**

Run:
```bash
grep -rniE "tachibana|たちばな" src/
```
Expected: 出力ゼロ（何も表示されない＝残存なし）。

- [ ] **Step 12: 既存ユニットテストが通ることを確認**

Run:
```bash
npm run test:unit
```
Expected: 全テストパス（engine / shrinkExclusion / specDiagrams）。約 1〜2 秒。

- [ ] **Step 13: dev サーバーでコンパイル成功と UI を確認**

Run（バックグラウンド起動）:
```bash
npm run dev
```
`ready in` がログに出たら `http://localhost:4321/score-calc/` を Playwright MCP / chrome-devtools MCP で開く。

確認項目:
- コンパイルエラーが出ていない（dev ログにエラーなし）。
- 「たちばなさんロジックで計算する」チェックボックス・サブオプション・🌸 結果パネルが**表示されない**。
- デッキ・楽曲を選んで計算 → 最低/最大/期待値スコア・MC分布・カード別内訳が従来どおり表示される。
- ページをリロードして state（デッキ・楽曲）が復元される。

スクリーンショットを `tmp/` に保存する。

- [ ] **Step 14: スクリーンショットをユーザーに提示して確認を取る**

`tmp/` のスクショを提示し、たちばな UI 消失と通常スコア計算の正常動作について問題ないか確認を求める。OK が出るまで次に進まない。

- [ ] **Step 15: コミット**

> リリースノート（`releases/index.astro`）は git タグ/コミットから自動生成されるため、別ファイル更新は不要。このコミットメッセージがリリースノートになる。

Run:
```bash
git add src/components/ScoreCalc.svelte
git commit -m "$(cat <<'EOF'
refactor(score-calc): たちばなさんロジックを削除

スプレッドシート(ota-life.com v1.0.6)と役割が重複する代替計算 tachibana/ を
撤去し、スコアエンジンを単線化。本体の最低/期待/最大スコア・MC分布には影響なし。
旧 i7_score_calc_state の tachibana キーは復元側削除で自然に無視される。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: `src/components/ScoreCalc.svelte` の変更と `src/lib/score/tachibana/` 4 ファイル削除（Step 10 で `git rm` 済み）がまとめてコミットされる。

---

### Task 2: PR 作成

- [ ] **Step 1: push**

Run:
```bash
git push -u origin feat/remove-tachibana-logic
```

- [ ] **Step 2: PR 作成**

Run:
```bash
gh pr create --title "refactor(score-calc): たちばなさんロジックを削除" --body "$(cat <<'EOF'
## 概要
スコア計算ページから「たちばなさんロジック」代替計算を撤去する。

ota-life.com スプレッドシート v1.0.6 との整合プロジェクト（設計書: `docs/superpowers/specs/2026-06-09-score-calc-spreadsheet-alignment-design.md`）のサブプロジェクト A。スプレッドシートと役割が重複する代替計算を消し、後続の差分検証(B)・engine 整合(C)の見通しを良くする。

## 変更
- `src/lib/score/tachibana/` をディレクトリごと削除
- `src/components/ScoreCalc.svelte` からたちばな参照（import / 描画 / UI / state 保存復元 / イベントリスナー）を全削除

## 影響
- 本体のスコア計算（最低/期待/最大値・MC分布・state 保存復元・編成シェアURL）には影響なし
- 旧 `i7_score_calc_state` の `tachibana` キーは復元側削除で無視されるためマイグレーション不要

## 確認
- `grep -rniE "tachibana|たちばな" src/` → 0 件
- `npm run test:unit` パス
- `npm run dev` でたちばな UI 消失・通常スコア計算正常動作をスクショ確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR が作成され URL が返る。CI（`ci.yml`）の結果は待たずにマージ/リリースまで進めてよい（プロジェクト規約）。

---

## Self-Review

- **Spec coverage:** 設計書サブプロジェクト A のスコープ 1-4 をすべてタスク化済み。
  - 1. tachibana/ 削除 → Task 1 Step 10 ✓
  - 2. ScoreCalc.svelte の参照除去（8 箇所）→ Task 1 Step 1-9 ✓
  - 3. ドキュメント言及除去 → 調査で `CLAUDE.md`/`docs/`/`todo.md` にたちばな言及なしを確認済み（新規 docs 除く）。タスク不要だが Step 11 の grep（`src/` 対象）に加え、念のため `grep -rniE "tachibana|たちばな" CLAUDE.md docs/score_calc_spec.md todo.md` を実行しゼロを確認してよい。
  - 4. リリースノート → 自動生成のためコミットメッセージで対応（Task 1 Step 15）✓
  - 受け入れ基準（test:unit / grep ゼロ / dev スクショ / リリースノート）→ Step 11-15 ✓
- **Placeholder scan:** プレースホルダなし。削除対象は実コード片で明示。
- **Type consistency:** 関数名 `renderTachibanaResult` / `computeTachibanaResult` / 型 `TachibanaResult` / `TACHIBANA_DEFAULT_OPTIONS` は実コードと一致。残す関数 `renderSkillPerCard` も実在を確認済み。
