# over-engineering 監査に基づく削減 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** over-engineering 監査で挙げた削減候補のうち、既存 ADR と衝突しないものを実施し、依存 4 つと重複実装を除く。

**Architecture:** 既存の挙動を変えない整理が中心。標準ライブラリ・プラットフォーム機能へ置き換えられるものを置き換え、同じロジックの複数実装を 1 本に寄せる。新規ロジックは 1 つだけで、それは残り時間フォーマッタの統合版。

**Tech Stack:** Astro 7 / Svelte 5 (runes) / TypeScript / Vitest / Playwright / oxlint / Node 22

**Spec:** [docs/superpowers/specs/2026-09-02-ponytail-audit-cleanup-design.md](../specs/2026-09-02-ponytail-audit-cleanup-design.md)

## Global Constraints

- **カバレッジ**: `src/lib/**` の 4 指標（statements / branches / functions / lines）すべてが 95% 以上。`npm run coverage` が exit≠0 なら未完了。
- **Node 下限**: 22.18.0（型ストリップが既定で有効になった版）。`.nvmrc` と CI の `node-version: 22` は変更しない。
- **コミット件名**: `<gitmoji> <日本語の説明>`（ADR 0066）。絵文字は Unicode 文字、半角スペース 1 個で区切る。PR タイトルも同じ規約。
- **ブランチ**: すべて `develop` から切り、base を `develop` にして PR を出す。
- **用語**: ユーザー可視テキストは「カード」ではなく「衣装」。内部識別子は `card` のまま。
- **配色**: `indigo` を `src/` に増やさない。`dark:` バリアントを付けない。
- **ADR**: 本計画の意思決定は [ADR 0069](../../adr/0069-ponytail-audit-cleanup.md) に記録済み。Task 14 のみ ADR 0048 への追記を伴う。

## PR 間の依存

**PR 2 は PR 1 がマージされてから着手する。** Task 8（`parseCsv` の統合）は Task 3 が入れる Node の型ストリップを前提に、`.ts` スクリプトから `src/` の `.ts` を import する。PR 1 が `develop` に入る前に PR 2 のブランチを切ると、Task 8 の検証が通らない。

PR 3 と PR 4 は PR 1・PR 2 と独立しており、順序の制約はない。互いにも独立している。

## File Structure

| ファイル | 責務 | 変更 |
|---------|------|------|
| `.github/workflows/fetch-gap-cards.yml` | カード ID ギャップの補完 | 削除（`fetch-new-cards.yml` が包含） |
| `package.json` | スクリプトと依存 | `serve` / `tsx` / `husky` / `lint-staged` を除去 |
| `playwright.config.ts` | E2E 設定 | `webServer.command` |
| `.husky/pre-commit` | コミット前フック | oxlint の全体実行へ |
| `scripts/lib/util.mjs` | scripts 共通の並列制御・PNG 判定・リトライ GET | **新規** |
| `scripts/*.mjs` | 画像取得・変換 CLI | 引数パース・重複関数・sleep を差し替え |
| `scripts/extract-point-calc-golden.ts` | golden 抽出 | `.mjs` から改名し `parseCsv` を共有 |
| `src/lib/data/eventPeriod.ts` | イベント期間の判定・表示 | `formatDuration` を追加、未使用 export を整理 |
| `src/lib/stores/countStore.svelte.ts` | ID → 所持数ストアの実体 | **新規** |
| `src/lib/stores/*.svelte.ts` | 所持数ストアの入口 | factory の呼び出しだけにする |
| `src/lib/cardListData.ts` | 衣装一覧の型 | 削除（`Card` へ統合） |
| `src/components/ui/ModalDialog.svelte` | 確認・入力ダイアログ | ネイティブ `<dialog>` へ |

---

## PR 1: ワークフローとツールチェーン

ブランチ: `chore/toolchain-slim`

### Task 1: `fetch-gap-cards.yml` を削除する

`fetch-new-cards.yml` のギャップ判定は `cards ∩ th` の補集合を取るため、`fetch-gap-cards.yml` の対象（`cards` の欠落）を完全に包含する。差は ID 1 のみで、その ID はソース側に存在しない。

**Files:**
- Delete: `.github/workflows/fetch-gap-cards.yml`
- Modify: `CLAUDE.md`（ワークフロー表から該当行を削除）

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 包含関係を実地で確認する**

```bash
cd /Users/yaoko/git/i7
ls public/assets/cards/*.webp | xargs -n1 basename | sed 's/\.webp$//' | sort -n > /tmp/c.txt
ls public/assets/th_cards/*.webp | xargs -n1 basename | sed 's/\.webp$//' | sort -n > /tmp/t.txt
# gap-cards の対象: 1..MAX のうち cards に無い ID
MAX=$(tail -1 /tmp/c.txt); seq 1 "$MAX" | sort > /tmp/full.txt
comm -23 /tmp/full.txt <(sort /tmp/c.txt) | sort -n > /tmp/gap_target.txt
# new-cards の対象: MIN..MAX のうち cards∩th に無い ID
comm -12 <(sort /tmp/c.txt) <(sort /tmp/t.txt) | sort > /tmp/complete.txt
MIN=$(head -1 <(sort -n /tmp/c.txt /tmp/t.txt)); seq "$MIN" "$MAX" | sort > /tmp/range.txt
comm -23 /tmp/range.txt /tmp/complete.txt | sort -n > /tmp/new_target.txt
echo "gap のみが拾う ID:"; comm -23 <(sort /tmp/gap_target.txt) <(sort /tmp/new_target.txt)
```

Expected: 出力は `1` のみ（または空）。それ以外の ID が出たら削除してはならず、計画を見直す。

- [ ] **Step 2: ワークフローを削除する**

```bash
git rm .github/workflows/fetch-gap-cards.yml
```

- [ ] **Step 3: CLAUDE.md のワークフロー表から行を消す**

`CLAUDE.md` の「Card Images」節にあるワークフロー表から、次の行を削除する。

```
| `fetch-gap-cards.yml` | 毎時 00 分 (UTC) | カード ID ギャップの補完。PNG 取得後 WebP へ変換 |
```

同表の `fetch-new-cards.yml` の説明を、ギャップ埋めを担うことが読み取れるよう次に置き換える。

```
| `fetch-new-cards.yml` | 毎時 00 分 (UTC) | 新規カード画像（フルサイズ + サムネイル）の前方スキャンと、既存 ID 範囲のギャップ埋め。PNG 取得後 WebP へ変換 |
```

- [ ] **Step 4: 作業ツリーの未追跡ディレクトリを掃除する**

`ouj/` は中身が空のネストした `.git` のみで、リポジトリと無関係。コミットは発生しない。

```bash
rm -rf ouj
git status --short
```

Expected: `ouj/` が消え、`.github/workflows/fetch-gap-cards.yml` の削除と `CLAUDE.md` の変更だけが残る。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "🔥 fetch-gap-cards.yml を削除する"
```

---

### Task 2: `serve` を `astro preview` へ置き換える

`output: 'static'` かつ adapter なしのため、Astro の組み込みプレビューサーバーが `dist/` を配信する。

**Files:**
- Modify: `package.json:8`（`preview` スクリプト）、依存から `serve` を除去
- Modify: `playwright.config.ts:22`
- Modify: `CLAUDE.md:9`

**Interfaces:**
- Consumes: なし
- Produces: `npm run preview` が 4321 番で `dist/` を配信する（`playwright.config.ts` の `webServer.url` が前提にする）

- [ ] **Step 1: `preview` スクリプトを差し替える**

`package.json` の `scripts.preview` を次にする。

```json
"preview": "astro build && astro preview --port 4321",
```

- [ ] **Step 2: `serve` を依存から外す**

```bash
npm uninstall serve
```

- [ ] **Step 3: ビルドしてプレビューが 4321 で応答することを確認する**

`astro build` は 3,200 ページ超を生成するため 5〜6 分かかる。タイムアウトを 7 分以上確保すること。

```bash
npm run preview &
sleep 400
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/cards/100/
```

Expected: どちらも `200`。

- [ ] **Step 4: E2E を全件流す**

プレビューサーバーを起動したまま実行する（`reuseExistingServer: true` のためビルドは再実行されない）。

```bash
npx playwright test
```

Expected: 既存と同じ結果（監査時点の基準は 56 passed / 2 skipped）。失敗が出た場合、`astro preview` と `serve` の trailing slash の扱いの差が原因かを最初に疑う。差が原因なら `astro.config.mjs` の `trailingSlash` を明示する。

- [ ] **Step 5: CLAUDE.md の記述を実態に合わせる**

`CLAUDE.md:9` を次に置き換える。どちらも Cloudflare Workers Static Assets そのものではないため、「本番配信を再現する」という表現をやめる。

```
- `npm run preview` は build 込みでビルド成果物をローカル配信する（`astro preview`）
```

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json playwright.config.ts CLAUDE.md
git commit -m "🔥 serve を astro preview へ置き換える"
```

---

### Task 3: `tsx` を Node の型ストリップへ置き換える

型ストリップは拡張子なしの相対 import を解決せず、JSON の既定 import に import attributes を要求する。該当は依存グラフ全体で 2 箇所。

**Files:**
- Modify: `src/lib/data/fetchCardsJson.ts:2`
- Modify: `src/lib/data/fetchSongsJson.ts:2`
- Modify: `package.json`（`extract-fixtures` スクリプト、依存から `tsx` を除去）
- Modify: `CLAUDE.md:11`

**Interfaces:**
- Consumes: なし
- Produces: `scripts/` の `.ts` ファイルが `node <path>.ts` で直接実行できる（Task 8 が依存する）

- [ ] **Step 1: 拡張子なし import に拡張子を付ける**

`src/lib/data/fetchCardsJson.ts:2` を次にする。同ディレクトリの `from './gviz.ts'` に実績がある形。

```ts
import { CHARACTER_GROUPS } from '../constants.ts';
```

- [ ] **Step 2: JSON import に import attributes を付ける**

`src/lib/data/fetchSongsJson.ts:2` を次にする。

```ts
import eventSongsConfig from '../../data/event-songs.json' with { type: 'json' };
```

- [ ] **Step 3: Node で直接実行できることを確認する**

```bash
node --version
node scripts/extract-test-fixtures.ts
```

Expected: Node は 22.18.0 以上。スクリプトが `ERR_MODULE_NOT_FOUND` を出さずに完走し、`tests/fixtures/` の JSON が更新される。ネットワーク経由で Google Sheets を叩くため、失敗した場合はまず疎通を疑う。

- [ ] **Step 4: フィクスチャに差分が出ていないことを確認する**

```bash
git status --short tests/fixtures/
```

Expected: 差分なし、またはスプレッドシート側の更新に由来する差分のみ。ロジック起因の差分（キー名が変わる等）が出たら import の書き換えを見直す。

- [ ] **Step 5: スクリプトと依存を差し替える**

`package.json` の `scripts.extract-fixtures` を次にする。

```json
"extract-fixtures": "node scripts/extract-test-fixtures.ts",
```

```bash
npm uninstall tsx
```

- [ ] **Step 6: 型チェックとビルドが通ることを確認する**

Vite と Astro が拡張子付き import と import attributes を解決できることの確認。

```bash
npm run typecheck
npm run build
```

Expected: どちらも成功。

- [ ] **Step 7: CLAUDE.md に Node の下限を記す**

`CLAUDE.md:11` を次に置き換える。

```
- Node.js は `.nvmrc` で 22 を指定。**22.18.0 以上**が必要（`scripts/*.ts` を型ストリップで直接実行するため）。ホスト環境で用意すること（`nvm use` 等）
```

- [ ] **Step 8: コミット**

```bash
git add src/lib/data/fetchCardsJson.ts src/lib/data/fetchSongsJson.ts package.json package-lock.json CLAUDE.md
git commit -m "🔥 tsx を Node の型ストリップへ置き換える"
```

---

### Task 4: `husky` と `lint-staged` を除去する

oxlint は Rust 製で全体走査も十分速く、変更ファイルだけを渡す仕組みを別依存で持つ必要がない。フック配置は git の `core.hooksPath` が標準で持つ。

**Files:**
- Modify: `package.json`（`prepare` スクリプト、`lint-staged` 設定ブロック、依存 2 つ）
- Modify: `.husky/pre-commit`

**Interfaces:**
- Consumes: なし
- Produces: `.husky/commit-msg`（ADR 0066 の gitmoji 検証）は現状のまま動き続ける

- [ ] **Step 1: `prepare` を `core.hooksPath` の設定に差し替える**

`package.json` の `scripts.prepare` を次にする。

```json
"prepare": "git config core.hooksPath .husky",
```

- [ ] **Step 2: `lint-staged` 設定ブロックを削除する**

`package.json` の末尾にある次のブロックごと削除する。

```json
  "lint-staged": {
    "*.{ts,js,mjs,cjs,astro,svelte}": "oxlint"
  }
```

- [ ] **Step 3: pre-commit フックを oxlint の全体実行にする**

`.husky/pre-commit` の中身を次の 1 行にする。

```sh
npx oxlint
```

- [ ] **Step 4: 依存を外し、フックパスを設定する**

```bash
npm uninstall husky lint-staged
npm run prepare
git config --get core.hooksPath
```

Expected: `.husky` と表示される。

- [ ] **Step 5: フックが両方とも発火することを確認する**

規約違反の件名を弾くこと（ADR 0066）と、pre-commit が走ることの両方を見る。

```bash
echo "# hook check" >> README.md
git add README.md
git commit -m "bad message without gitmoji"
```

Expected: `scripts/check-commit-msg.mjs` がコミットを中断する。続けて正しい件名で通ることを確認したうえで、確認用の変更は破棄する。

```bash
git checkout README.md
git reset
```

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json .husky/pre-commit
git commit -m "🔥 husky と lint-staged を除去する"
```

- [ ] **Step 7: PR を出す**

```bash
git push -u origin chore/toolchain-slim
gh pr create --base develop --title "🔥 ワークフローとツールチェーンを整理する" --body "$(cat <<'BODY'
## Summary

ADR 0069 に基づく削減の 1/4。

- `fetch-gap-cards.yml` を削除（`fetch-new-cards.yml` が対象を包含）
- `serve` → `astro preview`
- `tsx` → Node の型ストリップ
- `husky` / `lint-staged` → `core.hooksPath` + oxlint 全体実行

依存 4 つを除去した。

## Test

- `npm run build` 成功
- `npx playwright test` 全件
- `node scripts/extract-test-fixtures.ts` 完走
- commit-msg / pre-commit フックの発火確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## PR 2: scripts の重複統合

ブランチ: `refactor/scripts-dedupe`

`scripts/` はカバレッジの分母（`src/lib/**`）の外にあるため、単体テストは増やさない。検証は各スクリプトの `--dry-run` 実行で行う。

### Task 5: 共通ユーティリティを新設して重複を寄せる

`runPool` は `refetch-card-images.mjs` と `verify-card-images.mjs` で完全に同一。`png-to-webp.mjs` の `parallelLimit` と `fetch-song-images.mjs` の `parallelLimit` も同じ役割。`PNG_MAGIC` / `isPng` は 2 ファイルで重複。GET してハッシュと PNG 判定を返す処理は `fetchRemote` と `getRemote` でほぼ同一（前者は `buf`、後者は `etag` を返す差だけ）。

**Files:**
- Create: `scripts/lib/util.mjs`
- Modify: `scripts/refetch-card-images.mjs`、`scripts/verify-card-images.mjs`、`scripts/png-to-webp.mjs`、`scripts/fetch-song-images.mjs`

**Interfaces:**
- Consumes: なし
- Produces: `runPool(items, limit, worker)` / `isPng(buf)` / `fetchPng(url, retries?)` を `scripts/lib/util.mjs` から export

- [ ] **Step 1: 共通ユーティリティを作る**

```js
// scripts/lib/util.mjs
/**
 * scripts/ 共通ユーティリティ。
 * 画像取得系スクリプト間で重複していた並列制御・PNG 判定・リトライ付き GET を集約する。
 */
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

/** 同時実行数を limit に抑えて worker を全 items に適用し、入力順の結果配列を返す */
export async function runPool(items, limit, worker) {
  const results = Array.from({ length: items.length });
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 先頭 8 バイトが PNG シグネチャかどうか */
export function isPng(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * GET でリモート画像を取得する。ネットワーク例外のみ線形バックオフでリトライし、
 * HTTP エラーはリトライせずステータスだけを返す（従来 2 実装と同じ方針）。
 * @returns {{status: number, buf?: Buffer, size?: number, hash?: string, etag?: string|null, isPng?: boolean, error?: string}}
 */
export async function fetchPng(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return { status: res.status };
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        status: 200,
        buf,
        size: buf.length,
        hash: createHash('sha256').update(buf).digest('hex'),
        etag: res.headers.get('etag') ?? null,
        isPng: isPng(buf),
      };
    } catch (err) {
      if (attempt === retries) return { status: 0, error: err.message };
      await sleep(500 * (attempt + 1));
    }
  }
}
```

- [ ] **Step 2: `refetch-card-images.mjs` を差し替える**

`PNG_MAGIC` / `isPng` / `fetchRemote` / `runPool` の定義を削除し、先頭に import を足す。`fetchRemote(url)` の呼び出しは `fetchPng(url)` に置き換える。返り値の形は上位互換のため、利用側の変更は不要。

```js
import { runPool, fetchPng } from './lib/util.mjs';
```

`createHash` の import が他で使われていなければ併せて削除する。

- [ ] **Step 3: `verify-card-images.mjs` を差し替える**

`PNG_MAGIC` / `isPng` / `getRemote` / `runPool` の定義を削除し、`getRemote(url)` の呼び出しを `fetchPng(url)` に置き換える。`headRemote` は HEAD リクエストで返り値の形も異なるため残す。ただし内部の待機は `node:timers/promises` に置き換える（Task 7 で扱う）。

```js
import { runPool, fetchPng } from './lib/util.mjs';
```

- [ ] **Step 4: `png-to-webp.mjs` を差し替える**

`parallelLimit` の定義を削除し、呼び出しを `runPool` に置き換える。引数の順序と意味は同一。

```js
import { runPool } from './lib/util.mjs';
```

- [ ] **Step 5: `fetch-song-images.mjs` を差し替える**

このファイルの `parallelLimit(tasks, limit)` はサンク配列を受ける別形なので、`runPool` の形に合わせて呼び出し側を変換する。

```js
import { runPool } from './lib/util.mjs';

// 旧: await parallelLimit(tasks, limit)
// 新: await runPool(tasks, limit, (task) => task())
```

`chunk` はこのファイル内でしか使われず重複していないため、そのまま残す。

- [ ] **Step 6: 動作を確認する**

`--dry-run` を持つものは dry-run で、持たないものはヘルプで、起動して落ちないことを見る。

```bash
node scripts/png-to-webp.mjs public/assets/th_cards --quality 85 --dry-run
node scripts/verify-card-images.mjs --type th --limit 20
node scripts/refetch-card-images.mjs --type th --ids 100,200 --dry-run
npx oxlint scripts/
```

Expected: `png-to-webp` は変換対象 0 件（すべて変換済み）を報告する。`verify` は 20 件を検証して不一致 0 件。`refetch` は dry-run で 2 件を対象として報告する。oxlint はエラーなし。

- [ ] **Step 7: コミット**

```bash
git add scripts/
git commit -m "♻️ scripts の並列制御と PNG 取得を共通化する"
```

---

### Task 6: 手書き引数パーサを `node:util` の `parseArgs` へ置き換える

3 スクリプトに `for` ループの手書きパーサがある。`node:util` の `parseArgs` が同じことをする。

**Files:**
- Modify: `scripts/refetch-card-images.mjs`、`scripts/verify-card-images.mjs`、`scripts/png-to-webp.mjs`

**Interfaces:**
- Consumes: `scripts/lib/util.mjs`（Task 5）
- Produces: なし。CLI のオプション名と挙動は不変

- [ ] **Step 1: `png-to-webp.mjs` を置き換える**

`parseArgs` は既定で未知のオプションに対して例外を投げる。従来の「`Unknown option:` を出して exit 1」を保つため try/catch で受ける。

```js
import { parseArgs } from 'node:util';

let values, positionals;
try {
  ({ values, positionals } = parseArgs({
    options: {
      lossless: { type: 'boolean', default: false },
      quality: { type: 'string', default: '85' },
      concurrency: { type: 'string', default: '8' },
      'dry-run': { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  }));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const dirs = positionals;
const lossless = values.lossless;
const quality = Number(values.quality);
const concurrency = Number(values.concurrency);
const dryRun = values['dry-run'];
const quiet = values.quiet;
```

既存の `--quality` 範囲検証と `dirs.length === 0` の Usage 表示はそのまま残す。

- [ ] **Step 2: `verify-card-images.mjs` を置き換える**

```js
import { parseArgs } from 'node:util';

function parseCliArgs() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        type: { type: 'string', default: 'th' },
        hash: { type: 'boolean', default: false },
        concurrency: { type: 'string', default: '10' },
        ids: { type: 'string' },
        limit: { type: 'string' },
        out: { type: 'string' },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (values.help) {
    console.log(getHelpText());
    process.exit(0);
  }
  if (!SOURCE_URLS[values.type]) {
    console.error(`Invalid --type: ${values.type} (must be 'th' or 'full')`);
    process.exit(1);
  }
  return {
    type: values.type,
    hash: values.hash,
    quiet: values.quiet,
    concurrency: Number(values.concurrency),
    ids: values.ids ? values.ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    limit: values.limit === undefined ? undefined : Number(values.limit),
    out: values.out,
  };
}
```

呼び出し元の `parseArgs(process.argv.slice(2))` を `parseCliArgs()` に変える。

- [ ] **Step 3: `refetch-card-images.mjs` を置き換える**

`--ids` は従来 `push(...)` で複数回指定を許していたため `multiple: true` にする。

```js
import { parseArgs } from 'node:util';

function parseCliArgs() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        type: { type: 'string', default: 'th' },
        from: { type: 'string' },
        ids: { type: 'string', multiple: true, default: [] },
        'min-remote-size': { type: 'string', default: '5000' },
        force: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        concurrency: { type: 'string', default: '10' },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (values.help) {
    console.log('See file header for usage.');
    process.exit(0);
  }
  if (!SOURCE_URLS[values.type]) {
    console.error(`Invalid --type: ${values.type}`);
    process.exit(1);
  }
  return {
    type: values.type,
    from: values.from,
    ids: values.ids.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
    minRemoteSize: Number(values['min-remote-size']),
    force: values.force,
    dryRun: values['dry-run'],
    concurrency: Number(values.concurrency),
    quiet: values.quiet,
  };
}
```

呼び出し元を `parseCliArgs()` に変える。

- [ ] **Step 4: オプションの挙動が変わっていないことを確認する**

```bash
node scripts/png-to-webp.mjs public/assets/th_cards --quality 85 --dry-run
node scripts/png-to-webp.mjs public/assets/th_cards --bogus; echo "exit=$?"
node scripts/verify-card-images.mjs --help
node scripts/verify-card-images.mjs --type bogus; echo "exit=$?"
node scripts/refetch-card-images.mjs --type th --ids 100 --ids 200 --dry-run
```

Expected: 未知オプションと不正な `--type` はいずれも exit 1。`--help` はヘルプを出して exit 0。`--ids` の 2 回指定は 2 件を対象にする。

- [ ] **Step 5: コミット**

```bash
git add scripts/
git commit -m "♻️ scripts の引数パースを node:util parseArgs に寄せる"
```

---

### Task 7: 手書きの待機を `node:timers/promises` へ置き換える

`await new Promise((r) => { setTimeout(r, ms); })` が 6 箇所ある。`notify-indexnow.mjs` は既に `node:timers/promises` を使っている。

**Files:**
- Modify: `scripts/verify-card-images.mjs`（`headRemote` 内）、`scripts/fetch-song-images.mjs`（3 箇所）、`scripts/refetch-card-images.mjs`（Task 5 で `fetchRemote` を消した残りがあれば）

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 残っている箇所を洗い出す**

```bash
grep -rn "new Promise((r) => { setTimeout" scripts/
```

Expected: `verify-card-images.mjs` の `headRemote` 内 1 箇所と、`fetch-song-images.mjs` の 3 箇所。

- [ ] **Step 2: 各ファイルに import を足して置き換える**

```js
import { setTimeout as sleep } from 'node:timers/promises';
```

置き換えの形は次のとおり。

```js
// 旧
await new Promise((r) => { setTimeout(r, 500 * (attempt + 1)); });
// 新
await sleep(500 * (attempt + 1));
```

- [ ] **Step 3: 残りがないことと動作を確認する**

```bash
grep -rn "new Promise((r) => { setTimeout" scripts/ || echo "残りなし"
node scripts/verify-card-images.mjs --type th --limit 10
npx oxlint scripts/
```

Expected: 「残りなし」。verify は 10 件を検証して完走。oxlint はエラーなし。

- [ ] **Step 4: コミット**

```bash
git add scripts/
git commit -m "♻️ scripts の待機を node:timers/promises に寄せる"
```

---

### Task 8: `parseCsv` の二重実装を解消する

`src/lib/data/fetchEventsCsv.ts` の `parseCsv`（非 export）と `scripts/extract-point-calc-golden.mjs` の `parseCsv` がほぼ同一。Task 3 の型ストリップにより、スクリプトから `.ts` を直接 import できる。

**Files:**
- Modify: `src/lib/data/fetchEventsCsv.ts`（`parseCsv` を export）
- Rename: `scripts/extract-point-calc-golden.mjs` → `scripts/extract-point-calc-golden.ts`
- Modify: `package.json`（`extract-point-calc-golden` スクリプト）

**Interfaces:**
- Consumes: Task 3（Node の型ストリップ）
- Produces: `parseCsv(text: string): string[][]` を `src/lib/data/fetchEventsCsv.ts` から export

- [ ] **Step 1: `parseCsv` を export する**

`src/lib/data/fetchEventsCsv.ts:30` の宣言に `export` を付ける。実装は変えない。

```ts
/** RFC4180 相当の CSV パーサ。Google の export はダブルクォートと改行を含む */
export function parseCsv(text: string): string[][] {
```

- [ ] **Step 2: カバレッジが落ちないことを確認する**

export しても行数は増えず、既存テストが `fetchEventsCsv` 経由でこの関数を通している。

```bash
npm run coverage
```

Expected: 4 指標すべて 95% 以上を維持。

- [ ] **Step 3: golden 抽出スクリプトを `.ts` へ改名する**

```bash
git mv scripts/extract-point-calc-golden.mjs scripts/extract-point-calc-golden.ts
```

- [ ] **Step 4: 自前の `parseCsv` を削除して import に置き換える**

ファイル内の `parseCsv` 定義（`/** RFC4180 相当の CSV パーサ… */` から関数末尾まで）を削除し、先頭に import を足す。

```ts
import { parseCsv } from '../src/lib/data/fetchEventsCsv.ts';
```

型ストリップの制約により、相対 import には必ず拡張子を付けること。

- [ ] **Step 5: `package.json` のスクリプトを更新する**

```json
"extract-point-calc-golden": "node scripts/extract-point-calc-golden.ts",
```

- [ ] **Step 6: 実行して出力が変わらないことを確認する**

```bash
git stash list  # 念のため作業状態を把握
node scripts/extract-point-calc-golden.ts
git diff --stat
```

Expected: 生成物に差分が出ない。差分が出た場合は 2 つの `parseCsv` の挙動差（元実装は `\r` を捨てる分岐の書き方が違う）を疑い、入力を絞って比較する。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "♻️ parseCsv の二重実装を解消する"
```

- [ ] **Step 8: PR を出す**

```bash
git push -u origin refactor/scripts-dedupe
gh pr create --base develop --title "♻️ scripts の重複実装を統合する" --body "$(cat <<'BODY'
## Summary

ADR 0069 に基づく削減の 2/4。

- 並列制御・PNG 判定・リトライ付き GET を `scripts/lib/util.mjs` に集約
- 手書き引数パーサ 3 本を `node:util` の `parseArgs` へ
- 手書きの待機 6 箇所を `node:timers/promises` へ
- `parseCsv` の二重実装を解消（golden 抽出を `.ts` 化して `src` から import）

## Test

- 各スクリプトを `--dry-run` / `--limit` で実行し、置換前と同じ対象を選ぶことを確認
- 未知オプション・不正な `--type` が exit 1 になることを確認
- `npm run coverage` で 4 指標 95% 維持
- `npx oxlint scripts/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## PR 3: src のコード整理

ブランチ: `refactor/src-cleanup`

### Task 9: 残り時間フォーマッタ 5 実装を 1 本にする

同じロジックが 5 箇所にある。接頭辞の有無と精度だけが違う。

| 実装 | 精度 | 接頭辞 |
|------|------|--------|
| `EventStatusBadge.formatRemaining` | 秒 | 呼び出し側が付ける |
| `EventStatusBadge.formatShort` | 分 | 呼び出し側が付ける |
| `EventList.formatRemaining` | 秒 | 関数内に埋め込み |
| `EventList.formatRemainingShort` | 分 | 呼び出し側が付ける |
| `EventCountdown.formatRemain` | 分 | 関数内に埋め込み |

**接頭辞を関数の引数にはしない。** 呼び出し側が付ける形に統一する。これは設計時の案（`{ prefix }` オプション）からの変更で、理由は次の既存バグを構造的に防ぐため。

`EventCountdown.svelte:42` は接頭辞が埋め込まれた `formatRemain` の戻り値にさらに「開始まで 」を足しており、**「開始まで 残り 3日 2時間」** と二重に出ている。接頭辞を関数から外せばこの形は書けなくなる。

**Files:**
- Modify: `src/lib/data/eventPeriod.ts`（`formatDuration` を追加）
- Modify: `src/components/EventStatusBadge.svelte`、`src/components/EventList.svelte`、`src/components/EventCountdown.svelte`
- Test: `tests/unit/data/eventPeriod.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `formatDuration(ms: number, unit: 'second' | 'minute'): string` を `src/lib/data/eventPeriod.ts` から export

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/data/eventPeriod.test.ts` の import に `formatDuration` を足し、末尾に次を追加する。

```ts
describe('formatDuration', () => {
  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('0 以下は空文字', () => {
    expect(formatDuration(0, 'second')).toBe('');
    expect(formatDuration(-1, 'minute')).toBe('');
  });

  it("unit 'second' は残りの大きさで単位を落とす", () => {
    expect(formatDuration(3 * DAY + 2 * HOUR + 4 * MIN + 5 * SEC, 'second')).toBe('3日 2時間 4分 5秒');
    expect(formatDuration(2 * HOUR + 4 * MIN + 5 * SEC, 'second')).toBe('2時間 4分 5秒');
    expect(formatDuration(4 * MIN + 5 * SEC, 'second')).toBe('4分 5秒');
    expect(formatDuration(5 * SEC, 'second')).toBe('5秒');
  });

  it("unit 'minute' は秒を切り捨てて 3 形態を取る", () => {
    expect(formatDuration(3 * DAY + 2 * HOUR + 4 * MIN + 59 * SEC, 'minute')).toBe('3日 2時間');
    expect(formatDuration(2 * HOUR + 4 * MIN + 59 * SEC, 'minute')).toBe('2時間 4分');
    expect(formatDuration(4 * MIN + 59 * SEC, 'minute')).toBe('4分');
  });

  it('接頭辞は付けない（呼び出し側の責務）', () => {
    expect(formatDuration(5 * SEC, 'second')).not.toContain('残り');
    expect(formatDuration(5 * MIN, 'minute')).not.toContain('残り');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run tests/unit/data/eventPeriod.test.ts
```

Expected: FAIL。`formatDuration` が export されていない旨のエラー。

- [ ] **Step 3: `formatDuration` を実装する**

`src/lib/data/eventPeriod.ts` に追加する。

```ts
/** 残り時間の表示精度。'second' は秒まで、'minute' は分までを出す */
export type DurationUnit = 'second' | 'minute';

/**
 * ミリ秒を残り時間の文字列にする。0 以下なら空文字。
 * 「残り 」「開始まで 」などの接頭辞は付けない。呼び出し側で付けること
 * （関数側に持たせると接頭辞が二重に付く書き方を許してしまうため）。
 */
export function formatDuration(ms: number, unit: DurationUnit): string {
  if (ms <= 0) return '';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (unit === 'minute') {
    if (d > 0) return `${d}日 ${h}時間`;
    if (h > 0) return `${h}時間 ${m}分`;
    return `${m}分`;
  }
  const s = totalSec % 60;
  if (d > 0) return `${d}日 ${h}時間 ${m}分 ${s}秒`;
  if (h > 0) return `${h}時間 ${m}分 ${s}秒`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run tests/unit/data/eventPeriod.test.ts
```

Expected: PASS。

- [ ] **Step 5: `EventStatusBadge.svelte` を差し替える**

`formatRemaining` と `formatShort` の定義を削除し、import と呼び出しを変える。

```ts
import { classifyEventStatus, eventStartMs, eventEndMs, formatDuration, type EventStatus } from '../lib/data/eventPeriod';
```

`remainText` の `$derived.by` を次にする。

```ts
const remainText: string = $derived.by(() => {
  // 終了未定の実施中イベントは残り時間を出せない
  if (status === 'live') return end === null ? '' : `残り ${formatDuration(end - now, 'second')}`;
  if (status === 'upcoming' && start !== null) return `開始まで ${formatDuration(start - now, 'minute')}`;
  return '';
});
```

- [ ] **Step 6: `EventList.svelte` を差し替える**

`formatRemaining` と `formatRemainingShort` の定義を削除する。import に `formatDuration` を足し、60 行目付近と 63 行目付近を次にする。旧 `formatRemaining` は接頭辞を関数内に持っていたため、呼び出し側に移すこと。

```ts
remainText = end === null ? '' : `残り ${formatDuration(end - now, 'second')}`;
```

```ts
remainText = `開始まで ${formatDuration(start - now, 'minute')}`;
```

- [ ] **Step 7: `EventCountdown.svelte` を差し替える**

`formatRemain` の定義を削除する。import に `formatDuration` を足し、`status()` を次にする。**42 行目の二重接頭辞がここで直る。**

```ts
function status(ev: EventItem): { text: string; className: string; remain: string } {
  const s = classifyEventStatus(ev.start_date, ev.end_date, now);
  if (s === 'upcoming') {
    const start = eventStartMs(ev.start_date);
    return { text: '開催予定', className: 'text-blue-700 bg-blue-100', remain: start === null ? '' : `開始まで ${formatDuration(start - now, 'minute')}` };
  }
  if (s === 'live') {
    const end = eventEndMs(ev.end_date);
    // 終了未定の実施中イベントは残り時間を出せない
    return { text: '実施中', className: 'text-red-700 bg-red-100', remain: end === null ? '' : `残り ${formatDuration(end - now, 'minute')}` };
  }
  return { text: '終了', className: 'text-gray-500 bg-gray-200', remain: '' };
}
```

- [ ] **Step 8: 画面で確認する**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
```

`http://localhost:4321/` と `http://localhost:4321/events/` をブラウザで開き、次を確認してスクリーンショットを `tmp/` に保存する。

- トップページの開催予定イベントが「開始まで 3日 2時間」と出る（**「開始まで 残り …」になっていない**）
- 実施中イベントが「残り …」と出る
- イベント一覧の実施中が秒まで、開催予定が分までで出る

確認後は `astro dev stop` で dev サーバーを止める。

- [ ] **Step 9: コミット**

```bash
git add src/lib/data/eventPeriod.ts src/components/EventStatusBadge.svelte src/components/EventList.svelte src/components/EventCountdown.svelte tests/unit/data/eventPeriod.test.ts
git commit -m "♻️ 残り時間フォーマッタを formatDuration に統合する"
```

---

### Task 10: 所持数ストア 2 本を factory へ寄せる

`cardCounts.svelte.ts` と `broachCounts.svelte.ts` は localStorage キーと上限値以外が同一で、各 45 行ある。

**Files:**
- Create: `src/lib/stores/countStore.svelte.ts`
- Modify: `src/lib/stores/cardCounts.svelte.ts`、`src/lib/stores/broachCounts.svelte.ts`
- Test: `tests/unit/stores/cardCounts.test.ts`、`tests/unit/stores/broachCounts.test.ts`（既存が回帰の網になる）

**Interfaces:**
- Consumes: `loadJson` / `saveJson`（`src/lib/storage.ts`）
- Produces: `createCountStore(storageKey: string, max?: number): CountStore` を `src/lib/stores/countStore.svelte.ts` から export。`CountStore` は `{ get, set, delta, all, total, reload }`

- [ ] **Step 1: 既存テストが通っている状態を記録する**

リファクタ前の基準を取る。

```bash
npx vitest run tests/unit/stores/
```

Expected: PASS。この結果が Step 5 の比較対象になる。

- [ ] **Step 2: factory を実装する**

```ts
// src/lib/stores/countStore.svelte.ts
import { loadJson, saveJson } from '../storage';

type CountMap = Record<string, number>;

export interface CountStore {
  /** 未登録なら 0 */
  get(id: number | string): number;
  /** 0 以下ならキーごと削除。max 指定時は上限で丸める */
  set(id: number | string, value: number): void;
  delta(id: number | string, amount: number): void;
  all(): CountMap;
  total(): number;
  /** localStorage の最新内容に同期し、消えたキーは落とす */
  reload(): void;
}

/**
 * localStorage に載る「ID → 所持数」ストアを作る。
 * $state をクロージャに閉じ込め、関数経由で読み書きする形をとる
 * （オブジェクトごと返すとリアクティビティが切れるため）。
 */
export function createCountStore(storageKey: string, max = Number.POSITIVE_INFINITY): CountStore {
  const counts = $state<CountMap>(
    typeof window === 'undefined' ? {} : loadJson<CountMap>(storageKey, {}),
  );

  function persist() {
    saveJson(storageKey, counts);
  }

  function get(id: number | string): number {
    return counts[String(id)] || 0;
  }

  function set(id: number | string, value: number): void {
    const v = Math.min(max, Math.max(0, Math.floor(value || 0)));
    const key = String(id);
    if (v === 0) {
      delete counts[key];
    } else {
      counts[key] = v;
    }
    persist();
  }

  return {
    get,
    set,
    delta: (id, amount) => { set(id, get(id) + amount); },
    all: () => counts,
    total: () => Object.values(counts).reduce((a, b) => a + b, 0),
    reload: () => {
      const fresh = loadJson<CountMap>(storageKey, {});
      for (const key of Object.keys(counts)) {
        if (!(key in fresh)) delete counts[key];
      }
      for (const [k, v] of Object.entries(fresh)) {
        counts[k] = v;
      }
    },
  };
}
```

- [ ] **Step 3: `cardCounts.svelte.ts` を入口だけにする**

`ownedIdSet` は Task 13 で削除するため、ここでは移さない。

```ts
import { STORAGE_KEYS } from '../storage';
import { createCountStore } from './countStore.svelte';

export const {
  get: getCount,
  set: setCount,
  delta: deltaCount,
  all: allCounts,
  total: totalOwned,
  reload: reloadFromStorage,
} = createCountStore(STORAGE_KEYS.CARD_COUNTS);
```

- [ ] **Step 4: `broachCounts.svelte.ts` を入口だけにする**

```ts
import { STORAGE_KEYS } from '../storage';
import { createCountStore } from './countStore.svelte';

/** 自チーム 5 枠 × 2 個が使用上限のため、登録もこの個数までで十分 */
export const MAX_BROACH_COUNT = 10;

export const {
  get: getBroachCount,
  set: setBroachCount,
  delta: deltaBroachCount,
  all: allBroachCounts,
  total: totalOwnedBroachs,
  reload: reloadBroachCountsFromStorage,
} = createCountStore(STORAGE_KEYS.SHARED_BROACH_COUNTS, MAX_BROACH_COUNT);
```

- [ ] **Step 5: 既存テストが通り続けることを確認する**

`ownedIdSet` の import が残っているとここで落ちる。落ちた場合は Task 13 を先に適用せず、この Step では `ownedIdSet` を一時的に `cardCounts.svelte.ts` へ残して切り分けること。

```bash
npx vitest run tests/unit/stores/
```

Expected: Step 1 と同じ PASS。

- [ ] **Step 6: カバレッジを確認する**

新規ファイルが分母に入る。`max` の既定値ぶんと指定ぶきの両方が 2 つの入口から踏まれるため、分岐は埋まるはず。

```bash
npm run coverage
```

Expected: 4 指標すべて 95% 以上。届かない指標があれば、その未到達行を `tests/unit/stores/` に足す。

- [ ] **Step 7: 画面で確認する**

```bash
npm run dev
```

`http://localhost:4321/mycard/` で所持数の増減が保存されること、`http://localhost:4321/shared-broach/` で共通ブローチの所持数が 10 で頭打ちになることを確認し、スクリーンショットを `tmp/` に保存する。確認後は `astro dev stop`。

- [ ] **Step 8: コミット**

```bash
git add src/lib/stores/
git commit -m "♻️ 所持数ストアを createCountStore に統合する"
```

---

### Task 11: `CardListItem` を削除する

`Card` の部分集合に `[key: string]: any` を足しただけで、型としての制約になっていない。

**Files:**
- Delete: `src/lib/cardListData.ts`
- Modify: `src/components/CardList.svelte`、`src/components/MyCardList.svelte`、`src/components/cards/CardTableRow.svelte`、`src/components/cards/CardMobileCard.svelte`、`src/components/cards/CardTileCard.svelte`

**Interfaces:**
- Consumes: `Card`（`src/lib/data/fetchCardsJson.ts`）
- Produces: なし

- [ ] **Step 1: 参照箇所を洗い出す**

```bash
grep -rn "CardListItem\|cardListData" src/
```

Expected: 5 コンポーネントの計 13 箇所。

- [ ] **Step 2: import を `Card` に差し替える**

各ファイルの次の行を置き換える。相対パスはファイルの階層に合わせること（`src/components/` 直下は `../lib/data/fetchCardsJson`、`src/components/cards/` は `../../lib/data/fetchCardsJson`）。

```ts
// 旧
import type { CardListItem } from '../lib/cardListData';
// 新
import type { Card } from '../lib/data/fetchCardsJson';
```

型注釈の `CardListItem` を `Card` に置き換える（`CardListItem[]` → `Card[]`、`card: CardListItem` → `card: Card`、`$state<CardListItem[]>` → `$state<Card[]>`、`fresh as CardListItem[]` → `fresh as Card[]`）。

- [ ] **Step 3: 型チェックを通す**

`Card` は全フィールドが `| null` を許すため、`CardListItem` で非 null だったフィールドを直接使っている箇所で型エラーが出る可能性がある。

```bash
npm run typecheck
```

Expected: エラーなし。エラーが出た場合は、その箇所で `?? ''` や `?? 0` のフォールバックを足す。**`as` でのキャストで黙らせないこと**（実データに null が来る可能性を隠すため）。

- [ ] **Step 4: ファイルを削除する**

```bash
git rm src/lib/cardListData.ts
npm run typecheck
```

Expected: エラーなし。

- [ ] **Step 5: 画面で確認する**

```bash
npm run dev
```

`http://localhost:4321/cards/` を開き、テーブル表示・タイル表示・モバイル表示の 3 モードで衣装が正しく並ぶことと、`http://localhost:4321/mycard/` が動くことを確認してスクリーンショットを `tmp/` に保存する。確認後は `astro dev stop`。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "🔥 CardListItem を削除して Card に統合する"
```

---

### Task 12: 呼び出し側が渡さない引数を削る

**`fetchSheetRaw` の `maxRetries` は残す。** `tests/unit/data/gvizFetch.test.ts` の 3 箇所が明示的に渡しており、削るとリトライ経路のカバレッジが落ちる。

**Files:**
- Modify: `src/lib/data/clientRefresh.ts`（`options.maxAgeMs`）
- Modify: `src/lib/motion.ts`（`duration` / `blurFrom`）

**Interfaces:**
- Consumes: なし
- Produces: `refreshData(key, fetchFn, onUpdate)` の 4 引数目が消える。`materialIn` / `materialOut` のオプションは `scaleFrom` のみになる

- [ ] **Step 1: 呼び出し側が本当に渡していないことを確認する**

```bash
grep -rn "maxAgeMs" src/ tests/
grep -rn "materialIn=\|materialOut=" src/
```

Expected: `maxAgeMs` は `clientRefresh.ts` 内のみ。`materialIn=` / `materialOut=` は `HeaderNav.svelte:171` の `{{ scaleFrom: 0.98 }}` のみ。`duration` と `blurFrom` を渡す箇所は無い。もし渡している箇所があればこの Task を中止し、その引数は残す。

- [ ] **Step 2: `refreshData` から `maxAgeMs` を外す**

`src/lib/data/clientRefresh.ts` のシグネチャを次にする。

```ts
export async function refreshData<T>(
  key: DataKey,
  fetchFn: () => Promise<T[]>,
  onUpdate: (freshData: T[]) => void,
): Promise<void> {
  // キャッシュチェック
  const cached = readCache<T>(key, DEFAULT_MAX_AGE_MS);
```

関数冒頭の `const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;` を削除する。

- [ ] **Step 3: `materialIn` / `materialOut` のオプションを絞る**

`src/lib/motion.ts` の `MaterialOptions` を次にする。

```ts
interface MaterialOptions {
  /** materialize の初期スケール */
  scaleFrom?: number;
}

/** イントロ 180ms / アウトロ 120ms。閉操作をブロックしない上限（ADR 0046） */
const IN_DURATION = 180;
const OUT_DURATION = 120;
/** materialize の初期ぼかし量 (px) */
const BLUR_FROM = 3;
```

`materialIn` / `materialOut` の引数から `duration` と `blurFrom` の分割代入を外し、本体で上記の定数を使う。

```ts
export function materialIn(
  _node: Element,
  { scaleFrom = 0.94 }: MaterialOptions = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 120, css: (t) => `opacity: ${t}` };
  }
  return {
    duration: IN_DURATION,
    easing: cubicOut,
    css: (t, u) => `
      opacity: ${t};
      transform: scale(${scaleFrom + (1 - scaleFrom) * t});
      filter: blur(${BLUR_FROM * u}px);
    `,
  };
}

export function materialOut(
  _node: Element,
  { scaleFrom = 0.96 }: MaterialOptions = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 100, css: (t) => `opacity: ${t}` };
  }
  return {
    duration: OUT_DURATION,
    easing: cubicOut,
    css: (t) => `
      opacity: ${t};
      transform: scale(${scaleFrom + (1 - scaleFrom) * t});
    `,
  };
}
```

- [ ] **Step 4: 型チェックとカバレッジを確認する**

```bash
npm run typecheck
npm run coverage
```

Expected: どちらも成功。分岐が減るためカバレッジは下がらない。

- [ ] **Step 5: 画面で確認する**

```bash
npm run dev
```

ヘッダーのドロップダウン（`HeaderNav`）とモバイルメニューの開閉、保存デッキ画面（`/decks/`）の確認ダイアログの開閉が従来どおり動くことを確認する。確認後は `astro dev stop`。

- [ ] **Step 6: コミット**

```bash
git add src/lib/data/clientRefresh.ts src/lib/motion.ts
git commit -m "🔥 呼び出し側が渡さない引数を削る"
```

---

### Task 13: デッドエクスポートを削る

カバレッジゲートを維持するため、対象は監査で挙げた約 50 個より大幅に狭い。テストが直接検証している export（`countDeckAttrs`、`broachValue`、`binomial` など）を un-export するとテストが書けなくなり、カバレッジが落ちるため触らない。

**Files:**
- Modify: `src/lib/data/eventBonusTiers.ts`、`src/lib/data/eventPeriod.ts`、`src/lib/stores/cardCounts.svelte.ts`、`src/lib/motion.ts`
- Test: `tests/unit/stores/cardCounts.test.ts`、`tests/unit/data/eventPeriod.test.ts`

**Interfaces:**
- Consumes: Task 10（`cardCounts.svelte.ts` は factory 呼び出しだけになっている）
- Produces: なし

- [ ] **Step 1: 対象が本当に未使用であることを再確認する**

```bash
for s in ALL_SELECT_CLASSES isOpenEndedEvent ownedIdSet formatEventStart prefersReducedMotion; do
  echo "== $s"
  grep -rn "\b$s\b" src/ tests/ | grep -v "^src/lib/data/eventBonusTiers.ts\|^src/lib/data/eventPeriod.ts\|^src/lib/stores/cardCounts.svelte.ts\|^src/lib/motion.ts"
done
```

Expected: `ALL_SELECT_CLASSES` は出力なし。`isOpenEndedEvent` と `ownedIdSet` はテストのみ。`formatEventStart` と `prefersReducedMotion` は出力なし（定義元ファイル内でのみ使われる）。

- [ ] **Step 2: 完全未使用のものを削除する**

`src/lib/data/eventBonusTiers.ts:30-31` の次を削除する。

```ts
export const ALL_SELECT_CLASSES: string[] =
  EVENT_BONUS_TIERS.flatMap(t => t.selectClasses);
```

- [ ] **Step 3: src 未使用でテストだけがあるものを、テストごと削除する**

`src/lib/data/eventPeriod.ts` から次を削除する。

```ts
/** 終了日が未入力かどうか（= 開始済みなら実施中として扱う）。 */
export function isOpenEndedEvent(end_date: string): boolean {
  return eventEndMs(end_date) === null;
}
```

`tests/unit/data/eventPeriod.test.ts` の `describe('isOpenEndedEvent', …)` ブロック全体と、import 一覧の `isOpenEndedEvent` を削除する。

`src/lib/stores/cardCounts.svelte.ts` に `ownedIdSet` が残っていれば削除する（Task 10 で既に落ちているはず）。`tests/unit/stores/cardCounts.test.ts` の `it('ownedIdSet は所持数>0 のキー集合（文字列）', …)` と import 一覧の `ownedIdSet` を削除する。

- [ ] **Step 4: 内部利用だけのものを un-export する**

`export` キーワードだけを外す。実装と呼び出し箇所は変えない。

```ts
// src/lib/data/eventPeriod.ts — formatEventPeriod が内部で呼ぶ
function formatEventStart(start_date: string): string {

// src/lib/motion.ts — materialIn / materialOut が内部で呼ぶ
function prefersReducedMotion(): boolean {
```

- [ ] **Step 5: 型チェック・テスト・カバレッジを通す**

```bash
npm run typecheck
npm run coverage
```

Expected: すべて成功し、4 指標が 95% 以上。`isOpenEndedEvent` と `ownedIdSet` のテストを消した分だけカバー行が減るが、実装も同時に消えるため比率は下がらない。下がった場合は消し漏れがないか確認する。

- [ ] **Step 6: ビルドが通ることを確認する**

`.svelte` や `.astro` からの参照漏れはここで出る。

```bash
npm run build
```

Expected: 成功。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "🔥 未使用の export を削る"
```

- [ ] **Step 8: PR を出す**

```bash
git push -u origin refactor/src-cleanup
gh pr create --base develop --title "♻️ src の重複と未使用コードを整理する" --body "$(cat <<'BODY'
## Summary

ADR 0069 に基づく削減の 3/4。

- 残り時間フォーマッタ 5 実装を `formatDuration(ms, unit)` に統合
- 所持数ストア 2 本を `createCountStore` に統合
- `CardListItem` を削除して `Card` に統合
- 呼び出し側が渡さない引数（`refreshData` の `maxAgeMs`、`materialIn` / `materialOut` の `duration` / `blurFrom`）を削除
- 未使用の export を削除

## 併せて直したもの

`EventCountdown.svelte` の開催予定イベントが「**開始まで 残り 3日 2時間**」と接頭辞を二重に出していた。接頭辞をフォーマッタから外し、呼び出し側の責務にしたことで構造的に直っている。

## Test

- `npm run coverage` で 4 指標 95% 維持
- `npm run typecheck` / `npm run build`
- `npm run dev` でイベント一覧・トップ・所持衣装・共通ブローチ・衣装一覧の 3 表示モードを確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## PR 4: ModalDialog のネイティブ化

ブランチ: `refactor/native-dialog`

### Task 14: `<dialog>` + `showModal()` へ移行する

ADR 0048 は代替案として React 系プリミティブのみを検討しており、ネイティブ `<dialog>` は検討していない。同 ADR は「`inert` による背景要素の無効化、iOS のスクロールロック等は未対応」をトレードオフとして明記しており、`showModal()` はそこを標準機能で埋める。

**Files:**
- Modify: `src/components/ui/ModalDialog.svelte`
- Modify: `docs/adr/0048-baseline-ui-compliance.md`（追記）
- Test: 既存 E2E（`tests/` 配下でダイアログを操作しているもの）

**Interfaces:**
- Consumes: `materialIn` / `materialOut`（`src/lib/motion.ts`）。オプションは渡さないため Task 12 とは独立で、順序の制約はない
- Produces: `confirm(options): Promise<boolean>` と `prompt(options): Promise<string | null>` は不変。呼び出し側の変更は不要

- [ ] **Step 1: 既存 E2E の基準を取る**

```bash
grep -rln "modal-dialog" tests/
npx playwright test $(grep -rln "modal-dialog" tests/ | tr '\n' ' ')
```

Expected: PASS。この結果が Step 6 の比較対象になる。dev サーバーを先に起動しておくとビルドを省ける。

- [ ] **Step 2: マークアップを `<dialog>` に置き換える**

`{#if visible}` は残す。外すと `materialIn` / `materialOut` が使えず ADR 0046 のモーション規約から外れる。スクリムの `<div>` は `::backdrop` に寄せる。

```svelte
{#if visible}
  <dialog
    bind:this={dialogEl}
    class="modal-dialog surface-card w-full max-w-sm p-5 shadow-overlay"
    aria-labelledby={titleId}
    aria-describedby={opts.message ? messageId : undefined}
    onclose={onNativeClose}
    oncancel={onNativeCancel}
    onclick={onBackdropClick}
    data-testid="modal-dialog"
    in:materialIn
    out:materialOut
  >
    <!-- 中身（h2 / p / input / ボタン群）は現行のまま移す -->
  </dialog>
{/if}
```

`role` 属性は付けない。`<dialog>` の暗黙ロールが `dialog` で、`showModal()` が `aria-modal` 相当を担う。`danger: true` の `alertdialog` だけは明示が要るため `role={opts.danger ? 'alertdialog' : undefined}` を付ける。

`::backdrop` のスタイルを `<style>` ブロックに置く。

```svelte
<style>
  .modal-dialog {
    /* ブラウザ既定の余白と枠を消し、中央に置く */
    border: none;
    padding: 1.25rem;
    margin: auto;
  }
  .modal-dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
</style>
```

- [ ] **Step 3: スクリプト側を差し替える**

`show()` の末尾で `showModal()` を呼ぶ。`FOCUSABLE` 定数、`onKeydown` の Tab 分岐、`<svelte:window onkeydown=…>`、`panelEl` を削除する。

```ts
// oxlint-disable-next-line no-unassigned-vars -- Svelte の bind:this 代入を静的解析できず誤検知
let dialogEl: HTMLDialogElement | undefined;

async function show(nextMode: 'confirm' | 'prompt', nextOpts: PromptOptions) {
  mode = nextMode;
  opts = nextOpts;
  inputValue = nextOpts.value ?? '';
  visible = true;

  await tick();
  // showModal がフォーカストラップ・背景の inert 化・Esc を標準で担う
  dialogEl?.showModal();

  if (nextMode === 'prompt') {
    inputEl?.focus();
    inputEl?.select();
  } else if (nextOpts.danger) {
    // 破壊的操作では Enter 連打で誤確定しないよう、まずキャンセルへ置く
    cancelEl?.focus();
  } else {
    confirmEl?.focus();
  }
}

/** Esc は <dialog> の cancel イベントで届く。既定の即時 close は止めて settle に通す */
function onNativeCancel(event: Event) {
  event.preventDefault();
  onCancel();
}

/** close イベントは settle 経由でしか起きないため、取りこぼしの保険としてのみ扱う */
function onNativeClose() {
  if (resolve) onCancel();
}

/** 背景クリックで閉じる。<dialog> 自身が背景も含む矩形なので、標的が dialog 本体なら背景 */
function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogEl) onCancel();
}
```

初期フォーカスの明示指定は残す。`danger: true` でキャンセル側へ置く要件があり、`<dialog>` の既定挙動（最初の focusable）と一致しないため。

- [ ] **Step 4: `settle` を `close()` に合わせる**

`visible = false` の前に `dialogEl?.close()` を呼ぶ。フォーカス復帰は `<dialog>` の標準挙動に任せ、`returnFocusEl` とその復帰処理を削除する。

```ts
function settle(value: boolean | string | null) {
  const pending = resolve;
  resolve = null;
  dialogEl?.close();
  visible = false;
  pending?.(value);
}
```

- [ ] **Step 5: フォーカス復帰が標準で効くか実測する**

ブラウザ実装に差がありうるため、ここで必ず確認する。

```bash
npm run dev
```

`http://localhost:4321/decks/` で保存デッキの削除ボタンを押し、ダイアログをキャンセルしたあとフォーカスが削除ボタンへ戻ることをキーボード操作（Tab を 1 回押して次の要素へ進むか）で確認する。

戻らない場合は Step 4 の削除を取り消し、`returnFocusEl` と `void tick().then(() => target?.focus())` を復活させる。**戻らないまま先へ進めないこと**（ADR 0048 が明示した要件のため）。

- [ ] **Step 6: キーボードと背景クリックを実測する**

同じ dev サーバーで次を確認し、スクリーンショットを `tmp/` に保存する。

- Esc でキャンセルとして閉じる
- Tab がダイアログ内で巡回し、背後の要素へ抜けない
- 背景クリックで閉じる
- `danger: true`（デッキ削除）で初期フォーカスがキャンセル側にある
- `prompt` の入力欄が初期フォーカスを持ち、Enter で確定する
- 背後のページがスクロールしない

確認後は `astro dev stop`。

- [ ] **Step 7: E2E を流す**

```bash
npx playwright test
```

Expected: Step 1 と同じ PASS。`data-testid="modal-dialog"` は `<dialog>` へ移してあるため既存ロケータは効く。落ちた場合、Playwright が `<dialog>` の可視性判定で待つ挙動の差を最初に疑う。

- [ ] **Step 8: ADR 0048 に追記する**

`docs/adr/0048-baseline-ui-compliance.md` の「検討した代替案」の直後に次の節を足す。

```markdown
## 追記（2026-09-02）: ネイティブ `<dialog>` へ移行した

本 ADR の時点では代替案として React 系のコンポーネントプリミティブのみを検討しており、ネイティブ `<dialog>` + `showModal()` を検討していなかった。

`showModal()` は、本 ADR が「ライブラリが吸収してくれるエッジケース」として未対応と記した **`inert` による背景要素の無効化**と **iOS のスクロールロック**を、依存を増やさずに標準機能で提供する。あわせてフォーカストラップ・Esc・フォーカス復帰も標準化されるため、自前実装（`FOCUSABLE` 定数と Tab の巡回処理、`<svelte:window>` の Esc 監視、`returnFocusEl` の復帰）を削除した。

`{#if}` による条件描画は維持し、`materialIn` / `materialOut` によるトランジションは ADR 0046 の規約どおり残している。`danger: true` の初期フォーカスをキャンセル側へ置く要件は `<dialog>` の既定挙動と異なるため、明示指定を残した。

決定は [ADR 0069](0069-ponytail-audit-cleanup.md) の一部。
```

`docs/adr/README.md` の一覧表は 0048 の行のままでよい（新規 ADR ではないため）。

- [ ] **Step 9: コミット**

```bash
git add src/components/ui/ModalDialog.svelte docs/adr/0048-baseline-ui-compliance.md
git commit -m "♻️ ModalDialog をネイティブ dialog へ移行する"
```

- [ ] **Step 10: PR を出す**

```bash
git push -u origin refactor/native-dialog
gh pr create --base develop --title "♻️ ModalDialog をネイティブ dialog へ移行する" --body "$(cat <<'BODY'
## Summary

ADR 0069 に基づく削減の 4/4。ADR 0048 に追記あり。

`<div role="dialog">` の自前実装を `<dialog>` + `showModal()` へ置き換えた。ADR 0048 が「未対応」と記していた `inert` による背景無効化と iOS のスクロールロックが標準機能で効くようになる。

削除したもの:

- `FOCUSABLE` 定数と Tab 巡回処理
- `<svelte:window onkeydown>` による Esc 監視
- スクリム用の `<div>`（`::backdrop` へ）
- `returnFocusEl` とフォーカス復帰処理

## Test

- `npx playwright test` 全件
- Esc / Tab 巡回 / 背景クリック / `danger` の初期フォーカス / `prompt` の Enter 確定 / 背景のスクロールロック / フォーカス復帰を手動確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## リリース

4 本の PR がすべて `develop` にマージされたら、`develop` を `main` へ fast-forward する。タグは `tag-release.yml` が自動採番する（人手のリリースは MINOR）。手順は `release` スキルを参照。リリース後は `release-tweet` スキルで告知文を 3 案作る。
