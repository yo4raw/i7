# 0052 GitHub Flow から簡易 Git Flow へ移行する

- ステータス: 承認
- 日付: 2026-08-17

## 文脈

本リポジトリはこれまで GitHub Flow で運用してきた。`main` 単一のブランチに対して作業ブランチから PR を出し、squash merge し、任意のタイミングで `vX.Y.Z` タグを打つとデプロイされる。

この運用には次の問題がある。

- **`main` の状態が「本番に出ているもの」と一致しない**。デプロイの契機はタグ push であり `main` へのマージではないため、`main` には本番に出ていないコミットが任意の量だけ溜まる。ブランチを見ても、どこまでが本番に反映済みなのか判別できない。
- 毎時 4 本の cron（カード画像・ギャップ補完・イベント DB・楽曲画像）が `main` へ自動マージし続けるため、`main` は人が意図しないタイミングでも常時動いている。人手の変更と自動取り込みが同じブランチ上で混在する。

一方、現状の運用には維持すべき性質もある。

- cron が取り込んだ新カード画像は、マージ直後の自動採番タグによって 1 時間以内に本番へ反映される。ゲーム側の新カード追加やイベント開始に追従するうえで、この即時性には価値がある。
- リリースノートページ（`src/pages/releases/index.astro`）・GitHub Release・リリース告知ツイートはいずれも git タグを起点にしており、タグがリリースの単位という前提は動かしたくない。

## 決定

1. **簡易 Git Flow を採用する**。ブランチは `main` / `develop` / 作業ブランチ（`feat/` `fix/` `chore/` `docs/` `refactor/` 等）/ `hotfix/` の 4 種とし、**`release/*` ブランチは設けない**。リリース候補を固めてから微修正する期間を必要としておらず、ブランチ 2 本へのマージバックという恒常的な手間に見合わないため。

2. **`main` の不変条件を「常にリリース済み（= 本番にデプロイ済み）」とする**。`develop` を統合ブランチとし、人手の変更はすべて `develop` に溜める。

3. **`develop` を GitHub の default branch にする**。PR の base、Dependabot の宛先、`peter-evans/create-pull-request` の base がいずれも default branch に追従するため、設定の書き換えを最小にでき、`main` への誤マージも起きにくい。

4. **リリースは `develop` を `main` へ fast-forward し、`main` でタグを打つ**。PR を経由しないのは、`main` にマージコミットを残さずリリースノートを綺麗に保つため。後述の back-merge により `main` は常に `develop` の祖先であることが保証されるので、fast-forward が成立する。

5. **毎時の自動取り込み（cron 4 本）は `main` 直行の例外とする**。従来どおり `main` へ auto-merge し、自動採番タグを打ち、即デプロイする。マージ直後にタグが打たれるため `main` の不変条件（リリース済み）は崩れない。新カードの即時反映という現行の価値を維持できる。

6. **`main` への push を `develop` へ自動 back-merge する**（新規ワークフロー `sync-main-to-develop.yml`）。これが不変条件「`main` は常に `develop` の祖先」を保つ唯一の仕掛けであり、5 の例外と 4 の fast-forward リリースを両立させる。

7. **`main` にブランチ保護は設定しない**。ソロ運用であり、承認を必須にすると自分自身がブロックされる。また `ci.yml` は画像のみの変更を `paths-ignore` で丸ごとスキップするため、required status check にすると画像のみのリリースでチェックが永久に pending となりマージ不能になる。運用ルール（CLAUDE.md / `release` スキル）で担保する。

8. **リリースノート生成に `--no-merges` を加える**。back-merge によって `develop` にマージコミットが載るため、そのままではリリースノートに混入する。既存の "Merge pull request #NNN …" というノイズも同時に消える。

## 検討した代替案

- **本家 Git Flow（`release/*` ブランチあり）**: リリース候補を固めてから微修正できるが、`main` と `develop` の両方へマージバックする手間が毎リリース発生する。リリース準備期間を必要としていないため不採用（決定 1）。
- **`main` を default branch のまま残す**: リポジトリトップが常にリリース済みコードになる利点はあるが、Dependabot に `target-branch`、cron 4 本に `base` を明示する必要があり、人が PR を作るたびに base を切り替える手間も残る。設定漏れが `main` への誤マージに直結するため不採用（決定 3）。
- **自動取り込みも `develop` に入れ、自動タグを廃止する**: 厳密な Git Flow に沿うが、新カード画像・イベント情報の本番反映が次の人手リリースまで遅れる。イベント開始直後の反映遅れは利用者への影響が大きいため不採用（決定 5）。
- **自動取り込みを `develop` に入れ、`develop` → `main` の自動マージ + タグまで自動化する**: 即時性は保たれるが、`develop` にある作業中の機能も一緒に本番へ出るため、本 ADR の目的そのものと矛盾する。不採用（決定 5）。
- **リリースを `develop` → `main` の PR 経由にする**: 変更内容をレビュー画面で確認できる利点があるが、`main` にマージコミットが載りリリースノートにノイズが入る。ソロ運用でレビュー相手がおらず、内容は `develop` 上の PR で既に確認済みであるため不採用（決定 4）。
- **`main` に「直接 push 禁止 + PR 必須」の保護をかける**: 誤マージを仕組みで防げるが、リリースを fast-forward push で行う決定 4 と両立しない（保護下では PR 経由が強制される）。決定 4 を優先し不採用（決定 7）。

## 影響

- 新規: `.github/workflows/sync-main-to-develop.yml`
- `ci.yml`: `pull_request.branches` を `[main, develop]` に拡張（作業ブランチ → `develop`、hotfix → `main` の双方で CI を回すため）
- cron 4 本（`fetch-new-cards` / `fetch-gap-cards` / `fetch-event-db` / `fetch-new-songs`）: `actions/checkout` に `ref: main`、`create-pull-request` に `base: main` を明示。**default branch 変更の影響を受けないようにするため必須**。PR の宛先だけでなく、タグ採番が参照する `origin/main` の解決にも効く（`actions/checkout` は checkout したブランチ向けに `remote.origin.fetch` を設定するため、`develop` を checkout すると `git fetch origin main` で `origin/main` が更新されず、タグが誤ったコミットに付く恐れがある）
- `src/pages/releases/index.astro`: `git log` に `--no-merges` を追加
- `CLAUDE.md` / `.claude/skills/release/SKILL.md`: ブランチ戦略とリリース手順を改訂
- `deploy.yml` / `release.yml` / `.github/dependabot.yml`: 変更なし（Dependabot は default branch に追従する）
- GitHub 側: `develop` ブランチ作成、default branch 変更、既存 open PR 5 件（Dependabot）の base 付け替え
- **実施順序に制約がある**。cron 4 本に `base: main` / `ref: main` を入れる変更を `main` へ入れてから default branch を切り替える。逆順にすると、切替直後の毎時実行で画像 PR が `develop` に流れ、タグ採番も誤る。
- 詳細な設計と手順は `docs/superpowers/specs/2026-08-17-git-flow-migration-design.md` を参照。
