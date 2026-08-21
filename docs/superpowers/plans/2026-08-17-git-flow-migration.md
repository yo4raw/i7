# Git Flow 移行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **注記（最終レビュー後）**: 本プランはブランチ全体レビュー前の時点の記録であり、一部の記述はレビューの指摘で上書きされている（例: `deploy.yml` は変更しない、リリースのタグ対象を `origin/main` から再取得する、等）。本プラン自体は書き換えない。リリース手順・どのワークフローを変更したかについては `.claude/skills/release/SKILL.md` と `docs/superpowers/specs/2026-08-17-git-flow-migration-design.md` を正とする。

**Goal:** GitHub Flow から簡易 Git Flow へ移行し、`main` の不変条件を「常にリリース済み（本番にデプロイ済み）」にする。

**Architecture:** `develop` を統合ブランチ兼 GitHub default branch とし、人手の変更をそこに溜める。毎時のアセット自動取り込み（cron 4 本）は即時デプロイを維持するため `main` 直行の例外とし、新規ワークフロー `sync-main-to-develop.yml` が `main` の変更を `develop` へ back-merge する。これにより「`main` は常に `develop` の祖先」が保たれ、リリースは `develop` → `main` の fast-forward で行える（`main` にマージコミットが載らない）。

**Tech Stack:** GitHub Actions (YAML)、Astro 6（`src/pages/releases/index.astro` はビルド時に `git log` を実行）、Playwright（E2E）、Node.js 22

**Spec:** `docs/superpowers/specs/2026-08-17-git-flow-migration-design.md`

## Global Constraints

- Node.js は 22（`.nvmrc`）。ホスト環境で直接 npm scripts を実行する。Docker は使わない。
- **`main` の不変条件**: 常にリリース済み（本番にデプロイ済み）。かつ常に `develop` の祖先。
- **実施順序の制約**: cron 4 本に `ref: main` / `base: main` を入れる変更を `main` へマージしてから default branch を切り替える。逆順にすると、切替直後の毎時実行で画像 PR が `develop` へ流れ、タグ採番も誤る（Task 6 で厳守）。
- **`release/*` ブランチは作らない**（ADR 0052 決定 1）。`main` にブランチ保護は設定しない（同 決定 7）。
- `deploy.yml` / `release.yml` / `.github/dependabot.yml` は変更しない。
- リリースノート（`src/pages/releases/index.astro`）は git タグとコミット件名から自動生成される。**手で編集するファイルはない**。
- 作業ブランチ接頭辞は現行の慣習（`feat/` `fix/` `chore/` `docs/` `refactor/` `test/` `ci/` `hotfix/`）を踏襲する。
- ユーザー可視テキストでは「カード」ではなく「衣装」を使う（本プランの変更範囲にユーザー可視文言の追加はない）。
- Playwright E2E はローカルで dev サーバー（`npm run dev`, `http://localhost:4321/`）を先に起動してから実行する。CI では E2E は実行されない（CI は typecheck / coverage / build / oxlint のみ）。

**作業ブランチ**: `docs/git-flow-migration-design`（ADR 0052 と設計書が既にコミット済み。本プランの実装もこのブランチに積む）

---

### Task 1: リリースノートからマージコミットを除外する

back-merge によって `develop` にマージコミットが載るため、そのままではリリースノートに混入する。`git log` に `--no-merges` を付けて除外する。既存の "Merge pull request #NNN …" ノイズも同時に消える。

全 280 リリースに対して事前検証済み: 71 件で行が減り、コミットが 0 件になるリリースは 0 件。

**Files:**
- Create: `tests/releases.test.ts`
- Modify: `src/pages/releases/index.astro:38`

**Interfaces:**
- Consumes: なし
- Produces: なし（ページ内で完結。他タスクは本タスクの成果物に依存しない）

- [ ] **Step 1: dev サーバーを起動する**

E2E は dev サーバーを再利用する（本番ビルドは 5 分以上かかるため）。

```bash
npm run dev
```

`astro  v6.x.x ready in XXX ms` が出るまで待つ（約 1 秒）。バックグラウンド起動推奨。

- [ ] **Step 2: 失敗するテストを書く**

`tests/releases.test.ts` を新規作成:

```ts
import { test, expect } from '@playwright/test';

test.describe('リリース履歴ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/releases/');
  });

  test('リリースが1件以上表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'リリース履歴' })).toBeVisible();
    const subjects = await page.locator('ul.list-disc > li').allInnerTexts();
    expect(subjects.length).toBeGreaterThan(0);
  });

  test('マージコミットの件名がリリースノートに含まれない', async ({ page }) => {
    const subjects = await page.locator('ul.list-disc > li').allInnerTexts();
    expect(subjects.length).toBeGreaterThan(0);
    const merges = subjects.filter((s) =>
      /^Merge (pull request|branch|remote-tracking branch)\b/.test(s.trim()),
    );
    expect(merges).toEqual([]);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
npx playwright test tests/releases.test.ts
```

期待: `マージコミットの件名がリリースノートに含まれない` が FAIL。`merges` に `Merge pull request #375 from yo4raw/dependabot/...` 等が入り、`expect(merges).toEqual([])` が不一致になる。
（`リリースが1件以上表示される` は最初から PASS でよい。これは実装後にリリースが空にならないことを守るためのテスト。）

- [ ] **Step 4: 実装する**

`src/pages/releases/index.astro` の 38 行目:

```ts
      const logRaw = run(`git log --format=%H%x09%s ${range}`);
```

を次に変更する:

```ts
      const logRaw = run(`git log --no-merges --format=%H%x09%s ${range}`);
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
npx playwright test tests/releases.test.ts
```

期待: 2 件とも PASS。

- [ ] **Step 6: 画面を目視確認する**

`http://localhost:4321/releases/` を開き、スクリーンショットを `tmp/` に保存してユーザーに提示する。確認点:

- 「Merge pull request …」の行が消えている
- どのリリースも「差分コミットなし」になっていない
- タグ名・日付の表示は従来どおり

- [ ] **Step 7: コミットする**

```bash
git add tests/releases.test.ts src/pages/releases/index.astro
git commit -m "fix(releases): リリースノートからマージコミットを除外する

Git Flow 移行で main から develop への back-merge が発生するため、
マージコミットの件名がリリースノートに混入する。--no-merges で除外する。
既存の \"Merge pull request #NNN\" ノイズも同時に消える。"
```

---

### Task 2: CI を develop 宛て PR でも実行する

作業ブランチ → `develop`、hotfix → `main` の双方で CI を回す必要がある。

**Files:**
- Modify: `.github/workflows/ci.yml:5`

**Interfaces:**
- Consumes: なし
- Produces: `develop` 宛て PR で CI（typecheck+coverage / build / oxlint）が走る状態

- [ ] **Step 1: トリガーを拡張する**

`.github/workflows/ci.yml` の 3〜8 行目:

```yaml
on:
  pull_request:
    branches: [main]
    paths-ignore:
      - 'public/assets/cards/**'
      - 'public/assets/th_cards/**'
```

を次に変更する（`branches` の行だけ変える。`paths-ignore` は据え置き）:

```yaml
on:
  pull_request:
    branches: [main, develop]
    paths-ignore:
      - 'public/assets/cards/**'
      - 'public/assets/th_cards/**'
```

- [ ] **Step 2: YAML の妥当性を確認する**

```bash
ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "OK"'
```

期待: `OK`

- [ ] **Step 3: 差分を目視確認する**

```bash
git diff .github/workflows/ci.yml
```

期待: 変更は `branches: [main]` → `branches: [main, develop]` の 1 行のみ。`quality` / `build` / `lint` の 3 ジョブは無変更。

- [ ] **Step 4: コミットする**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: develop 宛ての PR でも CI を実行する"
```

---

### Task 3: cron 4 本を main 固定にする

default branch を `develop` に変えると、この 4 本は黙って `develop` を向く。理由は 2 つあり、どちらも実害がある:

1. `peter-evans/create-pull-request` の `base` 既定値は「checkout されたブランチ」→ 画像 PR の宛先が `develop` になる
2. `actions/checkout` は checkout したブランチ向けに `remote.origin.fetch` を設定する → `develop` を checkout すると `git fetch origin main` で `refs/remotes/origin/main` が更新されず、タグ採番の `git rev-parse origin/main` が古い/誤ったコミットを指しうる

`ref: main`（checkout）と `base: main`（create-pull-request）を 4 本すべてに明示して塞ぐ。

**Files:**
- Modify: `.github/workflows/fetch-new-cards.yml:16`, `.github/workflows/fetch-gap-cards.yml:16`, `.github/workflows/fetch-event-db.yml:16`, `.github/workflows/fetch-new-songs.yml:16`（checkout）
- Modify: `.github/workflows/fetch-new-cards.yml:153`, `.github/workflows/fetch-gap-cards.yml:108`, `.github/workflows/fetch-event-db.yml:56`, `.github/workflows/fetch-new-songs.yml:50`（create-pull-request）

**Interfaces:**
- Consumes: なし
- Produces: default branch を切り替えても cron が `main` を向き続ける状態。Task 6 の手順 3 はこのタスクの完了が前提。

- [ ] **Step 1: 変更前の状態を記録する**

```bash
grep -n "actions/checkout@v7" .github/workflows/fetch-*.yml
grep -n "create-pull-request@v8" .github/workflows/fetch-*.yml
```

期待: 4 本それぞれ `checkout@v7` が 16 行目に 1 箇所、`create-pull-request@v8` が 1 箇所。いずれにも `ref:` / `base:` はまだ無い。

- [ ] **Step 2: 4 本に ref / base を追加する**

4 本とも該当箇所の形が同一なので、スクリプトで一括適用する。件数チェック付きなので、想定外の形になっていれば止まる。

```bash
python3 - <<'PY'
import pathlib, sys

OLD_CHECKOUT = "      - uses: actions/checkout@v7\n"
NEW_CHECKOUT = """      - uses: actions/checkout@v7
        with:
          # default branch が develop になっても main を見続ける。
          # PR の base だけでなく、タグ採番が参照する origin/main の解決にも効く
          # （checkout は checkout したブランチ向けに remote.origin.fetch を設定するため）。
          ref: main
"""

OLD_CPR = """        uses: peter-evans/create-pull-request@v8
        with:
"""
NEW_CPR = """        uses: peter-evans/create-pull-request@v8
        with:
          # base の既定値は「checkout されたブランチ」。default branch 変更の影響を受けないよう明示する
          base: main
"""

for name in ['fetch-new-cards', 'fetch-gap-cards', 'fetch-event-db', 'fetch-new-songs']:
    p = pathlib.Path(f'.github/workflows/{name}.yml')
    text = p.read_text()
    for label, old in (('checkout', OLD_CHECKOUT), ('create-pull-request', OLD_CPR)):
        if text.count(old) != 1:
            sys.exit(f'FAIL: {name}.yml の {label} が {text.count(old)} 箇所 (期待 1)')
    text = text.replace(OLD_CHECKOUT, NEW_CHECKOUT).replace(OLD_CPR, NEW_CPR)
    p.write_text(text)
    print(f'patched {name}.yml')
PY
```

期待: `patched …` が 4 行出る。

- [ ] **Step 3: YAML の妥当性を確認する**

```bash
ruby -ryaml -e 'Dir[".github/workflows/*.yml"].sort.each { |f| YAML.load_file(f); puts "OK #{f}" }'
```

期待: 7 ファイルすべて `OK`。

- [ ] **Step 4: 意図した値が入ったことを確認する**

```bash
grep -c "ref: main" .github/workflows/fetch-*.yml
grep -c "base: main" .github/workflows/fetch-*.yml
```

期待: 4 ファイルとも `ref: main` が 1、`base: main` が 1。

- [ ] **Step 5: 差分を目視確認する**

```bash
git diff .github/workflows/fetch-new-cards.yml
```

期待: checkout に `with: ref: main`、create-pull-request の `with:` 直下に `base: main` が入るだけ。既存の `add-paths` / `commit-message` / `branch` / `title` / `body` / auto-merge / タグ採番ステップは無変更。

- [ ] **Step 6: コミットする**

```bash
git add .github/workflows/fetch-new-cards.yml .github/workflows/fetch-gap-cards.yml \
        .github/workflows/fetch-event-db.yml .github/workflows/fetch-new-songs.yml
git commit -m "ci: アセット取り込み 4 本を main 固定にする

default branch を develop に切り替えても main を向き続けるよう、
checkout に ref: main、create-pull-request に base: main を明示する。
PR の宛先だけでなく、タグ採番が参照する origin/main の解決にも必要。"
```

---

### Task 4: main → develop の自動 back-merge ワークフローを追加する

不変条件「`main` は常に `develop` の祖先」を維持する唯一の仕掛け。これがないと、cron が `main` に入れたアセットや hotfix が `develop` に取り込まれず、次のリリースの fast-forward が失敗する。

**Files:**
- Create: `.github/workflows/sync-main-to-develop.yml`

**Interfaces:**
- Consumes: `develop` ブランチが存在すること（Task 6 手順 1 で作成する）
- Produces: `main` への push 後、`develop` が `main` を含む状態

- [ ] **Step 1: ワークフローを作成する**

`.github/workflows/sync-main-to-develop.yml` を新規作成:

```yaml
name: Sync main to develop

# main に入った変更（アセット自動取り込み / hotfix / リリース）を develop へ取り込み、
# 「main は常に develop の祖先」という不変条件を保つ。
# これによりリリースを develop -> main の fast-forward で行える（main にマージコミットが載らない）。
on:
  push:
    branches: [main]

permissions:
  contents: write

concurrency:
  group: sync-main-to-develop
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: develop
          fetch-depth: 0

      - name: Merge main into develop
        run: |
          set -e -o pipefail
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git fetch origin main
          if git merge-base --is-ancestor origin/main HEAD; then
            echo "develop already contains main; nothing to do"
            exit 0
          fi
          git merge --no-edit origin/main
          git push origin HEAD:develop
```

設計上の判断（変更しないこと）:

- **衝突時はジョブを fail させる**。自動リトライも自動 PR 作成も行わない。取り込み対象は主に画像ファイルの追加で衝突はまず起きず、起きた場合は静かに壊れるよりはっきり落ちる方がよい。
- **push は `GITHUB_TOKEN` で行う**。`develop` への push で発火させたいワークフローは存在しない（CI は `pull_request` トリガーのみ）ため、`GITHUB_TOKEN` push によるトリガー抑止は問題にならない。
- **タグ push では発火しない**（`branches` 指定のため）。リリース直後に無駄な空マージが走らない。

- [ ] **Step 2: YAML の妥当性を確認する**

```bash
ruby -ryaml -e 'YAML.load_file(".github/workflows/sync-main-to-develop.yml"); puts "OK"'
```

期待: `OK`

- [ ] **Step 3: マージ判定のロジックをローカルで確認する**

ワークフロー本体はローカルで実行できないが、中核の分岐（`git merge-base --is-ancestor`）は手元の git で確かめられる。

```bash
# main は main 自身の祖先 → 真（= 「取り込み済みなので何もしない」に入る）
git merge-base --is-ancestor origin/main origin/main && echo "ancestor: true (skip する側)"
```

期待: `ancestor: true (skip する側)` が出る。リリース直後（`develop` == `main`）にこの分岐へ入り、空マージを作らないことを意味する。

- [ ] **Step 4: コミットする**

```bash
git add .github/workflows/sync-main-to-develop.yml
git commit -m "ci: main を develop へ自動 back-merge するワークフローを追加

「main は常に develop の祖先」を保ち、リリースを fast-forward で
行えるようにする。衝突時はジョブを fail させ手動解決とする。"
```

---

### Task 5: ドキュメントをブランチ戦略に合わせて改訂する

`CLAUDE.md` と `release` スキルは現行の GitHub Flow 前提で書かれている。移行後の手順に合わせる。

あわせて、`CLAUDE.md` Workflow の手順 5「`git commit` する前に必ずリリースノートを更新する」を削除する。リリースノートは git タグとコミット件名から自動生成され、手で編集するファイルは存在しない（`.claude/skills/release/SKILL.md` に明記されている）。この記述は現状と矛盾しており、Workflow 節を触る本タスクで併せて直す。

**Files:**
- Modify: `CLAUDE.md`（`## Workflow` 節、および `### Deployment` の直前に新設する `### ブランチ戦略` 節）
- Modify: `.claude/skills/release/SKILL.md`（`## 通常のリリース` 節）

**Interfaces:**
- Consumes: Task 1〜4 で決まった運用（`develop` 統合 / cron は main 直行 / リリースは fast-forward）
- Produces: なし

- [ ] **Step 1: CLAUDE.md にブランチ戦略の節を追加する**

`CLAUDE.md` の `### Deployment` 行の直前に、次の節を挿入する:

```markdown
### ブランチ戦略（Git Flow / ADR 0052）

`main` の不変条件は **「常にリリース済み（本番にデプロイ済み）」**。人手の変更は `develop` に溜める。

| ブランチ | 役割 | 派生元 | マージ先 | マージ方式 |
|---------|------|--------|---------|-----------|
| `main` | 常にリリース済み | — | — | — |
| `develop` | 統合ブランチ（GitHub default） | `main` | `main`（リリース時） | fast-forward |
| `feat/` `fix/` `chore/` `docs/` `refactor/` `test/` `ci/` | 人手の作業 | `develop` | `develop` | squash |
| `hotfix/` | 本番の緊急修正 | `main` | `main` | squash |
| `auto/` | cron の自動取り込み | `main` | `main` | squash（自動） |

- **通常の作業は `develop` から切って `develop` に PR を出す**。マージしても本番には出ない
- **毎時のアセット自動取り込み（cron 4 本）は `main` 直行の例外**。マージ直後に自動採番タグが打たれ即デプロイされるため、`main` の不変条件は崩れない。新カード画像が 1 時間以内に本番へ出る即時性を維持するための例外
- **`main` への push は `sync-main-to-develop.yml` が `develop` へ自動 back-merge する**。これにより「`main` は常に `develop` の祖先」が保たれ、リリースが fast-forward で通る
- **`release/*` ブランチは作らない**。`main` にブランチ保護は設定していない
- リリース手順は `release` スキル（`.claude/skills/release/SKILL.md`）を参照
```

- [ ] **Step 2: CLAUDE.md の Workflow 節を差し替える**

`## Workflow` 節の手順 5〜7 を次に差し替える（手順 1〜4 は変更しない）:

```markdown
5. ユーザーの確認が取れたら **`develop` から** 対応内容に応じたブランチを作成して `git commit` → `git push` し、**base を `develop` にして** PR を作成する。CI の結果を待たずリリースまで行う。リリースに伴う workflow を待つ必要はない
6. リリースは `develop` を `main` へ fast-forward してタグを打つ（`release` スキル参照）。本番の緊急修正だけは `main` から `hotfix/` を切って `main` に PR を出す
7. **リリース（タグ push）ごとに、リリース告知ツイートを投稿する** — `release-tweet` スキルを使い、最新リリースタグの変更点から告知文を作成して X へ投稿する。`.env` に `X_ID`/`X_PASS` があれば標準スタイル（案2相当）の告知文1本を確認なしで自動投稿する（`.env` が無い場合は下書き提示まで）。詳細は `.claude/skills/release-tweet/SKILL.md` を参照
```

旧手順 5（「`git commit` する前に必ずリリースノートを更新する」）は削除する。リリースノートは自動生成であり手で更新するファイルはないため。

- [ ] **Step 3: release スキルにリリース手順を反映する**

`.claude/skills/release/SKILL.md` の `## 通常のリリース` 節の冒頭コードブロック:

````markdown
```bash
git tag v1.x.x && git push origin v1.x.x
```
````

を次に差し替える:

````markdown
```bash
git fetch origin
git push origin develop:main                            # fast-forward（main は常に develop の祖先）
git tag v1.x.x origin/main && git push origin v1.x.x
```

`develop` を `main` へ **fast-forward** してからタグを打つ。PR を経由しないのは、`main` にマージコミットを残さずリリースノートを綺麗に保つため（内容は `develop` 上の各 PR で確認済みという前提）。**squash merge は絶対に使わない** — `develop` の全コミットが 1 つに潰れ、リリースノートが 1 行になる。

fast-forward が拒否された場合は、`main` に入った自動取り込みが `develop` へ back-merge されるのを待って再実行する（`sync-main-to-develop.yml` が自動で行う）。非破壊な失敗なので安全側に倒れる。

本番の緊急修正は `main` から `hotfix/` を切り、`main` に PR を出してマージしてから手動でタグを打つ。
````

- [ ] **Step 4: 記述の整合を確認する**

```bash
grep -n "develop" CLAUDE.md .claude/skills/release/SKILL.md
grep -n "リリースノートを更新" CLAUDE.md
```

期待: 前者で新設節・Workflow 手順・release スキルに `develop` の記述が出る。後者は**何も出ない**（旧手順 5 が消えている）。

- [ ] **Step 5: コミットする**

```bash
git add CLAUDE.md .claude/skills/release/SKILL.md
git commit -m "docs: ブランチ戦略と リリース手順を Git Flow に更新 (ADR 0052)

CLAUDE.md にブランチ戦略の節を追加し、Workflow の作業手順を develop 起点へ。
release スキルのリリース手順を develop -> main の fast-forward + タグに変更。
あわせて、自動生成であるリリースノートを「手で更新する」とした誤記を削除する。"
```

---

### Task 6: 移行を実施して動作を確認する

ここまでの変更を `main` に入れ、GitHub 側の設定を切り替える。**順序に依存関係があるため、この順で行うこと。**

**Files:**
- 変更なし（git / GitHub の操作のみ）

**Interfaces:**
- Consumes: Task 1〜5 のコミット（作業ブランチ `docs/git-flow-migration-design` 上）
- Produces: Git Flow に移行済みのリポジトリ

- [ ] **Step 1: develop ブランチを作成する**

`sync-main-to-develop.yml` は `develop` を checkout するため、ワークフローが `main` に入る前に `develop` を存在させる。

```bash
git fetch origin
git push origin origin/main:refs/heads/develop
git fetch origin
git rev-parse origin/develop origin/main
```

期待: `origin/develop` と `origin/main` が同一の SHA を指す。

- [ ] **Step 2: 変更一式を main へ PR に出す**

この時点では default branch はまだ `main` なので、base は `main` のままでよい。

```bash
git push -u origin docs/git-flow-migration-design
PR_URL=$(gh pr create --base main \
  --title "ci: GitHub Flow から簡易 Git Flow へ移行する (ADR 0052)" \
  --body "$(cat <<'EOF'
## 概要

`main` の不変条件を「常にリリース済み（本番にデプロイ済み）」にするため、簡易 Git Flow（`release/*` なし）へ移行する。設計は `docs/superpowers/specs/2026-08-17-git-flow-migration-design.md`、意思決定は ADR 0052 を参照。

## 変更

- `sync-main-to-develop.yml` を新設。`main` への push を `develop` へ自動 back-merge し、「`main` は常に `develop` の祖先」を保つ。これによりリリースを fast-forward で行える
- cron 4 本に `ref: main` / `base: main` を明示。default branch 変更後も `main` を向き続ける（PR の宛先とタグ採番の両方に必要）
- `ci.yml` を `develop` 宛て PR でも実行するよう拡張
- リリースノート生成に `--no-merges` を追加。back-merge のマージコミット混入を防ぐ（全 280 リリースで検証済み、空になるリリースは 0 件）
- `CLAUDE.md` / `release` スキルをブランチ戦略に合わせて改訂

## マージ後の作業

1. default branch を `develop` に変更する
2. 既存 open PR（Dependabot）の base を `develop` に付け替える

**順序厳守**: この PR が `main` に入ってから default branch を切り替える。逆順だと切替直後の毎時実行で画像 PR が `develop` へ流れ、タグ採番も誤る。
EOF
)")
PR_NUM="${PR_URL##*/}"
echo "PR #$PR_NUM: $PR_URL"
```

- [ ] **Step 3: CI の通過を確認してマージする**

```bash
gh pr checks "$PR_NUM" --watch --interval 15
gh pr merge "$PR_NUM" --squash --delete-branch
```

（別セッションで実行する場合は `PR_NUM=$(gh pr list --head docs/git-flow-migration-design --json number -q '.[0].number')` で取り直す。）

期待: `Type check & unit tests (coverage gate)` / `Production build` / `Lint (oxlint)` の 3 つが pass。

- [ ] **Step 4: sync ワークフローの初回実行を確認する**

Step 3 のマージで `main` に push が入り、`sync-main-to-develop.yml` が初めて動く。この時点では `develop` == 旧 `main` なので fast-forward で取り込まれる。

```bash
gh run list --workflow=sync-main-to-develop.yml --limit 3 \
  --json conclusion,createdAt -q '.[] | "\(.createdAt) \(.conclusion)"'
git fetch origin
git merge-base --is-ancestor origin/main origin/develop && echo "OK: main は develop の祖先"
```

期待: 実行が `success`。`OK: main は develop の祖先` が出る。

**ここで失敗したら先へ進まない。** default branch を切り替える前に不変条件が成立している必要がある。

- [ ] **Step 5: default branch を develop に変更する**

```bash
gh api --method PATCH repos/:owner/:repo -f default_branch=develop
gh repo view --json defaultBranchRef -q .defaultBranchRef.name
```

期待: `develop`

- [ ] **Step 6: 既存の open PR の base を develop に付け替える**

```bash
gh pr list --state open --json number,baseRefName,title \
  -q '.[] | select(.baseRefName=="main") | "\(.number) \(.title)"'
```

出力を確認し、`hotfix/*` や `auto/*` のように **意図して `main` を向いている PR が混ざっていないこと**を確かめてから、まとめて付け替える:

```bash
for n in $(gh pr list --state open --json number,baseRefName,headRefName \
    -q '.[] | select(.baseRefName=="main") | select(.headRefName | startswith("hotfix/") or startswith("auto/") | not) | .number'); do
  gh pr edit "$n" --base develop && echo "retargeted #$n"
done
```

（設計時点では Dependabot の 5 件が `main` を向いていた。移行までにクローズ／マージされている可能性があるため、実行時の一覧を正とする。）

確認:

```bash
gh pr list --state open --json number,baseRefName -q '.[] | "\(.number) -> \(.baseRefName)"'
```

期待: すべて `develop`。

- [ ] **Step 7: cron が main を向いていることを確認する**

次の毎時実行（毎時 00 分 UTC）、または手動実行で確認する。

```bash
gh workflow run fetch-event-db.yml
RUN_ID=$(gh run list --workflow=fetch-event-db.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status --interval 15
gh run view "$RUN_ID" --log | grep -E "ref: main|refs/heads/main|Switched to"
```

新しいアセットが見つかった実行では、作成された PR の base を確認する:

```bash
gh pr list --state all --limit 5 --json number,baseRefName,headRefName \
  -q '.[] | select(.headRefName | startswith("auto/")) | "\(.number) \(.headRefName) -> \(.baseRefName)"'
```

期待: `auto/*` の PR がすべて `main` を向いている。

- [ ] **Step 8: 自動採番タグとデプロイの復旧を確認する**

新アセットを取り込んだ最初の cron 実行で、ADR 0051 の修正（`gh api` によるタグ作成）が実地検証される。

```bash
git fetch --tags origin
git tag --sort=-creatordate | head -3
gh run list --workflow=deploy.yml --limit 2 --json event,conclusion,createdAt \
  -q '.[] | "\(.createdAt) [\(.event)] \(.conclusion)"'
```

期待: 新しいタグが打たれ、その直後に `deploy.yml` が `push` イベントで走っている。

**タグは打たれたのに `deploy.yml` が走っていない場合**、`RELEASE_PAT` の失効を疑う。ADR 0051 の修正後は `gh api` が非ゼロで失敗するため、cron のジョブ自体が fail しているはず。失敗した実行のログで確認する:

```bash
FAILED_ID=$(gh run list --workflow=fetch-new-cards.yml --limit 20 \
  --json databaseId,conclusion -q '[.[] | select(.conclusion=="failure")][0].databaseId')
gh run view "$FAILED_ID" --log-failed | tail -30
```

- [ ] **Step 9: 移行後の状態を記録する**

```bash
git fetch origin
echo "default: $(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"
echo "main:    $(git rev-parse --short origin/main)"
echo "develop: $(git rev-parse --short origin/develop)"
git merge-base --is-ancestor origin/main origin/develop \
  && echo "不変条件 OK: main は develop の祖先" \
  || echo "不変条件 NG: 要調査"
```

期待: default が `develop`、不変条件 OK。

---

## 完了条件

- `develop` が GitHub の default branch になっている
- `git merge-base --is-ancestor origin/main origin/develop` が真
- `auto/*` の PR が `main` を向いている
- `develop` 宛ての PR で CI 3 ジョブが走る
- `/releases/` にマージコミットの件名が出ておらず、空のリリースもない
- `CLAUDE.md` / `release` スキルが Git Flow の手順を記述している
