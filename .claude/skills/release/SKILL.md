---
name: release
description: i7マネ部屋（IDOLiSH7 衣装DB）の Cloudflare Workers へのデプロイ手順。リリースする・デプロイする・本番へ反映する・マスターデータを再デプロイで反映したいときに使う。Worker 設定 / 必要な GitHub Secret / 手動再デプロイの手順を含む。
---

# リリース / デプロイ手順

Cloudflare Workers (Static Assets) (`https://i7.yo4raw.com`) にデプロイする。静的アセットのみの Worker はリクエスト課金対象外で無料運用できる。

## 通常のリリース

**main へマージすれば自動でデプロイされる**（ADR 0051）。タグを打つ操作は不要。

`.github/workflows/deploy.yml` が `main` への push で発火し、`npm run build` → `wrangler deploy` を実行する。`docs/**` と `.claude/**` だけの変更はサイト成果物に影響しないため `paths-ignore` でスキップされる。

PR をマージしたら `gh run list --workflow="Deploy to Cloudflare Workers" --limit 3` でデプロイの成否を確認する。

タグ・GitHub Release・サイト内のリリース履歴ページは廃止済み。フッターには最終コミットの日付と短縮 SHA が表示される。

リリース後は `release-tweet` スキルで告知ツイートを投稿する。

## 手動で再デプロイしたいとき

スプレッドシートのマスターデータ反映など、コード変更を伴わない再デプロイは Actions タブから `Deploy to Cloudflare Workers` を手動実行する (`workflow_dispatch`)。

## 画像取得 cron からのデプロイ

`fetch-new-cards.yml` / `fetch-gap-cards.yml` / `fetch-event-db.yml` / `fetch-new-songs.yml` は PR を auto-merge した後、`deploy.yml` を reusable workflow (`uses: ./.github/workflows/deploy.yml`) として直接呼び出す。auto-merge は `GITHUB_TOKEN` 由来のため main への push イベントを発火せず、`deploy.yml` の push トリガーでは起動しないため。

## 設定

- 必要な GitHub Secret: `CLOUDFLARE_API_TOKEN` (Account > Workers Scripts:Edit 権限), `CLOUDFLARE_ACCOUNT_ID`
- Worker 名: `i7-gottani` (`wrangler.toml` の `name` で指定)
- 静的配信設定: `wrangler.toml` の `[assets] directory = "./dist"` で `dist/` を紐付け、`not_found_handling = "404-page"` で Astro の 404.html を返す

## CI

PR 時に typecheck・カバレッジ・lint・本番ビルドが自動実行される（`.github/workflows/ci.yml`）。画像パス（`public/assets/cards/**`, `public/assets/th_cards/**`）の変更は CI スキップ。デプロイジョブ自身も `npm run build` を通るため、ビルドが壊れた変更は本番へ出ない。
