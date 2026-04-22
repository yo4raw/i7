# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

ローカルのホスト環境で直接実行する。Node.js は `.nvmrc` で 22 を指定しているため、`nvm use` 等で合わせること。

```bash
npm install              # 依存関係のインストール
npm run dev              # 開発サーバー (http://localhost:4321)
npm run preview          # 本番ビルド + ローカル配信 (http://localhost:4321)
npm run build            # 本番ビルドのみ (dist/ を生成)
npx wrangler dev --port 8788  # Cloudflare Workers (Static Assets) 挙動再現 (要: 事前に npm run build)
```

テストコマンド:

```bash
npm run test             # Playwright E2E テスト (preview サーバーを自動起動)
npm run test:ui          # Playwright を UI モードで実行
npm run test:unit        # Vitest 単体テスト (1回実行、`tests/unit/` 配下)
npm run test:unit:watch  # Vitest 単体テスト (watch モード)
npm run extract-fixtures # Google Sheets からテストフィクスチャ JSON を再生成
```

## Architecture

IDOLiSH7 カードデータベースの Astro 6 静的サイト（Cloudflare Workers Static Assets にデプロイ）。

### 設計原則: 完全静的サイト

- サーバーサイド処理を持たない完全な静的サイトとして動作する
- スコア計算・フィルタリング・ソート等すべてのロジックはクライアントサイド JavaScript で実行する
- 各種マスターデータ（カード・楽曲・装備など）の JSON フェッチもクライアントサイドで行う
- バックエンド API やサーバーサイドランタイムへの依存を導入してはならない
- 例外: TypeScript 等の altJS 言語のビルド（コンパイル）のみサーバーサイド（ビルド時）に行ってよい。コンパイル後の JavaScript の実行はすべてクライアント端末上で行う

### Data Source

マスターデータは主に Google Spreadsheet (`1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4`) から GViz JSON API 経由でクライアントサイドでフェッチする。イベント DB のみゲームサーバーから定期取得した CSV をビルド時に読み込む。

| データ | GID / ソース | フェッチャー | 取得タイミング |
|--------|------------|-------------|--------------|
| カード（ステータス・スキル・メタデータ） | GID 480354522 | `fetchCardsJson.ts` | クライアント |
| 楽曲（8属性グループ × 6サブカラム） | GID 1083871743 | `fetchSongsJson.ts` | クライアント |
| 装備（カード紐付き） | GID 1087762308 | `fetchFixedBroachsJson.ts` | クライアント |
| イベント（ボーナス特効カード・期間） | `public/events/events.csv` | `fetchEventsCsv.ts` | ビルド時 (Node `fs`) |

フェッチャーは `src/lib/data/` に配置。GViz API の共通処理は `gviz.ts`、クライアント側の自動リフレッシュは `clientRefresh.ts`。イベントボーナス段階の定義は `eventBonusTiers.ts`、共有ブローチ/ラビットノート等の固定データは `sharedBroachs.ts` / `rabbitNote.ts`。

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

画像・イベント DB はゲームサーバー (`i7.step-on-dream.net`) から GitHub Actions の cron ワークフローで自動取得され、PR として追加される:

| ワークフロー | スケジュール (UTC / JST) | 内容 |
|-------------|-------------------------|------|
| `fetch-new-cards.yml` | 03:00 UTC | 新規カード画像の前方スキャン + ギャップ埋め |
| `fetch-new-th-cards.yml` | 04:00 UTC | サムネイル画像のバックフィル・同期 |
| `fetch-gap-cards.yml` | 05:00 UTC | カード ID ギャップの補完 |
| `fetch-event-db.yml` | 19:00 UTC (JST 04:00) | イベント DB CSV を `public/events/events.csv` に取得 |

楽曲ジャケット画像は `public/assets/songs/` に配置される（`SONG_IMAGE_BASE_URL` 経由で参照）。

### Key Constants (`src/lib/constants.ts`)

- `CARD_IMAGE_BASE_URL` / `CARD_THUMB_BASE_URL` / `SONG_IMAGE_BASE_URL` — `import.meta.env.BASE_URL` ベースの画像パス
- `CHARACTERS` / `CHARACTER_GROUPS` — IDOLiSH7 / TRIGGER / Re:vale / ŹOOĻ のキャラ定義
- `RARITIES` / `ATTRIBUTES` / `ATTRIBUTE_MAP` / `ATTRS` — レアリティ・属性の定数
- `ATTR_HEX` / `ATTR_BADGE_BG` / `ATTR_BG` / `ATTR_BG_HOVER` / `RARITY_BADGE_CLASSES` — 属性/レアリティ別の表示スタイル
- `PAGE_SIZE` — カード一覧のページネーションサイズ

### Client-Side Modules

| モジュール | 役割 |
|-----------|------|
| `src/lib/cardListRenderer.ts` | カード一覧のフィルタリング・ソート・ページネーション・所持数管理 |
| `src/lib/donutChart.ts` | 属性比率のドーナツチャート描画 |
| `src/lib/storage.ts` | localStorage ラッパー（所持数・保存デッキなど） |
| `src/lib/ui.ts` | UI 共通ヘルパー |
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
| `broachResolver.ts` | 固有ブローチ・共有ブローチの効果解決 |
| `skillFormatter.ts` | スキル表示文字列の生成 |

### Page Patterns

| ページ | ルート | 描画方式 |
|--------|--------|----------|
| ホーム | `src/pages/index.astro` | ビルド時プリレンダリング |
| カード一覧 | `src/pages/cards/index.astro` | ビルド時 + クライアント JS（フィルタ/ソート/ページネーション/イベント特効表示） |
| カード詳細 | `src/pages/cards/[id].astro` | `getStaticPaths()` による動的ルート |
| 楽曲一覧 | `src/pages/songs/index.astro` | ビルド時プリレンダリング |
| 楽曲詳細 | `src/pages/songs/[id].astro` | `getStaticPaths()` による動的ルート |
| 所持カード | `src/pages/mycard/index.astro` | ビルド時 + クライアント JS（localStorage ベースの所持数管理） |
| スコア計算 | `src/pages/score-calc/index.astro` | ビルド時 + クライアント JS（モンテカルロシミュレーション、開催中イベントの特効反映） |
| 保存デッキ | `src/pages/decks/index.astro` | ビルド時 + クライアント JS（localStorage ベースのデッキ管理） |
| イベント一覧 | `src/pages/events/index.astro` | ビルド時プリレンダリング（`fetchEventsCsv` を build 時に読込） |
| イベント詳細 | `src/pages/events/[id].astro` | `getStaticPaths()` による動的ルート |
| ラビットノート | `src/pages/rabbit-note/index.astro` | ビルド時プリレンダリング |

### Deployment

Cloudflare Workers (Static Assets) (`https://i7.yo4raw.com`) にデプロイ。静的アセットのみの Worker はリクエスト課金対象外で無料運用できる。GitHub Actions (`.github/workflows/deploy.yml`) が `v*` タグ push もしくは手動実行 (`workflow_dispatch`) で `wrangler deploy` を叩く。

- 必要な GitHub Secret: `CLOUDFLARE_API_TOKEN` (Account > Workers Scripts:Edit 権限), `CLOUDFLARE_ACCOUNT_ID`
- Worker 名: `i7-gottani` (`wrangler.toml` の `name` で指定)
- 静的配信設定: `wrangler.toml` の `[assets] directory = "./dist"` で `dist/` を紐付け、`not_found_handling = "404-page"` で Astro の 404.html を返す
- リリース手順: `git tag v1.x.x && git push origin v1.x.x` でタグを push すると `release.yml` が GitHub Release を作成、同時に `deploy.yml` が Cloudflare Workers へデプロイする
- スプレッドシートのマスターデータ反映など、タグ発行なしで再デプロイしたい場合は Actions タブから `Deploy to Cloudflare Workers` を手動実行する

**CI**: PR 時にビルドチェック（`.github/workflows/ci.yml`）と Lighthouse CI（`lighthouse.yml`）が自動実行される。画像パス（`public/assets/cards/**`, `public/assets/th_cards/**`）の変更は CI スキップ。

### Styling

Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin (not the legacy `@astrojs/tailwind` integration). Custom theme colors defined in `src/styles/global.css` via `@theme` block.

### Testing

#### E2E テスト (Playwright)

`tests/` 直下に配置。`playwright.config.ts` で設定。

| テスト | 対象ページ |
|--------|-----------|
| `home.test.ts` | ホームページ |
| `card-list.test.ts` | カード一覧 |
| `card-detail.test.ts` | カード詳細 |
| `song-list.test.ts` | 楽曲一覧 |
| `song-detail.test.ts` | 楽曲詳細 |
| `mycard.test.ts` | 所持カード |

テスト実行時は `npm run preview`（ビルド + ローカルサーバー）が自動起動される。

#### 単体テスト (Vitest)

スコア計算エンジン等のロジックは `tests/unit/` 配下で Vitest により検証（`vitest.config.ts`）。

| テスト | 対象 |
|--------|-----|
| `tests/unit/score/engine.test.ts` | `src/lib/score/engine.ts` のシミュレーションロジック |

#### テストフィクスチャ

`tests/fixtures/` にカード・楽曲・装備の JSON フィクスチャを配置。`npm run extract-fixtures` (`scripts/extract-test-fixtures.ts`) で Google Sheets から再生成可能。

## MCP Server Usage

開発時は以下の MCP サーバーを常に活用すること:

- **Context7**: Astro・Tailwind CSS・htmx 等のライブラリやフレームワークに関する作業では、必ず Context7 で最新の公式ドキュメントを参照してから実装する
- **Serena**: コードベースのシンボル解析・ナビゲーション・リファクタリングには Serena を使用する。ファイル全体を読む前に `get_symbols_overview` や `find_symbol` で必要な箇所を特定し、効率的に作業する

## Workflow

作業完了後は以下を自動で行うこと:

1. `npm run preview` でローカルプレビューサーバーを起動する
2. Playwright MCP でプレビューサーバー（`http://localhost:4321/`）にアクセスし、変更箇所の画面表示を確認する
3. スクリーンショットを `tmp/` ディレクトリに保存し、ユーザーに提示して問題がないか確認を取る
4. `git` に `commit` する前に必ずリリースノートを更新する
5. ユーザーの確認が取れたら 対応ないように応じたブランチを作成して`git commit` → `git push` とPRの作成を行い、CIの結果を待たずリリースまで行う。リリースに伴うworkflowを待つ必要はない。
