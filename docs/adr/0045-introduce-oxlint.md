# 0045 oxlint を唯一のリンターとして導入

- ステータス: 承認
- 日付: 2026-07-15

## 文脈

本リポジトリにはこれまで静的な lint ゲートが存在せず、`typecheck` と単体テストのみで品質を担保していた。過去に ESLint + `eslint-plugin-functional` の type-aware ルール導入を検証したことがあるが、type-aware 解析はキャッシュ依存で結果が不安定になりやすく（`.eslintcache` 削除・一括実行・typecheck 併用が必須になるなど）、実行も重く、日常のコミット前チェックとして運用するには負荷が高いという反省が残っていた（参照: 過去のフィードバック記録）。

一方 oxlint は Rust 実装で高速に動作し、`correctness`/`suspicious`/`pedantic` などのカテゴリ単位で有効化できる。type-aware（`tsgolint`）を使わない範囲であれば実行速度・導入コストの両面で本リポジトリの「プレコミット + CI blocking」という運用に適している。

## 決定

1. **oxlint を唯一のリンターとして導入する**。ESLint は併用せず、type-aware 解析（`tsgolint`）も採用しない。過去の ESLint(`eslint-plugin-functional`) 検証が type-aware ゆえに重く不安定だった反省を踏まえ、軽量・高速であることを優先する。
2. **有効カテゴリ**: `correctness` + `suspicious` + `pedantic` を `error` とする（`.oxlintrc.json` の `categories`）。まず広めのカテゴリを一括で有効にし、規約と衝突する個別ルールのみ off にする方針とする。
3. **off にした 8 ルールと根拠**（将来の運用状況次第で on に戻す判断材料として、根拠をここに残す）:
   - `no-inline-comments`: 本リポジトリは日本語インラインコメントを多用する規約であり、素直に有効化すると 269 件のノイズが発生する。コメント文化そのものと衝突するため off。
   - `require-unicode-regexp`: 自動修正不可（手動で `u` フラグを付与する必要がある）かつ実害の低い指摘が 97 件あり、費用対効果が低いため off。
   - `max-lines-per-function`: 71 件。行数上限は関数の複雑さと相関するとは限らず恣意的な閾値になりがちなため off。
   - `max-lines`: 10 件。ファイル行数上限も同様に恣意的なため off。
   - `max-depth`: 5 件。ネスト深さの上限も同様に恣意的なため off。
   - `sort-vars`: 30 件。変数宣言順の並び替えは可読性への寄与が低いため off。
   - `no-negated-condition` / `unicorn/no-negated-condition`: 合計 36 件。否定条件の可否は文脈（早期リターンの読みやすさ等）に強く依存し、一律の禁止は適さないため off。
4. **`eqeqeq` は on のまま残す**。`==`/`!=` の誤用は実バグ検出に有効であり、規約との衝突もない。指摘が出た場合は自動修正に頼らずレビューを経て修正することを前提とする。
5. **統合方法**: husky + lint-staged によるプレコミットフック（ステージ済み `*.{ts,js,mjs,cjs,astro,svelte}` に対する検知のみ、`--fix` は付けない）と、CI 側の独立 blocking ジョブ（PR で違反があれば fail）の二段構えとする。プレコミットは自動修正で意図しない変更が紛れ込むのを避けるため検知専用とし、修正は人が行う。

## 検討した代替案

- **ESLint 併用（`eslint-plugin-oxlint` で oxlint がカバーするルールを ESLint 側で無効化しつつ両方運用）**: 二重のツールチェーン・設定ファイルを維持するコストに見合うメリットがない。oxlint 単体でも `correctness`/`suspicious`/`pedantic` の網羅性は十分と判断し不採用。
- **type-aware 解析（`tsgolint` 経由）の追加**: 型情報を使った深い検査ができる一方、過去の ESLint type-aware 検証で経験した実行の重さ・キャッシュ起因の不安定さを再度持ち込むことになる。現時点では速度と安定性を優先し不採用（将来、必要性が明確になれば再検討する）。
- **フック管理ツールとして `simple-git-hooks` / `lefthook` を採用**: どちらも husky より軽量だが、本リポジトリでは lint-staged との組み合わせ実績・情報量で優る husky を採用。単一の pre-commit フック（`npx lint-staged` 一行）で足りる規模であり、乗り換えの追加メリットが薄いため不採用。

## 影響

- `.oxlintrc.json` を新設し、`categories`（correctness/suspicious/pedantic = error）・off ルール 8 件・`ignorePatterns`（`dist/**` 等）を定義。
- `package.json` に `lint` / `lint:fix` scripts、`devDependencies` に `oxlint@1.74.0`（固定バージョン）を追加。
- `package.json` に `lint-staged` 設定（`"*.{ts,js,mjs,cjs,astro,svelte}": "oxlint"`）、`devDependencies` に `husky@9.1.7` / `lint-staged@17.0.8`（固定バージョン）を追加。`.husky/pre-commit` は `npx lint-staged` の1行のみ。
- `.github/workflows/ci.yml` に既存 `quality`/`build` と並列の独立 `lint` ジョブを追加し、PR で `npm run lint` が違反を出したら fail する blocking ゲートとした。
- 既存違反はルール群ごとに手動で解消し、`npm run lint` が違反ゼロ（exit 0）の状態を前提としてプレコミット・CI を有効化した。
- **既知のトラブルシュート**: ステージされたファイルが全て `ignorePatterns`（`tmp/**` 等）の対象のみだった場合、oxlint が「No files found to lint」で exit 1 となりコミットがブロックされる（fail-closed な挙動）。これは `git add -f` で意図的に ignore 対象のみを stage するような稀なケースでのみ到達する。
- **スコープ限界**: oxlint は `.astro`/`.svelte` については script ブロックのみを解析し、テンプレート構文（マークアップ部分）は対象外。type-aware ルールにも対応していない。これらは本 ADR の決定によりスコープ外として許容する。
