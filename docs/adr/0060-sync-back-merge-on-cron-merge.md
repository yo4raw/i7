# 0060 cron の自動取り込みでも main → develop の back-merge を起動する

- ステータス: 承認
- 日付: 2026-08-26

## 文脈

ADR 0052 の決定 6 で、`main` への push を `develop` へ自動 back-merge するワークフロー `sync-main-to-develop.yml` を導入した。これは「`main` は常に `develop` の祖先」という不変条件を保つ唯一の仕掛けであり、毎時の cron が `main` 直行で取り込む例外（決定 5）と、リリースを fast-forward で行う方針（決定 4）を両立させるためのものだった。

しかし `sync-main-to-develop.yml` のトリガーは `on: push: branches: [main]` のみであり、**cron の auto-merge では起動しない**。GitHub は `GITHUB_TOKEN` による push で他のワークフローをトリガーせず、cron 4 本の `gh pr merge` は `GITHUB_TOKEN` で実行されているためである。これは ADR 0051 および ADR 0059 で扱ったのと同じ制約である。

結果として、想定していた仕掛けが**導入以来、人手のリリースと hotfix でしか動いていなかった**。2026-08-26 時点で sync の最終実行は 8/21 であり、その後 `main` に入った画像取り込み 5 件（#423〜#427）は `develop` へ取り込まれないまま滞留していた。不変条件は破れており、リリースしようとした時点で fast-forward が拒否され、手元での復旧作業が必要になった。

`release` スキルには「fast-forward が拒否された場合は sync の完了を待つ」「sync が失敗している場合は手動再実行するか手元で復旧する」という手順が書かれていたが、**そもそも sync が起動していない**という第三の状態は想定されていなかった。待っても解消せず、Actions タブの実行履歴にも失敗として現れないため、原因に辿り着きにくい。

## 決定

**`sync-main-to-develop.yml` に `workflow_call` を追加し、cron 4 本から明示的に呼び出す。** ADR 0059 で `tag-release.yml` に対して行ったのと同じ構造で、各 cron の末尾に `uses: ./.github/workflows/sync-main-to-develop.yml` のジョブを追加する。

cron 1 本の流れは次のようになる。

```
fetch-* (PR 作成 → auto-merge)
  ├─ tag-release        (PATCH タグ採番 → deploy / release を起動)
  └─ sync-main-to-develop (main を develop へ back-merge)
```

2 つのジョブは互いに独立しているため並列に走らせる。`push` トリガーと `workflow_dispatch` はそのまま残すため、人手のリリース・hotfix・手動復旧の経路は変わらない。

## 検討した代替案

- **cron の auto-merge を `RELEASE_PAT` で実行する**: `tag-release` と `sync` の両方が push トリガーだけで起動するようになり、呼び出しジョブの追加が不要になる。ただし PAT に PR マージ権限が要り、ADR 0059 で同じ理由により見送った判断と揃えるべきである。`workflow_call` なら `GITHUB_TOKEN` の権限のまま呼べる。
- **sync を独立した cron（毎時実行）にする**: 取り込みの有無にかかわらず定期的に back-merge を試みる方式。呼び出し関係は単純になるが、何もしない実行が毎時走り、失敗が「起動していない」のか「マージできない」のかの区別も付きにくくなる。取り込みが起きた時にだけ走る方が因果が追いやすい。
- **リリース時に fast-forward が拒否されたら自動で back-merge して再試行する**: 症状には対処できるが、不変条件が破れている状態そのものは放置される。`main` と `develop` の乖離が大きいほど衝突の危険も上がるため、取り込みのたびに解消する方が安全である。

## 影響

- `sync-main-to-develop.yml`: `workflow_call` トリガーを追加
- `fetch-new-cards.yml` / `fetch-gap-cards.yml` / `fetch-event-db.yml` / `fetch-new-songs.yml`: `sync-main-to-develop` 呼び出しジョブを追加
- ADR 0052 の決定 6 が、導入時に意図したとおり機能するようになる
- 本 ADR の適用前に滞留していた 5 コミット分は、手元で `develop` に `main` をマージして push することで解消済み
