# Git Flow 移行 設計

- 日付: 2026-08-17
- 関連 ADR: [0052](../../adr/0052-adopt-git-flow.md)（本設計の意思決定）、[0051](../../adr/0051-tag-creation-via-github-api.md)（前提となるデプロイトリガー修正）

## 1. 目的

`main` の不変条件を **「常にリリース済み（= 本番にデプロイ済み）」** にする。

現状は `main` 単一の GitHub Flow で、デプロイの契機はタグ push であり `main` へのマージではない。そのため `main` には本番未反映のコミットが任意の量だけ溜まり、ブランチからは本番の状態を読み取れない。統合先（人手の変更を溜める場所）と本番の状態を分離する。

## 2. ブランチモデル

| ブランチ | 役割 | 派生元 | マージ先 | マージ方式 |
|---------|------|--------|---------|-----------|
| `main` | 常にリリース済み | — | — | — |
| `develop` | 統合ブランチ（GitHub default） | `main` | `main`（リリース時） | fast-forward |
| `feat/` `fix/` `chore/` `docs/` `refactor/` `test/` `ci/` | 人手の作業 | `develop` | `develop` | squash |
| `hotfix/` | 本番の緊急修正 | `main` | `main` | squash |
| `auto/` | cron の自動取り込み | `main` | `main` | squash（自動） |

作業ブランチの接頭辞は現行の慣習を踏襲する。変わるのは**派生元とマージ先が `develop` になる**点のみ。

### 不変条件

> **`main` は常に `develop` の祖先である**（`git merge-base --is-ancestor main develop` が真）

この不変条件は §4 の `sync-main-to-develop.yml` が維持する。これが成り立つことで、

- リリースが **fast-forward** で行える（`main` にマージコミットが載らない → リリースノートが綺麗に保たれる）
- `main` 直行の自動取り込み（§3-c）と、`develop` 起点の開発が衝突しない

の 2 つが同時に成立する。

## 3. フロー

### (a) 通常開発

```
feat/xxx ──(PR, squash)──▶ develop
```

`develop` を base に PR を作る。CI（typecheck + coverage / build / oxlint）が回る。マージしても本番には出ない。

### (b) リリース

```bash
# 1. fast-forward できるか確認する
git fetch origin
git merge-base --is-ancestor origin/main origin/develop \
  && echo "OK: fast-forward 可能" \
  || echo "NG: main が develop の祖先ではない"
```

`NG` の場合は以降を実行せず、`sync-main-to-develop` ワークフローの完了を待ってから 1. からやり直す。`OK` を確認できたら次に進む。

```bash
# 2. fast-forward してタグを打つ
SHA=$(git rev-parse origin/develop)    # 1. で確認したコミットを固定する
git push origin "$SHA:refs/heads/main"
git tag v1.x.x "$SHA" && git push origin v1.x.x
```

1. で確認した `origin/develop` のコミットを `$SHA` に固定し、push とタグ付けの両方でその値を使うのは、push とタグ付けの間に cron の自動取り込みが `main` へ入っても確認したコミットにタグが載るようにするため（`origin/main` を再取得してから使うと、その間に入った cron の squash コミットを指してしまい、既にタグ済みの同一コミットへ二重にタグを打つおそれがある）。`main` へのマージコミットを作らないため、PR は経由しない。内容は `develop` 上の各 PR で確認済みである前提。

fast-forward が拒否された場合は、`main` に入った自動取り込みが `develop` へ back-merge されるのを待ってから再実行する（§7 リスク参照）。失敗は非破壊なので安全側に倒れる。

### (c) アセット自動取り込み（cron 4 本）

```
auto/add-cards-xxx ──(PR, auto squash)──▶ main ──(自動採番タグ)──▶ deploy
                                            └──▶ (sync) ──▶ develop
```

現行の挙動を維持する。マージ直後に `vX.Y.Z` が打たれ即デプロイされるため、`main` の不変条件は崩れない。新カード画像が 1 時間以内に本番へ出る現行の即時性もそのまま保たれる。

default branch が `develop` に変わっても `main` を向き続けるよう、4 本すべてに `ref: main` / `base: main` を明示する（§5 参照）。

### (d) hotfix

```
main ──▶ hotfix/xxx ──(PR, squash)──▶ main ──(手動タグ)──▶ deploy
                                        └──▶ (sync) ──▶ develop
```

`develop` の未リリース分を巻き込まずに本番を直せる。back-merge は sync ワークフローが自動で行う。

## 4. 新規ワークフロー `sync-main-to-develop.yml`

`main` に入った変更を `develop` へ取り込み、不変条件を維持する。

| 項目 | 内容 |
|------|------|
| トリガー | `push` → `branches: [main]`（タグ push では発火しない）+ `workflow_dispatch`（衝突や push レースで失敗した際、次の `main` push を待たずに手動再実行するため） |
| 権限 | `contents: write` |
| 並行制御 | `concurrency: { group: sync-main-to-develop, cancel-in-progress: false }` |
| checkout | `ref: develop`, `fetch-depth: 0` |

処理:

```bash
git fetch origin main
if git merge-base --is-ancestor origin/main HEAD; then
  echo "develop already contains main; nothing to do"
  exit 0
fi
git merge --no-edit origin/main
git push origin HEAD:develop
```

- **既に取り込み済みなら何もしない**。リリース直後（`develop` == `main`）はここで抜ける。
- **衝突したらジョブを fail させる**。取り込み対象は主に画像ファイルの追加であり衝突はまず起きない。起きた場合は通知を受けて手動で解決する（自動リトライや自動 PR 作成は行わない — 静かに壊れるより、はっきり落ちる方がよい）。
- push は `GITHUB_TOKEN` で行う。`develop` への push で発火させたいワークフローは存在しない（CI は `pull_request` のみ）ため、トリガー抑止は問題にならない。

## 5. 既存ファイルの変更

| ファイル | 変更内容 | 理由 |
|---------|---------|------|
| `.github/workflows/ci.yml` | `pull_request.branches` を `[main, develop]` へ | 作業ブランチ → `develop`、hotfix → `main` の双方で CI を回す |
| `fetch-new-cards.yml` / `fetch-gap-cards.yml` / `fetch-event-db.yml` / `fetch-new-songs.yml` | `actions/checkout` に `ref: main`、`peter-evans/create-pull-request` に `base: main` を明示 | **必須**。`create-pull-request` の `base` 既定値は「checkout されたブランチ」であり、default 変更だけで PR の宛先が黙って `develop` に変わる。さらに `actions/checkout` は checkout したブランチ向けに `remote.origin.fetch` を設定するため、`develop` を checkout すると `git fetch origin main` で `refs/remotes/origin/main` が更新されず、タグ採番（`git rev-parse origin/main`）が誤ったコミットを指しうる |
| `src/pages/releases/index.astro` | `git log --format=… <range>` に `--no-merges` を追加 | back-merge のマージコミットがリリースノートに混入するのを防ぐ。既存の "Merge pull request #NNN …" ノイズも消える |
| `CLAUDE.md` | ブランチ戦略の節を追加し、Workflow 節（手順 6）を改訂 | 作業ブランチの派生元・マージ先が `develop` になる |
| `.claude/skills/release/SKILL.md` | リリース手順に `develop` → `main` の fast-forward を追加 | |
| `docs/adr/README.md` | ADR 0052 の行を追加 | |
| `deploy.yml` | `workflow_dispatch` 実行に `main` 以外を弾くブランチガードを追加 | default branch 変更により `Run workflow` の既定 ref が `develop` になるため。既定のまま手動実行すると未リリースの `develop` が本番へ出てしまう |

**変更しないもの**: `release.yml`、`.github/dependabot.yml`（default branch に追従するため設定変更不要）。

## 6. 移行手順

順序に依存関係がある。**この順で実施する**。

1. **`develop` ブランチを作成する** — `git push origin main:develop`
   sync ワークフローは `develop` を checkout するため、ワークフロー投入前に存在させる。
2. **変更一式を `main` への PR にしてマージする**（`ci.yml` / cron 4 本 / releases ページ / sync ワークフロー / ドキュメント / ADR）
   この時点では default branch はまだ `main` なので、base は `main` のままでよい。
   このマージで sync ワークフローが初回起動し、`develop` へ fast-forward で取り込まれる（この時点で `develop` == 旧 `main` のため）。
3. **default branch を `develop` に変更する**
   手順 2 が先に入っていないと、切替直後の毎時実行で画像 PR が `develop` へ流れ、タグ採番も誤る。
4. **既存の open PR 5 件（Dependabot）の base を `develop` に付け替える** — `gh pr edit <n> --base develop`

## 7. 検証

移行前（PR 上で確認できるもの）:

- `.github/workflows/*.yml` の YAML 妥当性
- `npm run lint` / `npm run typecheck` / `npm run coverage`
- `npm run dev` で `/releases/` を開き、`--no-merges` 適用後の表示を確認（マージコミット行が消え、実コミットが残ること）

`--no-merges` の影響は設計時に全リリースへ対して事前確認済み。**全 280 リリースのうち 71 件で行が減り、コミットが 0 件になる（＝「差分コミットなし」表示に変わる）リリースは 0 件**だった。したがって既存のリリースノートを空にする副作用はない。

移行後（実地で確認するもの）:

| 確認項目 | 方法 |
|---------|------|
| sync ワークフローが動く | 手順 2 のマージで初回実行。`develop` が `main` を含むこと |
| cron の PR が `main` を向く | 次の毎時実行、または `workflow_dispatch` |
| 自動採番タグが正しいコミットに付く | 同上（ADR 0051 の修正の実地検証も兼ねる） |
| Dependabot が `develop` を向く | 次回の週次実行 |
| リリースが fast-forward で通る | 最初の人手リリース時 |

## 8. リスクと対応

| リスク | 影響 | 対応 |
|-------|------|------|
| default 切替後に cron が `develop` を向く | 画像 PR の誤送、タグの誤採番 | 手順 2 → 3 の順序を守る。§5 の `ref`/`base` 明示が本質的な対策 |
| sync の衝突 | `develop` が `main` を含まなくなり、次のリリースの fast-forward が失敗する | ジョブが fail するので気づける。**失敗は待っても解消しない**（次の `main` push まで再実行されないため）。`workflow_dispatch` で再実行するか、手元でマージして push |
| sync の push レース（checkout 後・push 前に人間が `develop` へマージし non-fast-forward で拒否される） | sync が失敗し、上と同じくリリースの fast-forward が通らなくなる | ジョブが fail するので気づける。`workflow_dispatch` で再実行するか、手元で `origin/develop` を取り込んでから push |
| リリースの fast-forward 拒否 | リリースが一時的に行えない | 非破壊な失敗。sync の完了を待って再実行 |
| `develop` の長期滞留 | 本番に出ていない変更が増える | 本設計の目的そのもので、許容する。滞留量が問題になる場合はリリース頻度で調整する |
| リリース時に squash merge を選んでしまう | `develop` の全コミットが 1 つに潰れ、リリースノートが 1 行になる | リリースは PR ではなく fast-forward push で行う手順とし、`release` スキルに明記する |

## 9. 対象外

- `main` のブランチ保護設定（ADR 0052 決定 7 により設定しない）
- `release/*` ブランチ（ADR 0052 決定 1 により設けない）
- `fetch-event-db` に散発する `curl` タイムアウト失敗（ゲームサーバー側の一過性障害。ADR 0051 で対象外と整理済み）
- 過去の重複タグ・欠落した GitHub Release の埋め戻し
- 既存の stale なリモートブランチの整理
