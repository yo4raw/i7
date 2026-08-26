---
name: release
description: i7マネ部屋（IDOLiSH7 衣装DB）の Cloudflare Workers へのデプロイとリリース手順。リリースする・タグを打つ・デプロイする・本番へ反映する・マスターデータを再デプロイで反映したいときに使う。Worker 設定 / 必要な GitHub Secret / タグなし再デプロイの手順を含む。タグは main への push で自動採番される。
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
# 2. fast-forward する（タグは自動で打たれる）
SHA=$(git rev-parse origin/develop)    # 1. で確認したコミットを固定する
git push origin "${SHA}:refs/heads/main"
```

> **注記**: `${SHA}` を波括弧で括るのは zsh 対策。zsh は `$SHA:r` を「拡張子を除く」修飾子として解釈するため、`"$SHA:refs/heads/main"` と書くと SHA の末尾に `efs/heads/main` が連結された不正な refspec になり push が失敗する（本リポジトリのシェルは zsh）。

`develop` を `main` へ **fast-forward** すれば、`tag-release.yml` が push を受けて MINOR を上げたタグを自動で採番する（ADR 0059）。**人がタグを打つ必要はない。** 1. で確認した `origin/develop` のコミットを `$SHA` に固定するのは、確認したコミットがそのまま `main` に載るようにするため。`origin/develop` という**リモート追跡ブランチを基準にする**のは、ローカルに `develop` ブランチが存在しない（または古い）場合でも常にリモートの最新状態を基準に動かすため。PR を経由しないのは、`main` にマージコミットを残さずリリースノートを綺麗に保つため（内容は `develop` 上の各 PR で確認済みという前提）。**squash merge は絶対に使わない** — `develop` の全コミットが 1 つに潰れ、リリースノートが 1 行になる。

**バージョン採番**: `tag-release.yml` が自動で決める。人手のリリース（`main` への push）は **MINOR を上げ**、cron の自動取り込みは **PATCH を上げる**（PATCH 系列は cron 専用。人手のリリースが割り込むとタグ列の意味が壊れるため）。

**MAJOR を上げたいとき、または任意のバージョンを付けたいとき**は、fast-forward の**前に**手動でタグを打っておく。同一コミットに既に `vX.Y.Z` があれば自動採番はスキップされる:

```bash
SHA=$(git rev-parse origin/develop)
git tag v2.0.0 "$SHA" && git push origin v2.0.0
git push origin "${SHA}:refs/heads/main"    # 自動採番はスキップされる
```

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

> **`Sync main to develop` の実行履歴自体が古い場合**（失敗ですらなく、`main` が進んでいるのに起動した形跡がない）は、ワークフローが呼ばれていないことを疑う。cron の auto-merge は `GITHUB_TOKEN` 由来のため `main` への push イベントを発火せず、`on: push` だけでは起動しない。ADR 0060 で cron 4 本から `workflow_call` で直接呼ぶようにしてあるので、cron 側の `sync-main-to-develop` ジョブが失敗していないか確認すること。復旧自体は上の手元の手順で行う。

本番の緊急修正は `main` から `hotfix/` を切り、`main` に PR を出してマージする。マージが `main` への push になるため、通常リリースと同じく `tag-release.yml` が MINOR を上げたタグを自動採番する。手動でタグを打つ必要はない。

タグが作られると `release.yml` が GitHub Release を作成し、同時に `deploy.yml` が Cloudflare Workers へデプロイする。`main` へ push してから本番へ反映されるまでは、タグ採番 → ビルド → デプロイの順に進む。

リリースノート (`src/pages/releases/index.astro`) は **git タグとコミット件名から build 時に自動生成される**（手で編集するファイルはない）。したがって **コミット件名がそのままリリースノートの本文になる**。`main` へ fast-forward する前に `git log <前のタグ>..origin/develop --oneline --no-merges` を確認し、ユーザーに見せて意味が通る件名になっているか点検すること（リリースノートページ側も `--no-merges` で生成されるため、揃えないと実際には載らないマージコミットが点検結果に混ざる）。

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
