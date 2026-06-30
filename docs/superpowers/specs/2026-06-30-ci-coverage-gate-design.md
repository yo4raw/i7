# CI に単体テストカバレッジ 95% ゲートを追加する — 設計

- 日付: 2026-06-30
- 関連 ADR: [0032](../../adr/0032-unit-test-coverage-gate.md)

## 背景・目的

CI（`.github/workflows/ci.yml` の `quality` ジョブ）は typecheck と Vitest 単体テストを実行していたが、カバレッジを計測していなかった。ロジックの回帰をテスト追加忘れで素通りさせるリスクがあったため、`src/lib/**` を分母とした **4 指標（Statements / Branches / Functions / Lines）すべて 95% 未満で PR を fail させるゲート**を導入する。

導入前ベースライン（`src/lib/**`）: Statements 76.5% / Branches 67.2% / Functions 68.2% / Lines 77.3%。

## 決定事項

- 分母（include）: `src/lib/**` 全体。DOM・I/O・Worker・ストアも除外しない。
- しきい値: 4 指標すべて 95%、グローバル集計に適用。下回ったら CI fail。
- 到達不能な防御的分岐に限り `/* v8 ignore */` で個別除外（理由コメント必須、一律 glob 除外なし）。

## 実装方針

### カバレッジ基盤
- `@vitest/coverage-v8` / `jsdom` を devDependencies に追加。
- `vitest.config.ts`: `@sveltejs/vite-plugin-svelte` を plugins に統合（runes ストアのコンパイル用）、`coverage` に `provider: v8` / `include: ['src/lib/**']` / `exclude: ['**/*.d.ts']` / reporters（text-summary, text, html, json-summary）/ `thresholds` 95×4。
- `package.json` に `"coverage": "vitest run --coverage"`。`.gitignore` に `coverage/`。

### テスト戦略（テスト容易性で 3 分類）
- **純粋ロジック（node）**: `ui` / `donutChart` / `gviz`（parse 系）/ `fetchEventsCsv`（parse 系）/ `eventBonusTiers` / `skillFormatter` / `histogram` / `simulation`（エッジ・MC オプション）/ `types` 等。
- **DOM 依存（per-file jsdom）**: `storage` / `stores/*.svelte.ts` / `clientRefresh`。先頭に `// @vitest-environment jsdom`。
- **モック依存**: フェッチャの I/O は `vi.stubGlobal('fetch')`、`fetchEventsCsv` は `vi.mock('node:fs/promises')`、Worker プールは `Worker` モック。

### 最小リファクタ
- `maxScoreFinder.worker.ts`: `onmessage` 本体を純粋関数 `createWorkerHandler(post)` に切り出し、Worker グローバルへの結線のみブートストラップ（`typeof self` ガード + `/* v8 ignore */`）として残す。
- `clientRefresh.ts`: 未使用デッドコード `hideIndicator` を削除。

### CI 配線
- `quality` ジョブの `npm run test:unit` を `npm run coverage` に置換。
- `coverage-summary.json` から `$GITHUB_STEP_SUMMARY` にカバレッジ表を出力（`if: always()`）。

## 結果

導入後（`src/lib/**`）: Statements 99.9% / Branches 98.6% / Functions 100% / Lines 100%、620 tests pass。ゲートは閾値 95 で exit 0、閾値超過時に exit≠0 + `ERROR: Coverage for branches ... does not meet global threshold` を出力することを確認済み。

## 検証

1. `npm run coverage` がローカルで成功し 4 指標 ≥95%。
2. 閾値を意図的に超過させると `vitest run --coverage` が exit≠0 で fail（ゲート実効性）。
3. 既存 + 追加テストが全 pass、`npm run typecheck` が pass。
4. ADR を追加し `docs/adr/README.md` を更新。
