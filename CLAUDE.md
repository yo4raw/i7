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

Astro 6 static site for an IDOLiSH7 card database. All pages are pre-rendered HTML shells that fetch data client-side from Google Sheets via the GViz API.

### Data Flow

Google Sheets (GViz JSON API) → `src/lib/data/fetch*.js` → client-side `<script>` in .astro pages

Three data fetchers in `src/lib/data/` parse GViz JSONP responses from a single Google Spreadsheet (`1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4`) with different GIDs:
- **fetchCardsJson.js** (GID 480354522) — card stats, skills, metadata
- **fetchSongsJson.js** (GID 1083871743) — song data with complex nested attribute groups (8 groups × 6 sub-columns)
- **fetchFixedBroachsJson.js** (GID 1087762308) — equipment data linked to cards

**No data is fetched at build time.** All data loading happens in the browser via `<script>` tags in .astro pages.

### Key Constants (`src/lib/constants.ts`)

- `CARD_IMAGE_BASE_URL` — full card images (`/i7_assets/assets/cards/{cardID}.png`)
- `CARD_THUMB_BASE_URL` — thumbnails for list views (`/i7_assets/assets/th_cards/{cardID}.png`)
- Card images are hosted on a separate GitHub Pages repo (`yo4raw.github.io/i7_assets/`)

### Page Patterns

All pages use `BaseLayout.astro` and follow the same pattern: render empty containers server-side, then populate via client-side JS. Filter state is persisted in URL query parameters.

### Deployment

GitHub Pages via `.github/workflows/deploy.yml`. Triggers on push to `main`. Site is deployed at `https://yo4raw.github.io/i7/` — the `base: '/i7'` in `astro.config.mjs` must stay in sync.

### Styling

Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin (not the legacy `@astrojs/tailwind` integration). Custom theme colors defined in `src/styles/global.css` via `@theme` block.
