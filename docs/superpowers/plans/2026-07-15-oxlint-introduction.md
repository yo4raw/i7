# oxlint 導入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IDOLiSH7 衣装DB（Astro 6 静的サイト）に初のリンターとして oxlint を導入し、CI blocking ゲートとプレコミットフックで品質を強制する。

**Architecture:** oxlint を唯一のリンターとして採用（ESLint / type-aware は使わない）。ルートに `.oxlintrc.json` を1枚置き、`correctness`+`suspicious`+`pedantic` を error にしつつ規約と衝突する主観ルール8件を off にする。既存違反を「自動修正→suggestionレビュー→手動」の順で解消してからプレコミット（husky+lint-staged）と CI ジョブを追加する。

**Tech Stack:** oxlint 1.74.0 / husky 9.1.7 / lint-staged 17.0.8 / Node 22 / npm / GitHub Actions

## Global Constraints

- Node.js は `.nvmrc` の 22 を使う。作業前に `nvm use` 等で 22 を有効化する。
- 作業ブランチは `feat/oxlint-introduction`（既に作成済み・チェックアウト済み）。main で作業しない。
- Docker は使わない。すべてホスト環境で npm scripts を直接実行する。
- 依存追加は `--save-exact` でバージョン固定する（oxlint=1.74.0, husky=9.1.7, lint-staged=17.0.8）。
- score 計算系（`src/lib/score/`）に触れる修正は、`npm run typecheck` と `npm run test:unit` が両方 pass することを必須とする。MC シミュレーションのため挙動不変を担保する。
- 完全静的サイトの原則を壊さない（サーバーサイド依存を追加しない）。oxlint / husky / lint-staged はすべて devDependency（ビルド成果物に含めない）。
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` を付ける。
- ユーザー可視テキストの用語は「衣装」（内部識別子は `card`）。本計画は主に設定・ロジックの変更で可視テキストは変えない。
- 設計の典拠: `docs/superpowers/specs/2026-07-15-oxlint-introduction-design.md`。

---

## File Structure

- `package.json` — devDependency（oxlint/husky/lint-staged）、`lint`/`lint:fix`/`prepare` scripts、`lint-staged` 設定を追加。
- `package-lock.json` — 依存追加に伴い自動更新。
- `.oxlintrc.json`（新規） — oxlint の唯一の設定ファイル。カテゴリ・off ルール・ignorePatterns。
- `.husky/pre-commit`（新規） — `npx lint-staged` を呼ぶプレコミットフック。
- `.github/workflows/ci.yml` — 独立ジョブ `lint` を追加。
- `docs/adr/0045-introduce-oxlint.md`（新規） — 意思決定記録。
- `docs/adr/README.md` — ADR 一覧表に 0045 の行を追加。
- `src/**` `scripts/**` `tests/**` — 既存 lint 違反の解消に伴う修正（Task 2〜4）。

---

## Task 1: oxlint インストールと設定ファイル・npm scripts の追加

**Files:**
- Modify: `package.json`（`devDependencies` に oxlint、`scripts` に `lint`/`lint:fix`）
- Modify: `package-lock.json`（自動）
- Create: `.oxlintrc.json`

**Interfaces:**
- Produces: `npm run lint`（oxlint を `.oxlintrc.json` 準拠で実行、違反ゼロで exit 0）、`npm run lint:fix`（安全な自動修正を適用）。以降の全タスクがこの2つを使う。
- Produces: `.oxlintrc.json`（カテゴリ correctness/suspicious/pedantic=error、off ルール8件、ignorePatterns）。

- [ ] **Step 1: oxlint を devDependency として固定インストール**

Run:
```bash
npm install --save-dev --save-exact oxlint@1.74.0
```
Expected: `package.json` の `devDependencies` に `"oxlint": "1.74.0"` が入る。`node_modules/oxlint/` が生成される。

- [ ] **Step 2: 設定スキーマのパスを確認**

Run:
```bash
ls node_modules/oxlint/configuration_schema.json
```
Expected: パスが存在して表示される。もし存在しない場合のみ、次ステップの `$schema` 値を
`https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json`
に差し替える。

- [ ] **Step 3: `.oxlintrc.json` を作成**

Create `.oxlintrc.json`:
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": {
    "correctness": "error",
    "suspicious": "error",
    "pedantic": "error"
  },
  "rules": {
    "no-inline-comments": "off",
    "max-lines-per-function": "off",
    "max-lines": "off",
    "max-depth": "off",
    "sort-vars": "off",
    "no-negated-condition": "off",
    "unicorn/no-negated-condition": "off",
    "require-unicode-regexp": "off"
  },
  "ignorePatterns": ["dist/**", "coverage/**", ".astro/**", "node_modules/**", "tmp/**", "_build/**", "deps/**"]
}
```

- [ ] **Step 4: `package.json` に lint scripts を追加**

`package.json` の `scripts` に次の2行を追加する（既存 `typecheck` の近くでよい）:
```json
"lint": "oxlint",
"lint:fix": "oxlint --fix"
```

- [ ] **Step 5: ベースライン違反数を計測して記録**

Run:
```bash
npm run lint 2>&1 | grep -cE "^\S+:[0-9]+:[0-9]+: (error|warning)"
```
Expected: 約 347 件（実測ベースの概数。数十件の増減は oxlint マイナー差で許容）。この数値を後続タスクの削減目標の起点としてメモする。

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json .oxlintrc.json
git commit -m "chore: oxlint を導入し設定ファイルと lint scripts を追加

correctness+suspicious+pedantic を error とし、規約と衝突する主観ルール8件を off。
既存違反の解消はこの後のコミットで行う。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> 注: この時点では CI にもプレコミットにも組み込まない（違反が残っているため）。組み込みは Task 5・6 で違反ゼロ達成後に行う。

---

## Task 2: 安全な自動修正の適用

**Files:**
- Modify: `src/**` `scripts/**` `tests/**`（`oxlint --fix` が書き換えた範囲のみ）

**Interfaces:**
- Consumes: Task 1 の `npm run lint:fix` / `npm run lint`。
- Produces: 安全な自動修正が適用され、違反数が約100件減った状態。

- [ ] **Step 1: 修正前の作業ツリーがクリーンなことを確認**

Run:
```bash
git status --porcelain
```
Expected: 出力なし（前タスクをコミット済みで未追跡の作業差分がない）。差分がある場合は先に整理する。

- [ ] **Step 2: 安全な自動修正を適用**

Run:
```bash
npm run lint:fix
```
Expected: `oxlint --fix` が実行され、複数ファイルが書き換わる（`--fix-suggestions` / `--fix-dangerously` は付けない = 安全な修正のみ）。

- [ ] **Step 3: 差分を目視レビュー**

Run:
```bash
git diff --stat
git diff
```
Expected: 機械的な安全修正（例: `unicorn/no-array-sort` の `toSorted()` 化、未使用 import 削除等）のみ。意味が変わる変更が混じっていないことを確認する。疑わしい変更があれば該当ファイルだけ `git checkout -- <path>` で戻し、Task 4 の手動対応に回す。

- [ ] **Step 4: 型チェックと単体テストで非破壊を検証**

Run:
```bash
npm run typecheck && npm run test:unit
```
Expected: どちらも pass。特に `tests/unit/score/*.test.ts` が全 green。

- [ ] **Step 5: 違反数の減少を確認**

Run:
```bash
npm run lint 2>&1 | grep -cE "^\S+:[0-9]+:[0-9]+: (error|warning)"
```
Expected: Task 1 のベースラインから約100件減っている（概ね 240〜250 件前後）。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "style: oxlint の安全な自動修正を適用

oxlint --fix による機械的修正のみ。typecheck と unit test が pass することを確認済み。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: suggestion / 危険修正のレビュー適用（eqeqeq ほか）

**Files:**
- Modify: `src/**` `scripts/**` `tests/**`（`eqeqeq` など挙動が変わりうる修正の対象箇所）

**Interfaces:**
- Consumes: Task 2 完了後の状態、`npm run lint`。
- Produces: `eqeqeq` 等の要レビュー系違反が解消された状態。

> このタスクは自動一括ではなく**1件ずつレビュー**が本質。`--fix-dangerously` の一括適用は禁止（`== null` → `=== null` は null/undefined の扱いを変えてバグを生むため）。

- [ ] **Step 1: 残りの違反をルール別に一覧化**

Run:
```bash
npm run lint 2>&1 | grep -oE "(eslint|unicorn|typescript|oxc|import|promise)\([a-z-]+\)" | sort | uniq -c | sort -rn
```
Expected: `eslint(eqeqeq)` が最多（約86件）。以降このリストを潰す対象とする。

- [ ] **Step 2: `eqeqeq` 違反の箇所を列挙**

Run:
```bash
npm run lint 2>&1 | grep "eqeqeq"
```
Expected: `file:line:col` 形式で各 `==` / `!=` の位置が出る。

- [ ] **Step 3: 1件ずつ手修正**

各箇所について、対象を Read して意図を確認し、次の基準で修正する:
- 通常の値比較 → `==` を `===`、`!=` を `!==` に変更。
- `x == null`（null と undefined の両方を意図的に拾う緩い比較）→ 挙動を保つため `x === null || x === undefined` に展開するか、意図が undefined 単独/null 単独なら厳密比較に置換。**元の意図を変えないこと。**

例（値比較の厳密化）:
```ts
// before
if (rarity == "SSR") { ... }
// after
if (rarity === "SSR") { ... }
```
例（null 緩い比較の意図保存）:
```ts
// before
if (value == null) { ... }
// after
if (value === null || value === undefined) { ... }
```

- [ ] **Step 4: `eqeqeq` 以外の suggestion 系も同様に手当て**

Step 1 のリストのうち機械的に安全に置換できるもの（例: `unicorn/prefer-string-replace-all` の `.replace(/x/g, …)` → `.replaceAll("x", …)`、`unicorn/explicit-length-check` の `arr.length` → `arr.length > 0`）を、該当箇所を Read して1件ずつ修正する。判断に迷う複雑なものは Task 4 に送る。

- [ ] **Step 5: 型チェックと単体テストで非破壊を検証**

Run:
```bash
npm run typecheck && npm run test:unit
```
Expected: どちらも pass。比較演算の変更で分岐挙動が変わっていないことをテストで担保する。

- [ ] **Step 6: 違反数の減少を確認**

Run:
```bash
npm run lint 2>&1 | grep -cE "^\S+:[0-9]+:[0-9]+: (error|warning)"
```
Expected: 概ね 90 件前後まで減少（手動対応の残りのみ）。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "fix: oxlint の eqeqeq 等をレビューしつつ厳密比較へ修正

== null は挙動維持のため === null || === undefined へ展開。typecheck と unit test が pass。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 手動対応（ルール群ごと）と lint クリーンの達成

**Files:**
- Modify: `src/**` `scripts/**` `tests/**`（残存違反の対象箇所）

**Interfaces:**
- Consumes: Task 3 完了後の状態、`npm run lint`。
- Produces: `npm run lint` が違反ゼロ（exit 0）の状態。以降のプレコミット・CI ゲート化の前提。

> 残り約90件を性質の近いルール群に分けて順に潰す。各群ごとに typecheck + unit test を回し、コミットを分ける（レビューしやすくするため）。

- [ ] **Step 1: デッドコード系を解消（`no-unused-vars` / `no-unassigned-vars`）**

Run `npm run lint 2>&1 | grep -E "no-unused-vars|no-unassigned-vars"` で箇所を列挙。各箇所を Read し、未使用の import / 変数 / 引数を削除する。意図的に未使用の引数はリネーム（先頭 `_`）ではなく、可能なら削除する。副作用のある式は消さない。
検証: `npm run typecheck && npm run test:unit`（pass）。
コミット:
```bash
git add -A
git commit -m "refactor: oxlint 指摘の未使用変数・import を除去

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: 非同期系を解消（`require-await` / `no-promise-executor-return`）**

Run `npm run lint 2>&1 | grep -E "require-await|no-promise-executor-return"` で箇所を列挙。各箇所を Read し:
- `require-await`: `await` を使っていない `async` 関数は、呼び出し側が Promise を必要としないなら `async` を外す。必要なら実際の `await` 漏れ（実バグ）を修正する。
- `no-promise-executor-return`: `new Promise((resolve) => resolve(x))` の executor で値を return している箇所を、`resolve(x)` を文として書き `return` しない形へ直す。
検証: `npm run typecheck && npm run test:unit`（pass）。**このステップは実バグを含む可能性があるため差分を丁寧にレビューする。**
コミット:
```bash
git add -A
git commit -m "fix: oxlint 指摘の async/Promise の不整合を修正

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: スコープ系を解消（`no-shadow` / `consistent-function-scoping`）**

Run `npm run lint 2>&1 | grep -E "no-shadow|consistent-function-scoping"` で箇所を列挙。各箇所を Read し:
- `no-shadow`: 外側スコープと同名の変数をリネームして衝突を解消する（意味が伝わる名前にする）。
- `consistent-function-scoping`: 親スコープの変数を捕捉していない内部関数を外側スコープへ移動する。ただし移動でテストの可読性や意図が損なわれる場合は、そのファイルの当該ルールをインラインで無効化（`// oxlint-disable-next-line unicorn/consistent-function-scoping`）してよい。
検証: `npm run typecheck && npm run test:unit`（pass）。
コミット:
```bash
git add -A
git commit -m "refactor: oxlint 指摘の変数シャドウ・関数スコープを整理

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: 残りの unicorn / その他ルールを解消**

Run `npm run lint 2>&1 | grep -oE "(eslint|unicorn|typescript|oxc|import|promise)\([a-z-]+\)" | sort | uniq -c | sort -rn` で残りを確認。各ルールについて該当箇所を Read し、oxlint の help メッセージに従って機械的に修正する（例: `unicorn/no-new-array` → `Array.from({length: n})`、`unicorn/prefer-dom-node-append` → `.append()`、`unicorn/new-for-builtins` → `String(x)` など）。DOM 系ルールは `.astro`/`.svelte` の script ブロックに出るものも含むため、該当ファイルを Read して修正する。真に不適切な指摘のみインライン無効化コメントで抑止し、理由をコメントに書く。
検証: `npm run typecheck && npm run test:unit`（pass）。
コミット:
```bash
git add -A
git commit -m "refactor: oxlint 指摘の残存 unicorn ルール等を解消

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: lint クリーンを確認**

Run:
```bash
npm run lint; echo "exit=$?"
```
Expected: 違反出力なし、`exit=0`。

- [ ] **Step 6: 最終回帰確認（型・単体・E2E の一部）**

Run:
```bash
npm run typecheck && npm run test:unit
```
Expected: 両方 pass。加えて score 計算に触れた場合は dev サーバー起動 + Playwright/chrome-devtools MCP でスコア計算画面を目視確認し、スクリーンショットを `tmp/` に保存する（CLAUDE.md の Workflow 準拠）。

---

## Task 5: プレコミットフック（husky + lint-staged）

**Files:**
- Modify: `package.json`（devDependency に husky/lint-staged、`prepare` script、`lint-staged` 設定）
- Modify: `package-lock.json`（自動）
- Create: `.husky/pre-commit`

**Interfaces:**
- Consumes: Task 4 完了後の lint クリーン状態。
- Produces: コミット時にステージ済み `.ts/.js/.mjs/.cjs/.astro/.svelte` を oxlint で検査し、違反があればコミットを中断するフック。

> Task 4 で違反ゼロを達成した後に導入する。先に入れると既存違反でコミットがブロックされるため。

- [ ] **Step 1: husky と lint-staged を固定インストール**

Run:
```bash
npm install --save-dev --save-exact husky@9.1.7 lint-staged@17.0.8
```
Expected: `devDependencies` に両方が固定バージョンで入る。

- [ ] **Step 2: husky を初期化**

Run:
```bash
npx husky init
```
Expected: `.husky/pre-commit`（既定は `npm test`）が作られ、`package.json` に `"prepare": "husky"` が追加される。

- [ ] **Step 3: `.husky/pre-commit` の内容を lint-staged に差し替え**

`.husky/pre-commit` の中身を次の1行だけにする:
```sh
npx lint-staged
```

- [ ] **Step 4: `package.json` に lint-staged 設定を追加**

`package.json` のトップレベルに追加する:
```json
"lint-staged": {
  "*.{ts,js,mjs,cjs,astro,svelte}": "oxlint"
}
```

- [ ] **Step 5: フックが「クリーン時に通る」ことを確認**

Run:
```bash
git add package.json package-lock.json .husky/pre-commit
git commit -m "chore: husky + lint-staged のプレコミットで oxlint を実行

ステージ済みの ts/js/astro/svelte を oxlint で検査し違反時はコミット中断。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Expected: pre-commit で lint-staged が走り、違反なくコミット成功。

- [ ] **Step 6: フックが「違反時に止まる」ことを確認して元に戻す**

Run:
```bash
node -e "const f='tmp/oxlint_hook_check.ts'; require('fs').writeFileSync(f, 'const x = 1; if (x == 1) {}\n')"
git add -f tmp/oxlint_hook_check.ts
git commit -m "test: pre-commit block check"
```
Expected: `eqeqeq` 違反で lint-staged が fail し、**コミットが中断される**（`exit≠0`）。
後片付け:
```bash
git restore --staged tmp/oxlint_hook_check.ts
rm tmp/oxlint_hook_check.ts
```
Expected: 検証用ファイルが消え、作業ツリーがクリーンに戻る（`git status --porcelain` が空）。

---

## Task 6: CI に lint ジョブを追加

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 4 の lint クリーン状態、`npm run lint`。
- Produces: PR で `npm run lint` が違反を出したら fail する独立 CI ジョブ `lint`。

- [ ] **Step 1: `ci.yml` に独立ジョブ `lint` を追加**

`.github/workflows/ci.yml` の `jobs:` 配下に、既存 `quality` / `build` と並列になるよう次のジョブを追加する:
```yaml
  lint:
    name: Lint (oxlint)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
```

- [ ] **Step 2: ワークフローの YAML 構文を確認**

Run:
```bash
node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/^\s{2}lint:/m.test(y)) throw new Error('lint job not found'); console.log('lint job present')"
```
Expected: `lint job present` が表示される（インデント2スペースで `lint:` ジョブが存在）。

- [ ] **Step 3: ローカルで CI と同じ lint を実行して緑を確認**

Run:
```bash
npm run lint; echo "exit=$?"
```
Expected: 違反なし、`exit=0`（CI でも同様に通る）。

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: PR で oxlint を実行する lint ジョブを追加

違反があれば PR を fail させる blocking ゲート。既存 quality/build と並列。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: ADR の記録と一覧更新

**Files:**
- Create: `docs/adr/0045-introduce-oxlint.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: 本計画の全決定事項。
- Produces: 意思決定記録 0045 と README 一覧の行。

- [ ] **Step 1: ADR 0045 を作成**

Create `docs/adr/0045-introduce-oxlint.md`（フォーマットは `docs/adr/README.md` に従う。既存 ADR の見出し構成に合わせる）。本文に必ず含める内容:
- ステータス: 承認
- 決定: oxlint を唯一のリンターとして導入（ESLint 不採用、type-aware/tsgolint 不採用の理由 = 過去の ESLint 検証が重かった反省・軽量高速を優先）。
- 有効カテゴリ: correctness + suspicious + pedantic を error。
- off にした8ルールと各根拠（`no-inline-comments`=日本語インラインコメント多用の規約と衝突, `require-unicode-regexp`=自動修正不可・低価値, `max-lines-per-function`/`max-lines`/`max-depth`=恣意的サイズ上限, `sort-vars`=低価値, `no-negated-condition`/`unicorn/no-negated-condition`=文脈依存）。将来 on にする判断材料として残す旨も明記。
- `eqeqeq` は残す判断（実バグ検出に有用、修正はレビュー前提）。
- 統合: husky+lint-staged プレコミット（検知のみ）と CI blocking ジョブ。
- 検討した代替案: ESLint 併用（`eslint-plugin-oxlint`）、type-aware（tsgolint）、フック管理の `simple-git-hooks`/`lefthook` — いずれも不採用とその理由。
- `.astro`/`.svelte` は script ブロックのみ対応というスコープ限界。

- [ ] **Step 2: README 一覧に 0045 の行を追加**

`docs/adr/README.md` の一覧表末尾（0044 の行の下）に追加:
```markdown
| [0045](0045-introduce-oxlint.md) | oxlint を唯一のリンターとして導入(pedantic の主観ルールは off・CI/プレコミットで強制) | 承認 |
```

- [ ] **Step 3: コミット**

```bash
git add docs/adr/0045-introduce-oxlint.md docs/adr/README.md
git commit -m "docs: ADR 0045 oxlint 導入を記録

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完了後（計画の外・実行者への申し送り）

- 全タスク完了後、`npm run lint` / `npm run typecheck` / `npm run test:unit` が緑であることを最終確認する。
- リリースノート更新（CLAUDE.md の Workflow 5）→ PR 作成 → CI 確認、はユーザー確認の上で行う。oxlint 導入は挙動を変えうる修正を含むため、PR 前にユーザーへ差分サマリを提示する。

## Self-Review メモ（作成者チェック済み）

- スペック全節（構成/カテゴリ/off リスト/eqeqeq/解消計画/scripts/プレコミット/CI/ADR/スコープ外）に対応タスクあり。
- プレースホルダ無し（各ステップに実コマンド・実コード・期待結果を明記）。
- 順序依存を明記: プレコミット(Task5)・CI(Task6) は違反ゼロ達成(Task4)の後。
- バージョンは全タスクで固定値（oxlint 1.74.0 / husky 9.1.7 / lint-staged 17.0.8）で一貫。
