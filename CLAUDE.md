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

Astro 6 static site for an IDOLiSH7 card database. Data is fetched at build time from Google Sheets via the GViz API and pre-rendered into static HTML. The card list page embeds card data as JSON for client-side filtering/sorting.

### Data Flow

Google Sheets (GViz JSON API) → `src/lib/data/fetch*.js` → Astro frontmatter (build time) → static HTML

Three data fetchers in `src/lib/data/` parse GViz JSONP responses from a single Google Spreadsheet (`1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4`) with different GIDs:
- **fetchCardsJson.js** (GID 480354522) — card stats, skills, metadata
- **fetchSongsJson.js** (GID 1083871743) — song data with complex nested attribute groups (8 groups × 6 sub-columns)
- **fetchFixedBroachsJson.js** (GID 1087762308) — equipment data linked to cards

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

GitHub Pages via `.github/workflows/deploy.yml`. Triggers on push to `main` and every 6 hours via cron (for data freshness). Site is deployed at `https://yo4raw.github.io/i7/` — the `base: '/i7'` in `astro.config.mjs` must stay in sync.

### Styling

Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin (not the legacy `@astrojs/tailwind` integration). Custom theme colors defined in `src/styles/global.css` via `@theme` block.

## Workflow

作業完了後は以下を自動で行うこと:

1. `npm run build && npm run preview` でローカルプレビューサーバーを起動する
2. Playwright MCP でプレビューサーバー（`http://localhost:4321/i7/`）にアクセスし、変更箇所の画面表示を確認する
3. スクリーンショットを `tmp/` ディレクトリに保存し、ユーザーに提示して問題がないか確認を取る
4. ユーザーの確認が取れたら `git commit` → `git push` を行う
