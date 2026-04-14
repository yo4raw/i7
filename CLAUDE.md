# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev      # Start dev server
npm run build    # Build static site to dist/
npm run preview  # Build + local preview (http://localhost:4321)
npm run test     # Run Playwright E2E tests
npm run test:ui  # Run Playwright tests with UI
```

Node.js 22 required (`.nvmrc`)。Playwright E2E テストが `tests/` に配置されている。

## Architecture

IDOLiSH7 カードデータベースの Astro 6 静的サイト（GitHub Pages）。

### 設計原則: 完全静的サイト

- サーバーサイド処理を持たない完全な静的サイトとして動作する
- スコア計算・フィルタリング・ソート等すべてのロジックはクライアントサイド JavaScript で実行する
- 各種マスターデータ（カード・楽曲・装備など）の JSON フェッチもクライアントサイドで行う
- バックエンド API やサーバーサイドランタイムへの依存を導入してはならない
- 例外: TypeScript 等の altJS 言語のビルド（コンパイル）のみサーバーサイド（ビルド時）に行ってよい。コンパイル後の JavaScript の実行はすべてクライアント端末上で行う

### Data Source

マスターデータは Google Spreadsheet (`1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4`) から GViz JSON API 経由でクライアントサイドでフェッチする。

| データ | GID | フェッチャー |
|--------|-----|-------------|
| カード（ステータス・スキル・メタデータ） | 480354522 | `fetchCardsJson.ts` |
| 楽曲（8属性グループ × 6サブカラム） | 1083871743 | `fetchSongsJson.ts` |
| 装備（カード紐付き） | 1087762308 | `fetchFixedBroachsJson.ts` |

フェッチャーは `src/lib/data/` に配置。GViz API の共通処理は `gviz.ts`、クライアント側の自動リフレッシュは `clientRefresh.ts`。

### Game Attributes

| 属性 | 色 |
|------|------|
| Shout（シャウト） | 🔴 赤 |
| Beat（ビート） | 🟢 緑 |
| Melody（メロディ） | 🔵 青 |

### Card Images

カード画像は `public/assets/` に配置（ビルド時に `dist/assets/` へコピー）。

| 種別 | ディレクトリ | URL パターン |
|------|-------------|-------------|
| フルサイズ画像 | `public/assets/cards/` | `{BASE_URL}assets/cards/{cardID}.png` |
| サムネイル画像 | `public/assets/th_cards/` | `{BASE_URL}assets/th_cards/{cardID}.png` |

画像はゲームサーバー (`i7.step-on-dream.net`) から GitHub Actions の cron ワークフローで自動取得され、PR として追加される:

| ワークフロー | スケジュール (UTC) | 内容 |
|-------------|-------------------|------|
| `fetch-new-cards.yml` | 03:00 | 新規カード画像の前方スキャン + ギャップ埋め |
| `fetch-new-th-cards.yml` | 04:00 | サムネイル画像のバックフィル・同期 |
| `fetch-gap-cards.yml` | 05:00 | カード ID ギャップの補完 |

### Key Constants (`src/lib/constants.ts`)

- `CARD_IMAGE_BASE_URL` — `import.meta.env.BASE_URL` ベースの相対パス
- `CARD_THUMB_BASE_URL` — 同上

### Client-Side Modules

| モジュール | 役割 |
|-----------|------|
| `src/lib/cardListRenderer.ts` | カード一覧のフィルタリング・ソート・ページネーション・所持数管理 |
| `src/lib/donutChart.ts` | 属性比率のドーナツチャート描画 |
| `src/lib/score/` | スコア計算エンジン（モンテカルロシミュレーション） |

スコア計算エンジンの主要コンポーネント:

| ファイル | 役割 |
|---------|------|
| `engine.ts` | チーム構成・シミュレーション実行（`runSimulation`, `computeTeam`） |
| `types.ts` | 型定義 |
| `constants.ts` | スコア計算用定数 |
| `rng.ts` | 乱数生成 |
| `noteFlattener.ts` | ノーツ展開 |
| `histogram.ts` | スコア分布のヒストグラム描画 |

### Page Patterns

| ページ | ルート | 描画方式 |
|--------|--------|----------|
| ホーム | `src/pages/index.astro` | ビルド時プリレンダリング |
| カード一覧 | `src/pages/cards/index.astro` | ビルド時 + クライアント JS（フィルタ/ソート/ページネーション） |
| カード詳細 | `src/pages/cards/[id].astro` | `getStaticPaths()` による動的ルート |
| 楽曲一覧 | `src/pages/songs/index.astro` | ビルド時プリレンダリング |
| 楽曲詳細 | `src/pages/songs/[id].astro` | `getStaticPaths()` による動的ルート |
| 所持カード | `src/pages/mycard/index.astro` | ビルド時 + クライアント JS（localStorage ベースの所持数管理） |
| スコア計算 | `src/pages/score-calc/index.astro` | ビルド時 + クライアント JS（モンテカルロシミュレーション） |
| 保存デッキ | `src/pages/decks/index.astro` | ビルド時 + クライアント JS（localStorage ベースのデッキ管理） |

### Deployment

GitHub Pages (`https://yo4raw.github.io/i7/`) にデプロイ。`base: '/i7/'`。

`.github/workflows/deploy.yml` でデプロイ。タグ push (`v*`) で `release.yml` が GitHub Release を作成し、`deploy.yml` を `workflow_dispatch` 経由で起動。6時間ごとの cron でも最新タグから再ビルド（データ鮮度維持）。

リリース手順: `git tag v1.x.x && git push origin v1.x.x`

**CI**: PR 時にビルドチェック（`.github/workflows/ci.yml`）と Lighthouse CI（`lighthouse.yml`）が自動実行される。画像パス（`public/assets/cards/**`, `public/assets/th_cards/**`）の変更は CI スキップ。

### Styling

Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin (not the legacy `@astrojs/tailwind` integration). Custom theme colors defined in `src/styles/global.css` via `@theme` block.

### Testing

Playwright E2E テストが `tests/` に配置。`playwright.config.ts` で設定。

| テスト | 対象ページ |
|--------|-----------|
| `home.test.ts` | ホームページ |
| `card-list.test.ts` | カード一覧 |
| `card-detail.test.ts` | カード詳細 |
| `song-list.test.ts` | 楽曲一覧 |
| `song-detail.test.ts` | 楽曲詳細 |
| `mycard.test.ts` | 所持カード |

テスト実行時は `npm run preview`（ビルド + ローカルサーバー）が自動起動される。

## MCP Server Usage

開発時は以下の MCP サーバーを常に活用すること:

- **Context7**: Astro・Tailwind CSS・htmx 等のライブラリやフレームワークに関する作業では、必ず Context7 で最新の公式ドキュメントを参照してから実装する
- **Serena**: コードベースのシンボル解析・ナビゲーション・リファクタリングには Serena を使用する。ファイル全体を読む前に `get_symbols_overview` や `find_symbol` で必要な箇所を特定し、効率的に作業する

## Workflow

作業完了後は以下を自動で行うこと:

1. `npm run build && npm run preview` でローカルプレビューサーバーを起動する
2. Playwright MCP でプレビューサーバー（`http://localhost:4321/i7/`）にアクセスし、変更箇所の画面表示を確認する
3. スクリーンショットを `tmp/` ディレクトリに保存し、ユーザーに提示して問題がないか確認を取る
4. ユーザーの確認が取れたら 対応ないように応じたブランチを作成して`git commit` → `git push` とPRの作成を行う
