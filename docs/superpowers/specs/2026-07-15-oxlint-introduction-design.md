# oxlint 導入 設計ドキュメント

- 日付: 2026-07-15
- ブランチ: `feat/oxlint-introduction`
- ステータス: 設計確定（実装計画は writing-plans で別途作成）

## 目的

本リポジトリ（IDOLiSH7 衣装DB / Astro 6 静的サイト）に、初のリンターとして **oxlint** を導入する。動機は次の3点:

1. **バグ検出** — 未使用変数・危険な比較・非同期の取りこぼしなど、壊れる前に気づく静的解析
2. **軽量・高速** — 過去の ESLint（`feat/eslint-plugin-functional` ブランチ）検証が type-aware で重かった反省から、Rust 製 oxlint 単体の高速リントに絞る
3. **コード品質の統一** — 機械的に拾える品質ルールを CI で強制する

## 前提・制約（調査で確認済み）

- 既存リンターは無し。品質ゲートは `npm run typecheck`（astro check）と Vitest カバレッジ 95% のみ。
- oxlint の対応範囲:
  - `.ts` / `.js` / `.mjs` / `.jsx` / `.tsx` は完全対応（score エンジン・`src/lib`・`scripts`・`tests` の TS ロジックをフルにカバー）
  - `.astro` / `.svelte` / `.vue` は **script ブロックのみ**対応。テンプレート構文は解析しない。`consistent-type-imports` や未使用変数検出など一部ルールは Astro/Svelte を丸ごとスキップする
  - 型情報を使うルール（type-aware）は oxlint 本体では未対応（別途 tsgolint が必要だが、軽量目的に反するため採用しない）
- 主戦場は TS ロジック層のバグ検出。テンプレートの深い解析は期待しない。これは目的2（軽量）とも整合する。
- ソース規模: TS 136 / Svelte 38 / Astro 22 ファイル。

## 採用方針の決定事項

### リンター構成

- oxlint を**唯一のリンター**として導入する（ESLint は入れない）。
- type-aware は使わない。oxlint 単体の高速リントに絞る。
- 設定ファイル `.oxlintrc.json` をリポジトリルートに1つ配置する。
- 対象: `src` / `scripts` / `tests`。`.oxlintrc.json` の `ignorePatterns` で成果物・生成物を除外する。

### 有効カテゴリ

`correctness` + `suspicious` + `pedantic` を全て `error` にする。ただし pedantic のうち本プロジェクトの規約と衝突する主観ルール・低価値ルールは明示的に `off` にする。

### 無効化するルールと根拠

`pedantic` を全部入りにすると 865 件の違反が出る（`src`+`scripts`+`tests`）。増分の大半は主観的スタイルのため、以下を `off` にする。各行の件数は導入時点の実測値。

| ルール | 件数 | off の根拠 |
|--------|------|-----------|
| `no-inline-comments` | 269 | 本プロジェクトは日本語インラインコメントを多用（CLAUDE.md も周辺のコメント密度に合わせよと指示）。規約と正面から衝突する |
| `require-unicode-regexp` | 97 | `u` フラグ付与の近代化。自動修正されず価値も薄い。軽量目的と釣り合わない |
| `max-lines-per-function` | 71 | 恣意的な行数上限。score エンジン/テストは正当に長い |
| `sort-vars` | 30 | 変数宣言のアルファベット順。価値が薄い |
| `no-negated-condition` / `unicorn/no-negated-condition` | 36 | 否定条件の可読性は文脈依存 |
| `max-lines` | 10 | 恣意的なファイル行数上限 |
| `max-depth` | 5 | 恣意的なネスト上限 |

線引きの原則: **バグ検出に効く correctness/suspicious は全て残す。pedantic のうち有用なもの（`eqeqeq` 等）は残し、規約衝突・低価値のみ off にする。**

`eqeqeq`（86件）は**残す（error）**。`== null` 等の緩い比較は実バグの温床のため有用。ただし修正は危険自動修正（`--fix-dangerously`）に頼らず1件ずつレビューする（`==`→`===` は null/undefined 挙動を変えうるため）。

### `.oxlintrc.json`（設定案）

```jsonc
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

## 既存違反の解消計画

CI blocking にするため、導入時点で違反ゼロにする。off リスト（上記8ルール）適用後の残りは約 347 件で、対応手段別の内訳は次の通り（実測ベースの概数）:

| 対応区分 | 概数 | 備考 |
|---------|------|------|
| 安全な自動修正（`oxlint --fix`） | 約100 | レビュー不要でそのまま適用可 |
| suggestion / 危険修正が必要 | 約160 | `eqeqeq`(86) ほか。挙動が変わりうるため1件ずつレビュー必須 |
| 手動対応 | 約90 | `no-shadow` / `require-await` / `consistent-function-scoping` / `no-unused-vars` 等 |

（参考: off リストに `require-unicode-regexp` を含めない場合の残りは 444 件。同ルールを off にすることで 97 件が消え約 347 件になる。）

解消手順:

1. 安全な自動修正を適用（`oxlint --fix`）→ diff レビュー → コミット
2. suggestion 系をレビューしつつ適用（`eqeqeq` ほか）→ null 比較の意図を1件ずつ確認 → コミット
3. 手動対応をルール群ごとにコミット分割:
   - `no-unused-vars` / `no-unassigned-vars`（デッドコード除去、低リスク）
   - `require-await` / `no-promise-executor-return`（async 周りの実バグ可能性、要確認）
   - `no-shadow` / `consistent-function-scoping`（リネーム・スコープ移動）
   - `unicorn/*` の残り（`prefer-string-replace-all` 等、機械的置換）
4. 各コミット後に必ず `npm run typecheck` + `npm run test:unit` を実行し、ロジック非破壊を検証する。

検証ゲート: score 計算系（`src/lib/score/`）に触れる修正は、既存の Vitest（`engine.test.ts` 等）が全 pass することを必須条件とする。MC シミュレーションのため挙動不変を担保する。

## npm scripts

```jsonc
"lint": "oxlint",
"lint:fix": "oxlint --fix"
```

oxlint は `.oxlintrc.json` と `ignorePatterns` を自動で読むため、対象パス指定は不要。

## プレコミットフック

フック管理は未導入のため新設する。**husky + lint-staged** を採用する（エコシステムの標準性と lint-staged との実績を重視。代替の `simple-git-hooks` / `lefthook` より優先）。

- devDependency に `oxlint` / `husky` / `lint-staged` を追加
- `package.json` に `"prepare": "husky"` を追加（clone 後 `npm install` でフック自動セットアップ）
- `.husky/pre-commit` → `npx lint-staged`
- lint-staged 設定（`package.json`）:
  ```jsonc
  "lint-staged": {
    "*.{ts,js,mjs,cjs,astro,svelte}": "oxlint"
  }
  ```
- コミット時に違反があれば**コミット中断**。`--fix` は付けず検知のみとし、自動書換で意図せぬ変更が混ざるのを防ぐ。

## GitHub Actions 統合

`.github/workflows/ci.yml` に独立ジョブ `lint` を追加する（既存の `quality` / `build` と並列。失敗箇所を切り分けやすくするため独立させる）:

- `actions/checkout` → `actions/setup-node`（Node 22, npm cache）→ `npm ci` → `npm run lint`
- 違反あれば exit≠0 で PR を fail（blocking ゲート）
- 既存 CI の `paths-ignore`（画像パス）は踏襲する

## ADR

以下を `docs/adr/` に記録する（CLAUDE.md の ADR 必須ルール）:

- oxlint を唯一のリンターとして導入した決定（ESLint 不採用・type-aware 不採用の理由を含む）
- 有効カテゴリと、off にした 8 ルールおよびその根拠（将来 on にする判断材料として残す）
- `docs/adr/README.md` の一覧表にも行を追加する

## スコープ外（YAGNI）

- ESLint との併用（`eslint-plugin-oxlint` 等）
- type-aware リント（tsgolint）
- oxfmt などフォーマッタ導入
- 既存コードの pedantic 全部入り対応（`no-inline-comments` 等の規約衝突ルールの解消）
- `.astro` / `.svelte` テンプレート構文の解析（oxlint 非対応）
