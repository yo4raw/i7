---
name: release
description: i7マネ部屋（IDOLiSH7 衣装DB）の Cloudflare Workers へのデプロイとリリース手順。リリースする・タグを打つ・デプロイする・本番へ反映する・マスターデータを再デプロイで反映したいときに使う。Worker 設定 / 必要な GitHub Secret / タグなし再デプロイの手順を含む。
---

# リリース / デプロイ手順

Cloudflare Workers (Static Assets) (`https://i7.yo4raw.com`) にデプロイする。静的アセットのみの Worker はリクエスト課金対象外で無料運用できる。GitHub Actions (`.github/workflows/deploy.yml`) が `v*` タグ push もしくは手動実行 (`workflow_dispatch`) で `wrangler deploy` を叩く。

## 通常のリリース

```bash
# 1. fast-forward できるか確認する
git fetch origin
git merge-base --is-ancestor origin/main origin/develop \
  && echo "OK: fast-forward 可能" \
  || echo "NG: main が develop の祖先ではない"
```

`NG` の場合は以降を実行せず、`sync-main-to-develop` ワークフローの完了を待ってから 1. からやり直す。ただし Actions タブで確認して sync が**既に失敗している**場合は、待っても解消しないため、本節後半の「fast-forward が拒否された場合」の復旧手順に進むこと。`OK` を確認できたら次に進む。

```bash
# 2. fast-forward してタグを打つ
SHA=$(git rev-parse origin/develop)    # 1. で確認したコミットを固定する
git push origin "${SHA}:refs/heads/main"
git tag v1.x.x "$SHA" && git push origin v1.x.x
```

> **注記**: `${SHA}` を波括弧で括るのは zsh 対策。zsh は `$SHA:r` を「拡張子を除く」修飾子として解釈するため、`"$SHA:refs/heads/main"` と書くと SHA の末尾に `efs/heads/main` が連結された不正な refspec になり push が失敗する（本リポジトリのシェルは zsh）。

`develop` を `main` へ **fast-forward** してからタグを打つ。1. で確認した `origin/develop` のコミットを `$SHA` に固定し、push とタグ付けの両方でその値を使うのは、push とタグ付けの間に cron の自動取り込みが `main` へ入っても、確認したコミットにタグが載るようにするため（`origin/main` を再取得してから使うと、その間に入った cron の squash コミットを指してしまい、既にタグ済みの同一コミットへ二重にタグを打つおそれがある）。`origin/develop` という**リモート追跡ブランチを基準にする**のは、ローカルに `develop` ブランチが存在しない（または古い）場合でも常にリモートの最新状態を基準に動かすため。PR を経由しないのは、`main` にマージコミットを残さずリリースノートを綺麗に保つため（内容は `develop` 上の各 PR で確認済みという前提）。**squash merge は絶対に使わない** — `develop` の全コミットが 1 つに潰れ、リリースノートが 1 行になる。

**バージョン採番**: 人手のリリースは **MINOR を上げる**（PATCH は cron の自動取り込みが `git tag --sort=-version:refname` を見て自動採番し続けるため。人手のリリースが同じ PATCH 系列に割り込むとタグ列の意味が壊れる）。次に採番するバージョンは直前のタグを確認してから決める（cron のタグ採番ステップ `fetch-new-cards.yml` と同じフィルタを使い、両者が同じ「最新版」を見るようにする）: `git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1`

fast-forward が拒否された場合は、`main` に入った自動取り込みが `develop` へ back-merge されるのを待って再実行する（`sync-main-to-develop.yml` が自動で行う）。非破壊な失敗なので安全側に倒れる。

ただし「待つ」で解決するのは sync が **まだ動いていない / 実行中** の場合のみ。sync が既に**失敗している**場合は、`main` への次の push（cron 実行など）が来るまで再実行されず、待っても解消しない。Actions タブで `Sync main to develop` の実行結果を確認し、失敗していたら次のいずれかで復旧する:

- `workflow_dispatch` で `Sync main to develop` を手動再実行する
- 手元で復旧する:

```bash
git fetch origin
git checkout -B develop origin/develop          # ローカルの develop を常にリモート最新へ揃える
git merge origin/main                           # 衝突したら解決してコミット
git push origin develop
```

本番の緊急修正は `main` から `hotfix/` を切り、`main` に PR を出してマージしてから手動でタグを打つ。タグは PATCH ではなく **MINOR を上げる**（採番ルールは前述のとおり）。ここでも `origin/main` を先に `$SHA` へ固定してからタグを打つ:

```bash
git fetch origin                    # マージは GitHub 側で起きるため origin/main を取り直す
SHA=$(git rev-parse origin/main)
git tag v1.x.x "$SHA" && git push origin v1.x.x
```

通常リリース（2. のブロック）に `git fetch` が無いのは、直前の `git push` で `refs/remotes/origin/main` がローカルに反映されるため。一方 hotfix のマージは GitHub 側（PR マージボタン / `gh pr merge`）で起きてローカルの push を経由しないため、`git fetch origin` をしないと `$SHA` が **マージ前** の古いコミットになり、hotfix を含まないコミットへタグを打ってしまう。

タグを push すると `release.yml` が GitHub Release を作成し、同時に `deploy.yml` が Cloudflare Workers へデプロイする。

リリースノート (`src/pages/releases/index.astro`) は **git タグとコミット件名から build 時に自動生成される**（手で編集するファイルはない）。したがって **コミット件名がそのままリリースノートの本文になる**。タグを打つ前に `git log <前のタグ>..origin/develop --oneline --no-merges` を確認し、ユーザーに見せて意味が通る件名になっているか点検すること（リリースノートページ側も `--no-merges` で生成されるため、揃えないと実際には載らないマージコミットが点検結果に混ざる）。

リリース後は `release-tweet` スキルで告知ツイートを投稿する。

## タグなしで再デプロイしたいとき

スプレッドシートのマスターデータ反映など、コード変更を伴わない再デプロイは Actions タブから `Deploy to Cloudflare Workers` を手動実行する。

**`Use workflow from` で必ず `main` を選ぶこと。** default branch は `develop` のため、ドロップダウンは既定で `develop` を選んでしまう。既定のまま実行すると未リリースの `develop` が本番へ出てしまうため、選択し直すこと（ワークフロー側にもガードがあり、main 以外を選ぶと実行が失敗する）。

## 設定

- 必要な GitHub Secret: `CLOUDFLARE_API_TOKEN` (Account > Workers Scripts:Edit 権限), `CLOUDFLARE_ACCOUNT_ID`
- Worker 名: `i7-gottani` (`wrangler.toml` の `name` で指定)
- 静的配信設定: `wrangler.toml` の `[assets] directory = "./dist"` で `dist/` を紐付け、`not_found_handling = "404-page"` で Astro の 404.html を返す

## CI

PR 時にビルドチェック（`.github/workflows/ci.yml`）が自動実行される。画像パス（`public/assets/cards/**`, `public/assets/th_cards/**`）の変更は CI スキップ。
