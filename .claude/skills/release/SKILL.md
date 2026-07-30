---
name: release
description: i7マネ部屋（IDOLiSH7 衣装DB）の Cloudflare Workers へのデプロイとリリース手順。リリースする・タグを打つ・デプロイする・本番へ反映する・マスターデータを再デプロイで反映したいときに使う。Worker 設定 / 必要な GitHub Secret / タグなし再デプロイの手順を含む。
---

# リリース / デプロイ手順

Cloudflare Workers (Static Assets) (`https://i7.yo4raw.com`) にデプロイする。静的アセットのみの Worker はリクエスト課金対象外で無料運用できる。GitHub Actions (`.github/workflows/deploy.yml`) が `v*` タグ push もしくは手動実行 (`workflow_dispatch`) で `wrangler deploy` を叩く。

## 通常のリリース

```bash
git tag v1.x.x && git push origin v1.x.x
```

タグを push すると `release.yml` が GitHub Release を作成し、同時に `deploy.yml` が Cloudflare Workers へデプロイする。

リリースノート (`src/pages/releases/index.astro`) は **git タグとコミット件名から build 時に自動生成される**（手で編集するファイルはない）。したがって **コミット件名がそのままリリースノートの本文になる**。タグを打つ前に `git log <前のタグ>..HEAD --oneline` を確認し、ユーザーに見せて意味が通る件名になっているか点検すること。

リリース後は `release-tweet` スキルで告知ツイートを投稿する。

## タグなしで再デプロイしたいとき

スプレッドシートのマスターデータ反映など、コード変更を伴わない再デプロイは Actions タブから `Deploy to Cloudflare Workers` を手動実行する。

## 設定

- 必要な GitHub Secret: `CLOUDFLARE_API_TOKEN` (Account > Workers Scripts:Edit 権限), `CLOUDFLARE_ACCOUNT_ID`
- Worker 名: `i7-gottani` (`wrangler.toml` の `name` で指定)
- 静的配信設定: `wrangler.toml` の `[assets] directory = "./dist"` で `dist/` を紐付け、`not_found_handling = "404-page"` で Astro の 404.html を返す

## CI

PR 時にビルドチェック（`.github/workflows/ci.yml`）が自動実行される。画像パス（`public/assets/cards/**`, `public/assets/th_cards/**`）の変更は CI スキップ。
