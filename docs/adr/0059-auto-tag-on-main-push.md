# 0059 main への push でリリースタグを自動採番する

- ステータス: 承認
- 日付: 2026-08-26

## 文脈

ADR 0052 で簡易 Git Flow へ移行し、リリースは「`develop` を `main` へ fast-forward し、`main` でタグを打つ」手順になった。デプロイの契機は `v*` タグの push であり（`deploy.yml` / `release.yml`）、`main` の不変条件は「常にリリース済み」である。

この手順には、`main` へ fast-forward した後に**人がタグを打つ**という手作業が残っている。

- fast-forward とタグ付けは常に対になっており、片方だけを行う運用は存在しない。にもかかわらず 2 手に分かれているため、タグを打ち忘れれば `main` の不変条件（常にリリース済み）が静かに破れる。
- `release` スキルには、その 2 手の間に cron の自動取り込みが `main` へ入る競合を避けるための注意書き（`$SHA` を先に固定する、`origin/main` を再取得しない）が積み上がっている。手順が増えるほど、人が誤る余地も増える。
- 一方、cron 4 本（カード画像・ギャップ補完・イベント DB・楽曲画像）は auto-merge の直後に同じタグ採番ロジックを自前で持っており、**同一の 25 行が 4 ファイルに重複**していた。

## 決定

**`main` が進んだら、タグ採番を自動で行う。** 新規ワークフロー `tag-release.yml` にタグ採番ロジックを一本化し、2 つの入口から呼ぶ。

1. **`on: push: branches: [main]`** — 人手のリリース（`develop` → `main` の fast-forward）と hotfix のマージ。リリース手順から「タグを打つ」手作業がなくなり、fast-forward push だけで完結する。

2. **`on: workflow_call`** — cron 4 本からの呼び出し。cron の auto-merge は `GITHUB_TOKEN` 由来のため `main` への push イベントを発火せず、1 のトリガーでは起動しない。この制約は ADR 0051 で扱った「`GITHUB_TOKEN` による push は他のワークフローをトリガーしない」と同じものである。cron 側の「Bump tag」ステップは削除し、reusable workflow の呼び出しに置き換える。

**採番は呼び出し元によって変える。** `workflow_call` の `bump` 入力で指定し、cron だけが `patch` を渡す。`push` トリガーでは入力が空になるため `minor` とみなす。

| 入口 | bump | 例 |
|------|------|-----|
| 人手のリリース / hotfix（push） | `minor` | v1.56.3 → v1.57.0 |
| cron の自動取り込み（workflow_call） | `patch` | v1.56.3 → v1.56.4 |

これは `release` スキルが定めていた既存の採番ルール（人手のリリースは MINOR、PATCH 系列は cron 専用）をそのまま自動化したものであり、運用の変更ではない。

タグ作成の方式（`git push` ではなく `gh api`、`RELEASE_PAT` の使用）と二重タグガードは ADR 0051 のまま移設し、変更しない。二重タグガードは、`minor` / `major` を上げたいときに**先に手動でタグを打ってから push する**という抜け道としても機能する（既にタグがあれば自動採番はスキップされる）。

## 検討した代替案

- **cron の auto-merge を `RELEASE_PAT` で実行し、push トリガー 1 本に寄せる**: `tag-release.yml` の入口が 1 つで済み最も単純だが、PAT に PR マージ権限が要る。ADR 0051 で確立した「実績のある経路」を変更することになり、失敗しても毎時 cron の中で静かに起きる。`workflow_call` なら `GITHUB_TOKEN` の権限のまま呼べる。
- **タグ採番を composite action に切り出す**: 重複解消はできるが、`main` への push を起点にできず、人手のリリースからタグ打ちの手作業を無くすという本 ADR の目的を満たさない。
- **タグ運用そのものを廃止し `main` への push で直接デプロイする**: 手作業は最小になるが、リリースノートページ・GitHub Release・告知ツイートがいずれもタグを起点にしており（ADR 0052）、リリースの単位が失われる。不採用。
- **採番を常に PATCH +1 に統一する**: ワークフローは単純になるが、人手のリリースが cron の PATCH 系列へ割り込み、タグ列から「人が出したリリース」と「画像の自動取り込み」の区別が失われる。

## 影響

- 新規: `.github/workflows/tag-release.yml`
- `fetch-new-cards.yml` / `fetch-gap-cards.yml` / `fetch-event-db.yml` / `fetch-new-songs.yml`: 「Bump tag」ステップ（各 25 行）を削除し、`tag-release.yml` の呼び出しジョブへ置き換え
- `release` スキル / `CLAUDE.md`: リリース手順を「fast-forward するだけ」に更新
- タグ採番が直列化される（`concurrency: tag-release`）。従来は 4 本の cron が同時に走った場合に二重タグガードのレースがあった
