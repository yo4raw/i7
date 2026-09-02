# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

ローカルでのビルド・プレビュー・テストはすべて **ホスト環境で直接 npm scripts** を実行する。Docker は使用しない。コマンド一覧は `package.json` の `scripts` を参照。

- `npm run preview` は build 込みでビルド成果物をローカル配信する（`astro preview`）
- `npm run test` (Playwright E2E) は preview サーバーを自動起動する
- Node.js は `.nvmrc` で 22 を指定。ホスト環境で Node.js 22 を用意すること（`nvm use` 等）

### 日常の検証は `npm run dev` (HMR) を使う

UI の見た目確認・スタイル調整・クライアントサイド JS のロジック確認といった日常的な検証は、`npm run build` せずに **`npm run dev` (= `astro dev`) のホットリロードで行う** のが原則。build は 5 分以上かかるが、`astro dev` は約 1 秒で起動し、`.astro` / `.svelte` / `.ts` / `.css` の編集がブラウザに自動反映される。

- 起動コマンド: `npm run dev`（バックグラウンド起動 + ログ監視が推奨、初回起動は約 1 秒）
- アクセス URL: `http://localhost:4321/`
- ホットリロード挙動（実測確認済み）:
  - `.astro` ファイル編集 → Vite の WebSocket 経由でブラウザへ通知 → 手動リロード不要でフルページ再描画
  - `.svelte` / `.ts` / `global.css` も同様に HMR が効く
  - GViz API 経由のクライアントサイドフェッチ（衣装 2,800 件超）も dev サーバー上で通常通り動作する
- エージェント側の確認フロー:
  1. `npm run dev` を `run_in_background: true` で起動
  2. `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/` で疎通確認する（`astro dev` はデーモン化されており `npm run dev` はログに `Dev server running at http://localhost:4321 (pid NNNNN)` を出して即 exit する。起動完了を告げる旧来の文字列は出力されないため、それを待つ `grep` ループは永久に一致しない）
  3. Playwright / chrome-devtools MCP で `http://localhost:4321/` にアクセス → スクリーンショット取得
  4. 必要に応じてファイル編集 → 数秒待って再スクショ（手動 reload は不要、`navigate_page reload` でも可）
  5. 検証完了後は `astro dev stop` で dev サーバーを停止する（デーモン化されているため `TaskStop` では止まらない）

### `npm run build` / `npm run preview` が必要なケース

以下は HMR では確認できないので、従来通り `npm run preview`（= build + `astro preview`）で検証する:

- `@playform/compress` による圧縮後の HTML / JS / CSS / 画像サイズの確認
- `getStaticPaths()` 経由で生成される動的ルート全件 (衣装詳細 2,800 件超 / 楽曲詳細 / イベント詳細など) のビルド成否
- 本番配信時のパス解決 (`import.meta.env.BASE_URL` / Cloudflare Workers の `[assets]` 挙動) の確認
- Playwright E2E テスト (`npm run test`) — 内部で preview サーバーが自動起動される
- リリース直前の最終動作確認

### ビルド所要時間の目安

`npm run build` は 3,200 ページ超を静的生成するため数分かかる。エージェントから起動する際のタイムアウト / sleep 目安:

| 実測日 | 対象 | 実測値 |
|--------|------|--------|
| 2026-08-26 | `npm run build` (GitHub Actions) | **5 分 23 秒**（圧縮対象 3,234 HTML） |
| 2026-08-26 | `npm run test:unit` (Vitest) | **約 13 秒**（79 ファイル / 822 テスト） |
| 2026-08-26 | `npx playwright test` (dev サーバー再利用) | **約 7.5 分**（56 passed / 2 skipped） |

- Bash の `timeout` は **最低 420000 ms (7 分)** を確保する (デフォルト 120000 ms では不足)
- `run_in_background: true` + `ScheduleWakeup` で待つ場合は初回 **300 秒後** を目安に、完了していなければさらに 120 秒後に再確認
- E2E をビルドから通す (`npm run test`) と build 5.5 分 + E2E 7.5 分で **合計 13 分前後**かかる
- `npm run dev` は約 1 秒で起動するため、日常検証では build を走らせないこと

## Architecture

IDOLiSH7 カードデータベースの Astro 7 静的サイト（Cloudflare Workers Static Assets にデプロイ）。

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

カード画像は `public/assets/` に配置（ビルド時に `dist/assets/` へコピー）。画像形式は **WebP**（フルカードはロスレス、サムネ・楽曲は lossy q85。ADR 0033）。ソースサーバー (`i7.step-on-dream.net`) は PNG 配信のため、GHA フェッチ時に `scripts/png-to-webp.mjs` で WebP へ変換して取り込む。

| 種別 | ディレクトリ | URL パターン |
|------|-------------|-------------|
| フルサイズ画像 | `public/assets/cards/` | `{BASE_URL}assets/cards/{ID}.webp` |
| サムネイル画像 | `public/assets/th_cards/` | `{BASE_URL}assets/th_cards/{ID}.webp` |

> ⚠️ **`Card.ID` と `Card.cardID` は別物**（`fetchCardsJson.ts` で別フィールド）。画像ファイル名・カード詳細パス (`cards/{id}/`)・localStorage の所持数キー・特効ティア照合など、**カードを指す ID はすべて `Card.ID`** を使う。`cardID` は固有ブローチ照合（`FixedBroach.card_id === Card.cardID`）など限られた用途専用で、画像やルーティングに使うと別カードを指してしまう。画像 URL は文字列を直書きせず `cardImageUrl(card.ID)` / `cardThumbUrl(card.ID)`（`src/lib/ui.ts`）を使うこと。

画像・イベント DB はゲームサーバー (`i7.step-on-dream.net`) から GitHub Actions の cron ワークフローで自動取得され、PR として追加される:

| ワークフロー | スケジュール | 内容 |
|-------------|------------|------|
| `fetch-new-cards.yml` | 毎時 00 分 (UTC) | 新規カード画像（フルサイズ + サムネイル）の前方スキャンと、既存 ID 範囲のギャップ埋め。PNG 取得後 WebP へ変換 |
| `fetch-event-db.yml` | 毎時 00 分 (UTC) | イベント DB CSV を `public/events/events.csv` に取得 |
| `fetch-new-songs.yml` | 毎時 00 分 (UTC) | IDOLiSH7 Wiki から不足楽曲ジャケット画像を取得し WebP へ変換 |

楽曲ジャケット画像は `public/assets/songs/` に配置される（`SONG_IMAGE_BASE_URL` 経由で参照）。Wiki クローラー本体は `scripts/fetch-song-images.mjs`。

### Page Patterns

全ページは `src/pages/` 配下。ビルド時プリレンダリングが基本で、`cards/[id]` / `songs/[id]` / `events/[id]` は `getStaticPaths()` による動的ルート。所持衣装・スコア計算・保存デッキ・共通ブローチ・編成組合計算はクライアント JS + localStorage で状態を持つ。

### User Data Backup

ユーザーデータ（所持カード・保存デッキ等）はすべて localStorage に保存される。キーは `src/lib/storage.ts` の `STORAGE_KEYS` で集中管理:

| キー | 用途 |
|------|------|
| `i7_card_counts` | 所持カード数 |
| `i7_rabbit_notes` | ラビットノート |
| `i7_selected_songs` | 選択楽曲 |
| `i7_saved_decks` | 保存デッキ |
| `i7_score_calc_state` | スコア計算画面の状態 |
| `i7_shared_broach_counts` | 共通ブローチ所持数 |
| `i7_compare_event_id` | 衣装比較画面で選択中の特効イベント |
| `i7_max_finder_event_id` | 編成組合計算画面で選択中の対象イベント |
| `i7_card_list_view_mode` | 衣装一覧の表示モード |
| `i7_point_calc_state` | ポイント芸計算画面の状態 |

`src/components/FooterTools.svelte` がフッターから上記をまとめて JSON でエクスポート/インポートする UI を提供する（バックアップ形式: `{ schema: "i7-backup", version: 1, exportedAt, data }`）。新しい localStorage キーを追加する際は必ず `STORAGE_KEYS` に追記すること（バックアップ対象に含めるため）。

### ブランチ戦略（Git Flow / ADR 0052）

`main` の不変条件は **「常にリリース済み（本番にデプロイ済み）」**。人手の変更は `develop` に溜める。

| ブランチ | 役割 | 派生元 | マージ先 | マージ方式 |
|---------|------|--------|---------|-----------|
| `main` | 常にリリース済み | — | — | — |
| `develop` | 統合ブランチ（GitHub default） | `main` | `main`（リリース時） | fast-forward |
| `feat/` `fix/` `chore/` `docs/` `refactor/` `test/` `ci/` | 人手の作業 | `develop` | `develop` | squash |
| `hotfix/` | 本番の緊急修正 | `main` | `main` | squash |
| `auto/` | cron の自動取り込み | `main` | `main` | squash（自動） |
| `dependabot/` | Dependabot の依存更新 | `main` | `main` | squash |

- **通常の作業は `develop` から切って `develop` に PR を出す**。マージしても本番には出ない
- **毎時のアセット自動取り込み（cron 4 本）は `main` 直行の例外**。マージ直後に `tag-release.yml` が自動採番タグ（PATCH）を打ち即デプロイされるため、`main` の不変条件は崩れない。新カード画像が 1 時間以内に本番へ出る即時性を維持するための例外
- **Dependabot の依存更新も `main` 直行**（ADR 0061）。`.github/dependabot.yml` の `target-branch: main` で指定している。CI が通ったら `main` へマージし、そのままリリースされる（MINOR が上がる）。`develop` に溜めると PR 同士で `package-lock.json` が衝突し、リベースが必要になるため
- **`main` への push は `sync-main-to-develop.yml` が `develop` へ自動 back-merge する**。これにより「`main` は常に `develop` の祖先」が保たれ、リリースが fast-forward で通る
- **`release/*` ブランチは作らない**。`main` にブランチ保護は設定していない
- リリース手順は `release` スキル（`.claude/skills/release/SKILL.md`）を参照

### コミットメッセージ規約（gitmoji / ADR 0066）

コミットの件名は **`<gitmoji> <日本語の説明>`** に統一する。Conventional Commits の `type(scope):` prefix は使わない。

```
✨ イベント詳細に対象楽曲セクションを追加する
🐛 特効未選択時に曲の先頭グループが消えるのを直す
📝 ADR 0065 イベント対象楽曲をイベント単位で管理する
♻️ fetchSongsJson から旧 API を削除する
```

- 絵文字は Unicode 文字で書く（`:sparkles:` のショートコードは使わない）
- 絵文字と説明は **半角スペース 1 個**で区切る
- **PR タイトルにも同じ規約を適用する**。squash マージのため、履歴に残る件名は PR タイトル由来になる
- 使える絵文字は [gitmoji 公式](https://gitmoji.dev/) の一覧。よく使うものは下表

| 絵文字 | 用途 |
| ------ | ---- |
| ✨ | 新機能 |
| 🐛 | バグ修正 |
| 🚑️ | 本番の緊急修正 (hotfix) |
| 📝 | ドキュメント・ADR |
| ♻️ | リファクタリング |
| ✅ | テストの追加・修正 |
| 💄 | UI・スタイル |
| ⚡️ | パフォーマンス改善 |
| 🔧 | 設定ファイルの変更 |
| 👷 | CI / GitHub Actions |
| 🍱 | アセット (画像) の追加・更新 |
| 🗃️ | マスターデータの更新 |
| 🔥 | コード・ファイルの削除 |
| 🚚 | ファイルの移動・リネーム |
| ⬆️ | 依存の更新 |
| 🩹 | 軽微な修正 |
| 🔍️ | SEO |
| 🔖 | リリースタグ |

`.husky/commit-msg` が `scripts/check-commit-msg.mjs` を呼んで件名を検証し、違反時はコミットを中断する。`Merge` / `Revert` / `fixup!` / `squash!` / `amend!` と Dependabot の `Bump …` は検証の対象外（書式を選べないため）。上表を変更するときは同スクリプトの `COMMON_GITMOJIS` も揃えること。

### Deployment

Cloudflare Workers (Static Assets) (`https://i7.yo4raw.com`) にデプロイ。リリース・デプロイの具体的な手順は `release` スキル（`.claude/skills/release/SKILL.md`）を参照。

### PWA

ホーム画面追加・オフライン閲覧用の Service Worker と manifest を `public/` 配下に手書きで配置している。`@vite-pwa/astro` は最新の 1.2.0 でも peer 依存が `astro: ^1 || ^2 || ^3 || ^4 || ^5` で **Astro 5 までしか対応していない**（2026-08-26 時点）。導入検討時には `vite-plugin-pwa` 単体も静的ビルドで `sw.js` を出力しなかったため、自前実装を採用した。

- `public/manifest.webmanifest` — アプリ名・テーマカラー (`#14151A`)・アイコン (192/512/maskable) を定義
- `public/sw.js` — Workbox なしの軽量 SW。`SW_VERSION` 文字列を上げると古い static キャッシュをパージ
- 登録: `src/layouts/BaseLayout.astro` の `<head>` 内インラインスクリプトで `navigator.serviceWorker.register('/sw.js')`
- キャッシュ戦略:
  - `/_astro/*` 及び `/assets/cards|th_cards|songs/*` → CacheFirst
  - `docs.google.com/spreadsheets/*` (GViz API) → StaleWhileRevalidate
  - ナビゲーション (HTML) → NetworkFirst（オフライン時は cache → `/` 順でフォールバック）
- PWA アイコン PNG 再生成: `node scripts/generate-pwa-icons.mjs`（`favicon.svg` ベース、`sharp` 依存）。生成済み PNG は `public/` 配下に commit 済み。再生成は `favicon.svg` を変更したときのみで OK
- `public/_headers` で `/sw.js` を `Cache-Control: no-cache` に設定し、SW 更新が即座に行き届くようにする

### Styling

Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin (not the legacy `@astrojs/tailwind` integration). Custom theme colors defined in `src/styles/global.css` via `@theme` block.

サイトは**ライトテーマ固定**（ダークモードは ADR 0020 で廃止済み。`dark:` バリアント・`html.dark`・テーマトグルは存在しない）。チャート配色は `src/styles/global.css` の `@layer base` 内 `:root` で `--chart-grid` `--chart-axis-label` `--chart-text` `--chart-exclude-bg` `--chart-exclude-border` `--chart-mute-fill` を定義し、`src/lib/donutChart.ts` / `src/lib/score/histogram.ts` / `src/lib/score/specDiagrams.ts` のチャート SVG が `fill="var(--chart-grid)"` 等で参照する。新規コンポーネントでは `dark:` バリアントを付けないこと。

#### デザイン規約（apple-design / ADR 0046 / ADR 0047）

`src/styles/global.css` にマテリアル用の `@utility` とトークンを定義済み。新規 UI は以下の規約に従う:

- **マテリアル 3 層**:
  - `material-chrome`（近黒 `#14151A` 半透明 + blur）= ヘッダー等の構造クローム専用（白テキスト前提）。ADR 0047 で indigo から無彩色へ変更済み
  - `material-overlay`（白半透明 + blur + border/shadow）= ドロップダウン等の浮遊オーバーレイ専用（暗色テキスト前提）
  - `surface-card`（**完全不透明** 白 + `--radius-card` + `--shadow-card`）= 本文・データを載せるサーフェス
- **本文テキストを載せる面は必ず不透明**（`surface-card`）にする。半透明面上のテキストは WCAG AA（4.5:1）を満たすこと（0001 の視認性破綻を繰り返さない）
- **明色材の上に明色材を重ねない**（例: モーダルパネル内のカードは solid のまま）
- **リスト行・タイル・大きな繰り返し要素に `backdrop-filter` を使わない**（半透明は chrome の小領域限定。パフォーマンス）
- `prefers-reduced-transparency` / `prefers-contrast` / `prefers-reduced-motion` のフォールバックは `@utility` 定義内と global.css に集約済み。利用側で個別対応しない
- **モーション**: 開閉トランジションは `src/lib/motion.ts` の `materialIn`/`materialOut`（svelte/transition）、押下フィードバックは `pressable` utility を使う。ジェスチャー駆動 UI（ドラッグシート等）は導入しない
  - **GSAP はトップページ専用**（`src/pages/index.astro` + `src/lib/motion/home*.ts`、ADR 0054）。他ページへ広げる場合は必ず ADR を追加すること。トップページ以外では引き続き新規モーション依存を増やさない
  - トップページの要素に付いた `data-motion-item` / `data-motion-group` / `data-count-to` は `src/lib/motion/homeMotion.ts` から参照されている。マークアップを変更する際は同ファイルと `src/lib/motion/homeMotionDom.ts` の `REVEAL_SPECS` も確認すること
  - `data-motion-group` のキーを増やす場合は `REVEAL_SPECS` にも対応する行を追加する（キーが無いグループは再生されず、要素が隠れたままになる）
- **タイポグラフィ**: 大見出しは `text-display` utility（CJK 向け `palt` + 正トラッキング + `line-height:1.35`）。欧文向けの負トラッキングは使わない。数値の揃う列には `tabular-nums`（数字・欧文は ADR 0047 でセルフホストした Barlow Semi Condensed を適用。CJK には適用しない）
- 影・角丸・blur・イージングは `@theme` のトークン（`--shadow-card` 等 → `shadow-card` / `rounded-card` utility）を使い、値を直書きしない
- **色の 3 チャンネル分離（ADR 0047）**: 構造・ナビゲーション・アイデンティティ表現の配色は「属性」「キャラ」「構造」の 3 チャンネルのみとし、混同しない（データ区分を表す配色は後述の対象外）
  - 属性（Shout/Beat/Melody）= **塗りのチップ**。`ATTR_HEX`（`src/lib/constants.ts`）固定
  - キャラ（誰の衣装か）= **線・縁・小さな点のみ**（スパイン・タブ・ドット）。`CHARACTER_HEX`（`src/lib/constants.ts`）が単一情報源
  - 構造（ページ・ナビ・面）= 無彩色（近黒 `#14151A` / 白 / グレー階調）
  - **キャラ色は面を塗らない。テキスト色にも使わない**（属性色との衝突・淡色キャラでのコントラスト破綻を避けるため）。キャラ名等のテキストは近黒のまま、色はスパイン等の別要素が担う
  - **`indigo`（クラス名・HEX とも）は `src/` に増やさない**。リンク・見出し・主ボタン・フォーカスリングも無彩色（近黒 + 下線 / 近黒 / 近黒の塗り / 近黒）とする
  - **3 チャンネル規約の対象外（無彩色化してはならない）**: データそのものの区分を表す配色は現状を維持する。詳細と理由は ADR 0047「適用範囲」の対象外表を参照
    - レアリティバッジ（`RARITY_BADGE_CLASSES`）
    - イベント特効の段階（金銀銅、`EVENT_BONUS_TIERS`）
    - スコア計算仕様ページの計算段階配色（`STAGE_COLORS` / `CARD_COLORS`、ADR 0043）
    - デッキのフレンドスロットの amber（`DeckSlots.svelte` ほか）
    - ホームの免責事項セクションの yellow（`src/pages/index.astro`）
    - 上記以外で新たに色相を持つクラスを足す場合は 3 チャンネル規約に従うか、ADR 0047 の対象外表を更新する

### Testing

#### E2E テスト (Playwright)

`tests/` 直下に配置。`playwright.config.ts` で設定。

##### ローカルでの E2E は dev サーバー (HMR) を再利用する

4321 番ポートにサーバーがない状態で実行すると `npm run preview`（本番ビルド + ローカルサーバー）が自動起動され、本番ビルドの **5.5 分**が上乗せされる。`playwright.config.ts` は `reuseExistingServer: true` のため、**先に dev サーバーを起動しておけばビルドを省いて E2E が回る**（全 19 ファイルで実測 7.5 分、単一ファイルなら数十秒）。ローカル開発中はこちらを使うこと:

1. `npm run dev` をバックグラウンド起動（約 1 秒で ready、dev と本番でパス構成は同一）
2. `npx playwright test tests/<対象>.test.ts` — 4321 番の dev サーバーが再利用され、ビルドは走らない

注意点:

- **`test` / `expect` は `@playwright/test` ではなく `tests/helpers/fixtures.ts` から import する**（ADR 0055）。このフィクスチャが `page.goto` / `page.reload` の直後に `client:load` の島のハイドレート完了を自動で待つ。待たずにクリックするとイベントハンドラ未登録で握り潰され、並列実行時だけ落ちるフレークになる。型のみの import（`type Page` 等）は `@playwright/test` から直接でよい
- **CPU バウンドなテスト**（総当たり探索・MC シミュレーション）は、単独実行時ではなく並列実行で枯渇したときの最悪値にタイムアウトを合わせる（`playwright.config.ts` の既定 30 秒では不足する）
- dev では Astro dev toolbar が `<select name="dev-toolbar-select">` 等を DOM に注入する。ロケータは `getByTestId` / `getByLabel` / role で対象を特定し、裸の `locator('select')` のような曖昧なセレクタは使わない（strict mode 違反になる）
- 本番ビルド経由の E2E（サーバーなしで `npm run test`）が必要なのは、圧縮後挙動・動的ルート全件生成などビルド必須項目の検証とリリース前最終確認のみ。ビルド成否自体は PR の CI ビルドチェックでもカバーされる

#### 単体テスト (Vitest)

スコア計算エンジン等のロジックは `tests/unit/` 配下で Vitest により検証（`vitest.config.ts`）。`src/lib/score/` の各モジュールに対応する単体テストを置く。

#### テストフィクスチャ

`tests/fixtures/` にカード・楽曲・装備の JSON フィクスチャを配置。`npm run extract-fixtures` (`scripts/extract-test-fixtures.ts`) で Google Sheets から再生成可能。

## MCP Server Usage

開発時は以下の MCP サーバーを常に活用すること:

- **Context7**: Astro・Tailwind CSS・Svelte 等のライブラリやフレームワークに関する作業では、必ず Context7 で最新の公式ドキュメントを参照してから実装する

## SEO / インデックス方針

インデックス対象は独自性のあるページへ絞っている（ADR 0057）。衣装詳細・イベント共有ページ・個人データページは `noindex,follow` とし、`astro.config.mjs` の `sitemap.filter` からも除外する。**ページ側の `noindex` と sitemap の除外は必ず対で設定すること**（片方だけだと矛盾したシグナルになる）。`robots.txt` でブロックしてはならない（クロールを止めると `noindex` 自体が読まれない）。

ツールページには `src/components/seo/ToolGuide.astro` による静的な解説セクションを置いている（ADR 0058）。**ツールの仕様を変えたら解説の内容も必ず更新すること。** 実挙動と食い違うと利用者を誤らせる。検索対策の水増しは書かず、実際に使う人が読んで役に立つ説明だけを置く。

## 用語ポリシー

ユーザー可視テキスト（HTML、ラベル、alert/placeholder、aria-label、SVG `<title>` など）では「カード」ではなく **「衣装」** を用いる。アイドリッシュセブンの用語に揃えるため。

内部識別子（コード中の変数名・関数名・ファイル名・URL パス・localStorage キーなど）は引き続き `card` を使用する（例: `cards/[id].astro`、`i7_card_counts`、`fetchCardsJson.ts`、`CardList.svelte`）。

共有ブローチ（`SHARED_BROACHS`）のユーザー可視テキストは **「共通ブローチ」** を用いる（ゲーム内表記に揃えるため）。内部識別子は引き続き `sharedBroach` / `SHARED_BROACHS` / URL `shared-broach` を使用する。

## 命名規約

- イベント変数は `event`（ループ内の短縮は `ev` まで可。`evt` 等は使わない）
- ブローチは内部識別子で `broach`（本リポジトリの慣用綴り。`brooch` に直さない）。固有ブローチ = `FixedBroach`（カード紐付き）、共有ブローチ = `SHARED_BROACHS`（`src/lib/data/sharedBroachs.ts`、表示名は「共通ブローチ」）
- スロット index は `slotIndex`（0=センター, 1-4=メンバー, 5=フレンド。表示順は `DISPLAY_ORDER`）
- デッキ編成状態は `DeckState`（`src/lib/score/deckState.ts`）を使い、個別配列を新設しない

## ADR（意思決定記録）— 必須

設計・仕様・方針に関わる意思決定（機能の採否、仕様変更、調査の結果「変更しない」と決めた場合も含む）を行ったら、**必ず `docs/adr/` に ADR を追加または更新する**。運用ルールとフォーマットは `docs/adr/README.md` に従う:

- ファイル名は `NNNN-<kebab-case-title>.md`（連番 4 桁）。README.md の一覧表にも行を追加する
- 「何を・なぜ決めたか」と検討した代替案を書く。実装の詳細は書かない
- ステータスは `提案` → `承認` で運用し、覆った場合も削除せず `却下` / `破棄` に更新して理由を追記する
- ADR は意思決定が固まったタイミングでコミットする（実装の完了を待たない）

## 衣装表示参考

衣装の表示で判断が難しい場合は
`https://i7.yo4raw.com/cards/{id}/`　が　`https://i7.step-on-dream.net/card.php?ID={id}`　に該当するので参考にする

## Workflow

作業完了後は以下を自動で行うこと:

1. **まず `npm run dev` (HMR 付き開発サーバー) で確認する** — UI の見た目・クライアント JS の挙動・スタイル調整等は HMR で即時確認できる。build を待たないこと
2. Playwright MCP / chrome-devtools MCP で dev サーバー（`http://localhost:4321/`）にアクセスし、変更箇所の画面表示を確認する
3. スクリーンショットを `tmp/` ディレクトリに保存し、ユーザーに提示して問題がないか確認を取る
4. **本番ビルドでしか検出できない項目**（動的ルート全件生成・`@playform/compress` の圧縮後挙動・`BASE_URL` 解決など）に関わる変更の場合のみ、追加で `npm run preview` を実行して最終確認する
5. ユーザーの確認が取れたら **`develop` から** 対応内容に応じたブランチを作成して `git commit` → `git push` し、**base を `develop` にして** PR を作成する。**コミットの件名と PR タイトルは gitmoji 規約（`<gitmoji> <日本語の説明>`、ADR 0066）に従う。**CI の結果を待たずリリースまで行う。リリースに伴う workflow を待つ必要はない
6. リリースは `develop` を `main` へ fast-forward するだけでよい。**タグは `tag-release.yml` が自動採番する**（人手のリリースは MINOR、cron の自動取り込みは PATCH。ADR 0059）。手順の詳細は `release` スキル参照。本番の緊急修正だけは `main` から `hotfix/` を切って `main` に PR を出す
7. **リリースごとに、リリース告知ツイートを作成する** — `release-tweet` スキルを使い、今回リリースした変更点から告知文を 3 案作成し、本文をプリフィルした X の intent リンクとして提示する。**投稿はユーザーが手動で行う**（スキルはブラウザ自動操作も認証情報による自動投稿も行わない）。詳細は `.claude/skills/release-tweet/SKILL.md` を参照
