# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

ローカルでのビルド・プレビュー・テストはすべて **ホスト環境で直接 npm scripts** を実行する。Docker は使用しない。

```bash
npm run dev              # 開発サーバー (Astro dev / HMR、http://localhost:4321)
npm run build            # 本番ビルド (dist/ に出力)
npm run preview          # 本番ビルド + ローカル配信 (http://localhost:4321)
npm run test             # Playwright E2E テスト (preview サーバーを自動起動)
npm run test:ui          # Playwright を UI モードで実行
npm run test:unit        # Vitest 単体テスト (1回実行、`tests/unit/` 配下)
npm run test:unit:watch  # Vitest 単体テスト (watch モード)
npm run extract-fixtures # Google Sheets からテストフィクスチャ JSON を再生成
```

Node.js は `.nvmrc` で 22 を指定。ホスト環境で Node.js 22 を用意すること（`nvm use` 等）。

### 日常の検証は `npm run dev` (HMR) を使う

UI の見た目確認・スタイル調整・クライアントサイド JS のロジック確認といった日常的な検証は、`npm run build` せずに **`npm run dev` (= `astro dev`) のホットリロードで行う** のが原則。build は 5 分以上かかるが、`astro dev` は約 1 秒で起動し、`.astro` / `.svelte` / `.ts` / `.css` の編集がブラウザに自動反映される。

- 起動コマンド: `npm run dev`（バックグラウンド起動 + ログ監視が推奨、初回起動は約 1 秒）
- アクセス URL: `http://localhost:4321/`
- ホットリロード挙動（実測確認済み）:
  - `.astro` ファイル編集 → Vite の WebSocket 経由でブラウザへ通知 → 手動リロード不要でフルページ再描画
  - `.svelte` / `.ts` / `global.css` も同様に HMR が効く
  - GViz API 経由のクライアントサイドフェッチ（カード 2689 件等）も dev サーバー上で通常通り動作する
- エージェント側の確認フロー:
  1. `npm run dev` を `run_in_background: true` で起動
  2. ログに `astro  v6.x.x ready in XXX ms` が出るまで `until grep -q "ready in"` で待つ（数秒）
  3. Playwright / chrome-devtools MCP で `http://localhost:4321/` にアクセス → スクリーンショット取得
  4. 必要に応じてファイル編集 → 数秒待って再スクショ（手動 reload は不要、`navigate_page reload` でも可）
  5. 検証完了後は `TaskStop` で dev サーバーを停止

### `npm run build` / `npm run preview` が必要なケース

以下は HMR では確認できないので、従来通り `npm run preview`（= build + `serve`）で検証する:

- `@playform/compress` による圧縮後の HTML / JS / CSS / 画像サイズの確認
- `getStaticPaths()` 経由で生成される動的ルート全件 (カード詳細 2689 件 / 楽曲詳細 / イベント詳細など) のビルド成否
- 本番配信時のパス解決 (`import.meta.env.BASE_URL` / Cloudflare Workers の `[assets]` 挙動) の確認
- Playwright E2E テスト (`npm run test`) — 内部で preview サーバーが自動起動される
- リリース直前の最終動作確認

### ビルド所要時間の目安

`npm run build` は 2779 ページを静的生成するため数分かかる。エージェントから起動する際のタイムアウト / sleep 目安:

| 実測日 | 内訳 | 合計 |
|--------|------|------|
| 2026-04-22 | 主要ビルド 264s + `@playform/compress` 76s | **約 340 秒 (5.5 分)** |

- Bash の `timeout` は **最低 420000 ms (7 分)** を確保する (デフォルト 120000 ms では不足)
- `run_in_background: true` + `ScheduleWakeup` で待つ場合は初回 **300 秒後** を目安に、完了していなければさらに 120 秒後に再確認
- 単体テスト (`npm run test:unit`) は約 1 秒 / フル Playwright E2E (`npm run test`) は build 込みで 5〜7 分
- `npm run dev` は約 1 秒で起動するため、日常検証では build を走らせないこと

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
| `fetch-new-cards.yml` | 03:00 UTC | 新規カード画像（フルサイズ + サムネイル）の前方スキャン + ギャップ埋め |
| `fetch-gap-cards.yml` | 05:00 UTC | カード ID ギャップの補完 |
| `fetch-event-db.yml` | 19:00 UTC (JST 04:00) | イベント DB CSV を `public/events/events.csv` に取得 |
| `fetch-new-songs.yml` | 18:00 UTC (日曜・JST 月曜 03:00) | IDOLiSH7 Wiki から不足楽曲ジャケット画像を取得 |

楽曲ジャケット画像は `public/assets/songs/` に配置される（`SONG_IMAGE_BASE_URL` 経由で参照）。Wiki クローラー本体は `scripts/fetch-song-images.mjs`。

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
| `src/lib/storage.ts` | localStorage ラッパー。キー一覧は `STORAGE_KEYS` で集中管理（新しいキー追加時はここに追記） |
| `src/lib/ui.ts` | UI 共通ヘルパー |
| `src/lib/score/` | スコア計算エンジン（モンテカルロシミュレーション） |
| `src/components/FooterTools.svelte` | フッターからの localStorage エクスポート/インポート UI |

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
| `shrinkExclusion.ts` | 縮小スキルの並び順検証ロジック |
| `specDiagrams.ts` | スキル仕様可視化用ダイアグラム生成 |

### Page Patterns

| ページ | ルート | 描画方式 |
|--------|--------|----------|
| ホーム | `src/pages/index.astro` | ビルド時プリレンダリング |
| 衣装一覧 | `src/pages/cards/index.astro` | ビルド時 + クライアント JS（フィルタ/ソート/ページネーション/イベント特効表示） |
| 衣装詳細 | `src/pages/cards/[id].astro` | `getStaticPaths()` による動的ルート |
| 楽曲一覧 | `src/pages/songs/index.astro` | ビルド時プリレンダリング |
| 楽曲詳細 | `src/pages/songs/[id].astro` | `getStaticPaths()` による動的ルート |
| 所持衣装 | `src/pages/mycard/index.astro` | ビルド時 + クライアント JS（localStorage ベースの所持数管理） |
| スコア計算 | `src/pages/score-calc/index.astro` | ビルド時 + クライアント JS（モンテカルロシミュレーション、開催中イベントの特効反映） |
| 保存デッキ | `src/pages/decks/index.astro` | ビルド時 + クライアント JS（localStorage ベースのデッキ管理） |
| イベント一覧 | `src/pages/events/index.astro` | ビルド時プリレンダリング（`fetchEventsCsv` を build 時に読込） |
| イベント詳細 | `src/pages/events/[id].astro` | `getStaticPaths()` による動的ルート |
| ラビットノート | `src/pages/rabbit-note/index.astro` | ビルド時プリレンダリング |
| About | `src/pages/about/index.astro` | ビルド時プリレンダリング |
| リリースノート | `src/pages/releases/index.astro` | ビルド時プリレンダリング |
| Max スコア探索 | `src/pages/secrets/max-score-finder/index.astro` | ビルド時 + クライアント JS（実験的ツール） |

### User Data Backup

ユーザーデータ（所持カード・保存デッキ等）はすべて localStorage に保存される。キーは `src/lib/storage.ts` の `STORAGE_KEYS` で集中管理:

| キー | 用途 |
|------|------|
| `i7_card_counts` | 所持カード数 |
| `i7_rabbit_notes` | ラビットノート |
| `i7_selected_songs` | 選択楽曲 |
| `i7_saved_decks` | 保存デッキ |
| `i7_score_calc_state` | スコア計算画面の状態 |

`src/components/FooterTools.svelte` がフッターから上記をまとめて JSON でエクスポート/インポートする UI を提供する（バックアップ形式: `{ schema: "i7-backup", version: 1, exportedAt, data }`）。新しい localStorage キーを追加する際は必ず `STORAGE_KEYS` に追記すること（バックアップ対象に含めるため）。

### Deployment

Cloudflare Workers (Static Assets) (`https://i7.yo4raw.com`) にデプロイ。静的アセットのみの Worker はリクエスト課金対象外で無料運用できる。GitHub Actions (`.github/workflows/deploy.yml`) が `v*` タグ push もしくは手動実行 (`workflow_dispatch`) で `wrangler deploy` を叩く。

- 必要な GitHub Secret: `CLOUDFLARE_API_TOKEN` (Account > Workers Scripts:Edit 権限), `CLOUDFLARE_ACCOUNT_ID`
- Worker 名: `i7-gottani` (`wrangler.toml` の `name` で指定)
- 静的配信設定: `wrangler.toml` の `[assets] directory = "./dist"` で `dist/` を紐付け、`not_found_handling = "404-page"` で Astro の 404.html を返す
- リリース手順: `git tag v1.x.x && git push origin v1.x.x` でタグを push すると `release.yml` が GitHub Release を作成、同時に `deploy.yml` が Cloudflare Workers へデプロイする
- スプレッドシートのマスターデータ反映など、タグ発行なしで再デプロイしたい場合は Actions タブから `Deploy to Cloudflare Workers` を手動実行する

**CI**: PR 時にビルドチェック（`.github/workflows/ci.yml`）が自動実行される。画像パス（`public/assets/cards/**`, `public/assets/th_cards/**`）の変更は CI スキップ。

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
| `score-calc-spec.test.ts` | スコア計算ページのスキル仕様表示 |

テスト実行時は `npm run preview`（ビルド + ローカルサーバー）が自動起動される。

#### 単体テスト (Vitest)

スコア計算エンジン等のロジックは `tests/unit/` 配下で Vitest により検証（`vitest.config.ts`）。

| テスト | 対象 |
|--------|-----|
| `tests/unit/score/engine.test.ts` | `src/lib/score/engine.ts` のシミュレーションロジック |
| `tests/unit/score/shrinkExclusion.test.ts` | `src/lib/score/shrinkExclusion.ts` の縮小スキル並び順検証 |
| `tests/unit/score/specDiagrams.test.ts` | `src/lib/score/specDiagrams.ts` のダイアグラム生成 |

#### テストフィクスチャ

`tests/fixtures/` にカード・楽曲・装備の JSON フィクスチャを配置。`npm run extract-fixtures` (`scripts/extract-test-fixtures.ts`) で Google Sheets から再生成可能。

## MCP Server Usage

開発時は以下の MCP サーバーを常に活用すること:

- **Context7**: Astro・Tailwind CSS・Svelte 等のライブラリやフレームワークに関する作業では、必ず Context7 で最新の公式ドキュメントを参照してから実装する
- **Serena**: コードベースのシンボル解析・ナビゲーション・リファクタリングには Serena を使用する。ファイル全体を読む前に `get_symbols_overview` や `find_symbol` で必要な箇所を特定し、効率的に作業する

## 用語ポリシー

ユーザー可視テキスト（HTML、ラベル、alert/placeholder、aria-label、SVG `<title>` など）では「カード」ではなく **「衣装」** を用いる。アイドリッシュセブンの用語に揃えるため。

内部識別子（コード中の変数名・関数名・ファイル名・URL パス・localStorage キーなど）は引き続き `card` を使用する（例: `cards/[id].astro`、`i7_card_counts`、`fetchCardsJson.ts`、`CardList.svelte`）。

## 衣装表示参考

衣装の表示で判断が難しい場合は
`https://i7.yo4raw.com/cards/{id}/`
が　
`https://i7.step-on-dream.net/card.php?ID={id}`
に該当するので参考にする

## Workflow

作業完了後は以下を自動で行うこと:

1. **まず `npm run dev` (HMR 付き開発サーバー) で確認する** — UI の見た目・クライアント JS の挙動・スタイル調整等は HMR で即時確認できる。build を待たないこと
2. Playwright MCP / chrome-devtools MCP で dev サーバー（`http://localhost:4321/`）にアクセスし、変更箇所の画面表示を確認する
3. スクリーンショットを `tmp/` ディレクトリに保存し、ユーザーに提示して問題がないか確認を取る
4. **本番ビルドでしか検出できない項目**（動的ルート全件生成・`@playform/compress` の圧縮後挙動・`BASE_URL` 解決など）に関わる変更の場合のみ、追加で `npm run preview` を実行して最終確認する
5. `git` に `commit` する前に必ずリリースノートを更新する
6. ユーザーの確認が取れたら 対応内容に応じたブランチを作成して `git commit` → `git push` と PR の作成を行い、CI の結果を待たずリリースまで行う。リリースに伴う workflow を待つ必要はない。
