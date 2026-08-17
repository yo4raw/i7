# 0051 自動採番タグの作成を git push から GitHub API 経由へ変更する

- ステータス: 承認
- 日付: 2026-08-17

## 文脈

`fetch-new-cards` / `fetch-gap-cards` / `fetch-event-db` / `fetch-new-songs` の 4 つの cron ワークフローは、取り込んだアセットの PR を `main` へ auto-merge したあと、パッチ版タグ（`vX.Y.Z`）を自動採番して push する。このタグ push が `deploy.yml`（Cloudflare Workers へのデプロイ）と `release.yml`（GitHub Release 作成）のトリガーになっており、新カード画像が 1 時間以内に本番へ反映される仕組みを支えていた。

GitHub は **`GITHUB_TOKEN` による push では他のワークフローをトリガーしない**。そのため 2026-06-08 (#255) に、`actions/checkout` が永続化した認証ヘッダを消して `RELEASE_PAT` を使わせる回避策が入っていた:

```bash
git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/..."
git config --local --unset-all http."https://github.com/".extraheader
git push origin "$NEW_TAG"
```

その後 2026-06-18 に Dependabot が `actions/checkout` を v6 → v7 へ更新した。v7 は認証情報を local config の `http.<url>.extraheader` ではなく、**別ファイル + `includeIf.gitdir:` エントリ経由**で保持するよう実装が変わっている。結果として上記の `--unset-all` は何も消さない no-op となり、`GITHUB_TOKEN` の認証が生き残ったまま push されるようになった。

**症状**: タグ push 自体は成功する（ログに `* [new tag] v1.56.3 -> v1.56.3`）が、`deploy.yml` / `release.yml` がどちらも発火しない。タグだけが増えて本番は更新されない。2026-08-06 の `v1.56.0` を最後に本番デプロイが止まり、`v1.56.1` / `v1.56.2` / `v1.56.3` で取り込んだカード画像（3819〜3829）が本番で 404 のままになっていた。

この不具合は以前から断続的に発生していた形跡がある。同一コミットを指す重複タグが履歴上 7 組（`v1.55.2`/`v1.55.3`、`v1.52.4`/`v1.52.5`、`v1.9.2`/`v1.9.3` ほか）存在し、これらは自動タグが発火しなかったのを手動でタグを打ち直して救済した痕跡である。副作用としてリリースノートページに差分ゼロの空リリースが並んでいた。

## 決定

1. **タグ作成を `git push` ではなく GitHub API (`gh api`) で行う**。

   ```bash
   gh api --method POST "repos/${{ github.repository }}/git/refs" \
     -f ref="refs/tags/$NEW_TAG" -f sha="$SHA"
   ```

   `GH_TOKEN` には従来どおり `RELEASE_PAT` を渡す。API 経由なら使用される資格情報が明示的であり、**ローカル git の認証設定に一切依存しない**。`actions/checkout` が将来また認証情報の保持方式を変えても壊れない。

2. **`git remote set-url` / `extraheader` を unset する回避策を削除する**。checkout の内部実装に追随し続ける方式は本質的に壊れやすく、原因の再発源であるため取り除く。

3. **二重タグのガードを追加する**。タグ採番の前に対象コミットを確認し、すでに `vX.Y.Z` が付いていればスキップする。

   ```bash
   if git tag --points-at "$SHA" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
     echo "$SHA is already tagged; skip"
     exit 0
   fi
   ```

   4 本の cron はいずれも毎時 00 分に起動し同時に走るため、複数が同一コミットにタグを打とうとしうる。ガードにより後続分がここで止まる。

## 検討した代替案

- **`includeIf.gitdir:` エントリも unset するよう回避策を拡張する**: 最小の変更で済むが、`actions/checkout` の内部実装に依存する構造は変わらない。同じ壊れ方を将来また踏むため不採用。
- **`actions/checkout` に `persist-credentials: false` を指定する**: 認証情報を残さないので原因を根本から絶てるが、同じジョブ内の `peter-evans/create-pull-request` など他ステップの push にも影響し、それぞれに token を渡し直す必要がある。影響範囲が広いため不採用。
- **タグを廃止し `deploy.yml` を `push: branches: [main]` トリガーへ変更する**: タグ問題自体が消えるが、リリースノートページ（`src/pages/releases/index.astro`）・GitHub Release・リリース告知ツイートがいずれも git タグを起点にしており、リリースの単位という概念そのものを作り直すことになる。今回の目的（本番復旧）に対して影響が大きすぎるため不採用。
- **`gh workflow run deploy.yml` でデプロイを明示的に起動する**: タグ push のトリガー問題を迂回できるが、`release.yml`（GitHub Release）は別途起動が必要で、タグとリリースの対応関係も崩れる。恒久策としては不採用（今回の本番復旧では一度限りの手段として使用した）。

## 影響

- `.github/workflows/fetch-new-cards.yml` / `fetch-gap-cards.yml` / `fetch-event-db.yml` / `fetch-new-songs.yml` の `Bump tag and trigger release/deploy` ステップを差し替え。4 本とも同一の内容。
- `RELEASE_PAT` は引き続き必要（API 呼び出しに使用）。`GITHUB_TOKEN` では他ワークフローをトリガーできないため代替できない。
- 本番の復旧は、`main` の HEAD にすでに `v1.56.3` が付いていたため新規タグを打たず `deploy.yml` の手動実行 (`workflow_dispatch`) で行った。
- `v1.56.1` / `v1.56.2` / `v1.56.3` の GitHub Release は欠落したままとする。サイトのリリースノートは GitHub Release ではなく git タグとコミット件名から生成されるため、表示上の実害がない。
- `fetch-event-db` に散発する失敗（直近 60 件中 7 件）は本件とは無関係で、ゲームサーバー (`i7.step-on-dream.net`) への `curl` タイムアウトによるもの。本 ADR では対象外とする。
