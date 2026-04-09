# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev      # Start dev server
npm run build    # Build static site to dist/
npm run preview  # Preview production build
```

No test runner or linter is configured.

## Architecture

IDOLiSH7 カードデータベースの Astro 6 静的サイト。

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
| カード（ステータス・スキル・メタデータ） | 480354522 | `fetchCardsJson.js` |
| 楽曲（8属性グループ × 6サブカラム） | 1083871743 | `fetchSongsJson.js` |
| 装備（カード紐付き） | 1087762308 | `fetchFixedBroachsJson.js` |

フェッチャーは `src/lib/data/` に配置。

### Game Attributes

| 属性 | 色 |
|------|------|
| Shout（シャウト） | 🔴 赤 |
| Beat（ビート） | 🟢 緑 |
| Melody（メロディ） | 🔵 青 |

### Key Constants (`src/lib/constants.ts`)

- `CARD_IMAGE_BASE_URL` — full card images (`/i7_assets/assets/cards/{cardID}.png`)
- `CARD_THUMB_BASE_URL` — thumbnails for list views (`/i7_assets/assets/th_cards/{cardID}.png`)
- Card images are hosted on a separate GitHub Pages repo (`yo4raw.github.io/i7_assets/`)

### Page Patterns

- **Home, Songs, Card Detail**: Fully pre-rendered at build time (zero client-side JS)
- **Card List**: Initial data embedded as JSON, client-side JS handles filtering/sorting/pagination with htmx for DOM updates
- **Card Detail**: Dynamic routes via `src/pages/cards/[id].astro` with `getStaticPaths()`

### Deployment

GitHub Pages via `.github/workflows/deploy.yml`. タグ push (`v*`) で `release.yml` が GitHub Release を作成し、`deploy.yml` を `workflow_dispatch` 経由で起動してデプロイする。6時間ごとの cron でも最新タグから再ビルド（データ鮮度維持）。Site is deployed at `https://yo4raw.github.io/i7/` — the `base: '/i7'` in `astro.config.mjs` must stay in sync.

リリース手順: `git tag v1.x.x && git push origin v1.x.x`

PR 時には CI（ビルドチェック）と Lighthouse CI が自動実行される。

### Styling

Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin (not the legacy `@astrojs/tailwind` integration). Custom theme colors defined in `src/styles/global.css` via `@theme` block.

## MCP Server Usage

開発時は以下の MCP サーバーを常に活用すること:

- **Context7**: Astro・Tailwind CSS・htmx 等のライブラリやフレームワークに関する作業では、必ず Context7 で最新の公式ドキュメントを参照してから実装する
- **Serena**: コードベースのシンボル解析・ナビゲーション・リファクタリングには Serena を使用する。ファイル全体を読む前に `get_symbols_overview` や `find_symbol` で必要な箇所を特定し、効率的に作業する

## Workflow

作業完了後は以下を自動で行うこと:

1. `npm run build && npm run preview` でローカルプレビューサーバーを起動する
2. Playwright MCP でプレビューサーバー（`http://localhost:4321/i7/`）にアクセスし、変更箇所の画面表示を確認する
3. スクリーンショットを `tmp/` ディレクトリに保存し、ユーザーに提示して問題がないか確認を取る
4. ユーザーの確認が取れたら `git commit` → `git push` を行う
