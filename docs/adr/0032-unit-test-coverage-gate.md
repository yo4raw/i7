# 0032: 単体テストカバレッジ 95% ゲートを CI に導入

- 日付: 2026-06-30
- ステータス: 承認

## 背景

CI（`.github/workflows/ci.yml` の `quality` ジョブ）は `npm run typecheck` と `npm run test:unit`（Vitest）を実行していたが、**カバレッジを計測していなかった**。スコア計算エンジンなどロジックの回帰を、テスト追加忘れで素通りさせるリスクがあった。

導入前の `src/lib/**` 実測カバレッジは Statements 76.5% / Branches 67.2% / Functions 68.2% / Lines 77.3%。領域別では `score/` が約 90% と高い一方、`data/`（GViz/CSV フェッチャ）・`stores/`（Svelte ストア）・DOM/Worker 依存ファイルがほぼ未カバーだった。

## 決定

Vitest の v8 カバレッジ計測を導入し、**`src/lib/**` 全体に対するグローバルしきい値 95%（Statements / Branches / Functions / Lines の 4 指標すべて）を下回ったら CI を fail させるゲート**を `quality` ジョブに追加する。

- カバレッジ provider は `@vitest/coverage-v8`。しきい値は `vitest.config.ts` の `coverage.thresholds` に 95×4 を設定（グローバル集計に対して適用）。
- 分母（include）は `src/lib/**` 全体。DOM・I/O・Worker・ストアも対象から除外しない。
- テスト環境は node を既定とし、DOM が必要なファイル（`storage` / `stores/*` / `clientRefresh`）のみ per-file `// @vitest-environment jsdom` を付与。Svelte 5 runes ストアのコンパイルのため `vitest.config.ts` に `@sveltejs/vite-plugin-svelte` を統合。
- Worker（`maxScoreFinder.worker.ts`）はメッセージ処理を純粋関数 `createWorkerHandler` に切り出してテストし、Worker グローバルへの結線のみブートストラップとして残す。`searchWorkerPool` は `Worker` のモックでテストする。
- **本質的に到達不能な防御的分岐**（実引数で発生し得ない null/フォールバック、SSR 専用分岐、Worker ブートストラップ等）に限り、`/* v8 ignore */` コメントで個別に除外し、各除外に理由をコメントで明記する（一律の glob 除外はしない）。
- CI は `npm run test:unit` を `npm run coverage`（= `vitest run --coverage`）に置き換え、`coverage-summary.json` から `$GITHUB_STEP_SUMMARY` にカバレッジ表を出力する。

導入後の `src/lib/**` 実測は Statements 99.9% / Branches 98.6% / Functions 100% / Lines 100%（620 tests）。

## 検討した代替案

- **可視化のみ（ゲートなし）／段階導入（ratchet）** — まず現状値を計測・表示し、回帰だけ防ぐ案。回帰検知力が弱く、95% という明確な品質基準を即時に課す方針を優先して却下。
- **分母を `score/` やテスト済みモジュールのみに限定** — 95% 達成は容易だが、新規未テストファイル（特に `data/` や DOM/Worker）を検知できない穴が残るため、`src/lib/**` 全体を分母に採用。
- **Branches だけ別しきい値（例 85%）** — Branches は導入前 67% と最も低く工数が大きいが、回帰検知力を最大化するため 4 指標一律 95% を採用。到達困難な分岐は個別 `/* v8 ignore */` で対応する方針とした。
- **per-file しきい値** — 型定義のみ・SSR 専用など一部ファイルが構造的に 95% へ届かず運用が硬直するため、グローバル集計に対するしきい値を採用。
- **E2E（Playwright）を CI に追加** — UI/動的ルートの検証には有用だが本 ADR のスコープ外（単体テストの回帰防止）とし、別途検討。

設計詳細は [docs/superpowers/specs/2026-06-30-ci-coverage-gate-design.md](../superpowers/specs/2026-06-30-ci-coverage-gate-design.md) を参照。
