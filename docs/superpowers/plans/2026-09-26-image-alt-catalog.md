# 画像 alt カタログ生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `public/assets/` の全 3,527 画像に対して、シート由来の識別情報と画像から見たビジュアル描写を合成した alt カタログを生成する。

**Architecture:** sub-agent が画像を見て `v`（ビジュアル描写）だけを書き、ファイル（JSONL）で受け取る。識別情報はシートの値を使い、合成は `src/lib/imageAlt.ts` の純関数が行う。生成とアプリへの結線は分離し、今回はカタログ生成までで止める。

**Tech Stack:** TypeScript / Node 25（`.mjs` スクリプト）/ sharp / Vitest / sub-agent

**Spec:** `docs/superpowers/specs/2026-09-26-image-alt-catalog-design.md`（同時に読むこと）

**ADR:** `docs/adr/0094-image-alt-catalog-generation.md`

## Global Constraints

- 対象は **3,527 件**（カード 3,376 + 楽曲 151）。`cards/<id>` と `th_cards/<id>` は表裏なので 1 件として数える
- `v` は **日本語 40〜70 文字**。生成時はこの長さを指示し、検証は **10 文字未満または 200 字超**で落とす
- `v` に **キャラクター名・カード名・レアリティ・属性・ローマ字・主観語**（`美しい` `かわいい` `かっこいい`）を書かない。識別情報は合成段で足す
- 検証の禁則語: `TODO` / `placeholder` / `画像` / `不明` / `?` / `？`
- キャラクター名混入検査は `CHARACTERS`（16 名）を使うが、`百` と `千` は一般語彙と衝突するため**除外**する（検査対象は 14 名）
- 作業領域は `tmp/image-alt/` すべて（gitignore 済み）。**`public/` の元画像を書き換えてはならない**
- アプリへの結線は行わない。`src/` の `<img>` 21 箇所は `cardname` のまま据え置き
- `src/lib/**` は Vitest のカバレッジしきい値 95%（statements / branches / functions / lines）が課される。新しい `src/lib` モジュールには必ず対応する単体テストを置く
- コミット件名は `<gitmoji> <日本語の説明>`（ADR 0066）。`.husky/commit-msg` が検証する
- 生成物 `src/data/image-visual.json` の構造は次の 1 つに固定する。増減や改名をしない

```json
{
  "cards": { "1000": { "v": "…" } },
  "songs": { "100": { "v": "…" } }
}
```

`v` 以外に `n`（シートに行が無いカードの印字名。string）が付くことがある。`n` は `cards` 側だけが持つ。

## Review Focus

以下は spec が前提にしているが、どのタスクのテストも直接は扱っていない入力。各行に対応するテストを各タスクに置いてある。

1. **sub-agent が数値で `id` を書く**（`{"id":1000}`）— キーが `"1000"` になり、網羅性検査が「3,527 件すべて欠落」と誤報する。数値 ID は文字列に正規化する（Task 5）
2. **1 バッチだけファイルが無い、または 0 件**— 欠落が静かに通り、`image-visual.json` から 100 枚分が丸ごと消える。入口で「ファイル存在 + 件数」を検査する（Task 5）
3. **`v` にキャラクター名（例 `御堂虎於`）が混入**— 合成で名前が二重になる。名前混入検査で落とす（Task 2）
4. **`v` が 15 文字や 150 文字**— 生成指示は 40〜70 文字だが検査は 10〜200 文字なので**現状は通る**。実際の強制境界をテストで固定し、意図せず緩めない（Task 2）
5. **後から `public/assets/` に画像を追加してカタログが古くなる**— 次の `merge` が exit≠0 になる（仕様どおり「気付ける」）。「ID が 1 枚増えると検証が落ちる」ことをテストで固定する（Task 2）

---

### Task 1: alt 合成の純関数 `src/lib/imageAlt.ts`

**Files:**
- Create: `src/lib/imageAlt.ts`
- Test: `tests/unit/imageAlt.test.ts`

**Interfaces:**
- Consumes: なし（葉モジュール。`src/lib/data/*` を import しない）
- Produces:
  ```ts
  export interface VisualEntry { v?: string | null; n?: string | null }
  export interface CardAltSource { name?: string | null; cardname?: string | null; rarity?: string | null; attribute?: string | null }
  export interface SongAltSource { artist?: string | null; song_name?: string | null }

  export function cardAlt(card: CardAltSource, entry?: VisualEntry | null): string
  export function songAlt(song: SongAltSource, entry?: VisualEntry | null): string
  export function orphanCardAlt(entry: VisualEntry): string
  ```

**Notes:** `Card` / `Song` を直接受け取るのではなく、構造的に狭い型を受ける。実際の `Card` / `Song` は構造的に満たすのでそのまま渡せる。`image-visual.json` はこのモジュールから import しない（結線時にクライアントバンドルへ入るのを防ぐため。spec 2 章）。

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/imageAlt.test.ts` に次を書く。`describe` は `cardAlt` / `songAlt` / `orphanCardAlt` の 3 つ

  `cardAlt`:
  - `{ name: '御堂虎於', cardname: '午前0時の新月', rarity: 'SSR', attribute: 'Beat' }` + `{ v: 'ネオン街を背景に、黒い中国風ジャケット姿の青年が赤い中国結を掲げている' }` → `'御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）。ネオン街を背景に、黒い中国風ジャケット姿の青年が赤い中国結を掲げている'`
  - `cardname` が `null` → `'御堂虎於のカードイラスト（SSR・Beat）。…'`（「」が付かない）
  - `rarity` と `attribute` が両方 `null` → `'…カードイラスト。…'`（空の括弧が付かない）
  - `rarity` だけ `null` → `'…カードイラスト（Beat）。…'`
  - `v` が `null` / `undefined` / `''` / `'   '` の 4 通りすべて → 末尾の`。`と描写が落ち、識別情報だけで終わる
  - `name` が `null` → `v` のみを返す
  - `name` も `v` も無ければ `''`

  `songAlt`:
  - `{ artist: 'IDOLiSH7', song_name: '4-ROAR' }` + v → `'IDOLiSH7の楽曲「4-ROAR」ジャケット。…'`
  - `song_name` が `null` → `'IDOLiSH7の楽曲ジャケット。…'`
  - `artist` と `song_name` が両方 `null` → `v` のみ
  - `entry` を第 2 引数に **`null` を渡しても**例外を投げずに `v` 相当を処理できる

  `orphanCardAlt`:
  - `{ n: 'Yuki Aoi', v: '夕暮れの屋上で、マフラーを風に翻されている' }` → `'Yuki Aoiのカードイラスト。夕暮れの屋上で、マフラーを風に翻されている'`
  - `n` が無い → `v` のみ
  - `v` も `n` も空 → `''`

- [ ] **Step 2: テストが失敗することを確認する**

  Run: `npx vitest run tests/unit/imageAlt.test.ts`
  Expected: FAIL — `Failed to resolve import "../../src/lib/imageAlt"`

- [ ] **Step 3: `src/lib/imageAlt.ts` を実装する**

  共通の cleaning helper `clean(value)`（`null` / `undefined` / `string` 以外 / 前後空白のみ → `''`）を 1 つ持ち、全 export 関数がそれを使う。括弧は中身が空なら丸ごと落とす。`v` が空のときは区切りの`。`も加えない。

- [ ] **Step 4: テストが通ることを確認する**

  Run: `npx vitest run tests/unit/imageAlt.test.ts`
  Expected: PASS（全 `it` 緑）

- [ ] **Step 5: 型検査と lint を通す**

  Run: `npm run typecheck && npm run lint`
  Expected: いずれも exit 0

- [ ] **Step 6: commit する**

  ```bash
  git add src/lib/imageAlt.ts tests/unit/imageAlt.test.ts
  git commit -m "✨ 画像 alt の合成純関数 imageAlt.ts を追加する"
  ```

---

### Task 2: カタログ検証 `scripts/image-alt/validate-visual.mjs`

**Files:**
- Create: `scripts/image-alt/validate-visual.mjs`
- Test: `tests/unit/scripts/validateVisual.test.ts`

**Interfaces:**
- Consumes: なし（検査対象は引数で受け取る。ネットワークもファイル IO も読まない）
- Produces:
  ```js
  /** 1 レコードの違反を文字列の配列で返す。違反が無ければ [] */
  export function validateEntry(record, kind, id) -> string[]
  /** カタログ全体の違反を文字列の配列で返す。違反が無ければ [] */
  export function validateCatalog(catalog, { cardIds, songIds }) -> string[]
  /** `CHARACTERS` 16 名から `百` / `千` を除いた 14 名。Task 2 のテストで src/lib/constants.ts との一致を固定する */
  export const LEAK_CHECK_NAMES
  ```

**Notes:** `LEAK_CHECK_NAMES` はこのファイルにハードコードする（14 名 = `CHARACTERS` 16 名 − `百` `千`）。`src/lib/constants.ts` を `.mjs` から import すると素の Node 実行時に TS 依存が入るため避け、同等性はテストで担保する。

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/scripts/validateVisual.test.ts`

  `LEAK_CHECK_NAMES`:
  - `src/lib/constants.ts` の `CHARACTERS`（16 名）から `百` と `千` を除いた 14 名と、`set` として一致する

  `validateEntry`:
  - 正常なレコード → `[]`
  - `v` が `''` → 違反 1 件（メッセージに `id` を含む）
  - `v` が `'短すぎる'`（4 文字）→ 長さ違反
  - `v` が `'あ'.repeat(201)` → 長さ違反
  - `v` が `'あ'.repeat(15)` と `'あ'.repeat(150)` → **違反 0 件**（強制境界が 10〜200 であることを固定する。Review Focus 4）
  - `v` に `placeholder` / `TODO` / `カード画像` / `不明` / `これは?` を含む → それぞれ禁則違反
  - `v` が `'御堂虎於が黒衣を着ている'` → キャラクター名違反
  - `v` が `'百人の少女が夕暮れの坂道で笑っている'`（18 文字）→ **違反 0 件**（`百` を検査から除外していることの固定。10 文字未満だと長さ違反も同時に出るため、必ず 10 文字以上にする）
  - `v` が `'千の利用者が屋台の前で並んでいる'`（16 文字）→ **違反 0 件**（同じく 10 文字以上にする）
  - `n` が `string` なら通る（`cards` の孤児レコードが正）
  - `kind === 'song'` で `n` が入っている → 構造違反（`n` は `cards` 側だけが持つ）
  - `n` が `123`（number）→ 構造違反

  `validateCatalog`:
  - `cardIds` に無い ID が `cards` にあれば違反、`cards` に無い ID が `cardIds` にあれば違反（**双方向**）
  - `songs` も同じ
  - **ID が 1 枚だけ増えた状態で違反が出る**ことを固定する（Review Focus 5）: `cardIds` に `'9999'` を追加して `validateCatalog` が違反を返す
  - `catalog.cards` が `null` / 配列 → 構造違反
  - 全部正常なら `[]`

- [ ] **Step 2: テストが失敗することを確認する**

  Run: `npx vitest run tests/unit/scripts/validateVisual.test.ts`
  Expected: FAIL — `Failed to resolve import "../../../scripts/image-alt/validate-visual.mjs"`

- [ ] **Step 3: `scripts/image-alt/validate-visual.mjs` を実装する**

  検査順序は spec 5 章の 1→6 に固定する。禁則語は 1 つの RegExp（`/TODO|placeholder|画像|不明|[?？]/`）で判定する。キャラクター名検査は `LEAK_CHECK_NAMES` の各名について `v.includes(name)` で判定する。違反メッセージはすべて offending `id` を含む文字列にする。

- [ ] **Step 4: テストが通ることを確認する**

  Run: `npx vitest run tests/unit/scripts/validateVisual.test.ts`
  Expected: PASS

- [ ] **Step 5: commit する**

  ```bash
  git add scripts/image-alt/validate-visual.mjs tests/unit/scripts/validateVisual.test.ts
  git commit -m "✨ 画像 alt カタログの検証器 validate-visual を追加する"
  ```

---

### Task 3: Manifest 生成 `scripts/image-alt/build-manifest.mjs`

**Files:**
- Create: `scripts/image-alt/build-manifest.mjs`
- Test: `tests/unit/scripts/buildManifest.test.ts`

**Interfaces:**
- Consumes: `scripts/lib/util.mjs` の `fetchRetry`（`{ json: true }` なし — GViz は JS として返す）
- Produces:
  ```js
  /** 純粋関数。ID 集合とシート行から Manifest とバッチ分割を作る */
  export function buildManifest({ cardImageIds, thumbImageIds, songImageIds, cardRows, songRows })
    -> { manifest, batches, stats }
  /** batch: { name: 'batch-00', out: 'tmp/image-alt/batch-00.jsonl', items: ManifestItem[] } */
  /** ManifestItem: { kind: 'card'|'song', id: string, readPath: string, fallbackPath: string|null, needPrintedName: boolean } */
  ```
  書き込み: `tmp/image-alt/manifest.json`, `tmp/image-alt/batches.json`

**Notes:** ネットワーク部分は `main()` に閉じ、`buildManifest` は引数だけを受け取る。`hasDbRow` は Manifest の項目に含めず、sub-agent に渡すスライスでは `needPrintedName` に変換する（spec 3.1 の Manifest 例とスライス項目は別の形。spec 3.4 がスライスの形を規定している）。`readPath` / `fallbackPath` は**ファイルの有無を見ずに ID の所属だけで決める**（Task 3 は Task 4 より先に実行されるので、存在判定をしてはいけない）:

| 対象 | `readPath` | `fallbackPath` |
| ---- | ---------- | -------------- |
| `id` が `cardImageIds` に含まれるカード | `tmp/image-alt/scaled/cards/<id>.webp` | `public/assets/th_cards/<id>.webp` |
| `id` が `cardImageIds` に無いカード | `public/assets/th_cards/<id>.webp` | `null` |
| 楽曲 | `public/assets/songs/<id>.webp` | `null` |

ID は昇順に並べる（安定性のため）。バッチはカード 34 本（100×33 + 76）、楽曲 2 本（76 + 75）。

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/scripts/buildManifest.test.ts`

  与え方: `buildManifest({ cardImageIds: ['1000','1001','1958'], thumbImageIds: ['1000','1001','1958','2059'], songImageIds: ['100'], cardRows: [{ ID: 1000 }, { ID: 1001 }], songRows: [{ id: 100 }] })`

  - `stats.cardCount` は `4`（`thumbImageIds` の長さ。`cardImageIds` と `th_cards` の和集合ではなく `th_cards` が正）
  - `stats.songCount` は `1`
  - `stats.dbMatchedCardCount` は `2`、`stats.orphanCardCount` は `2`（`1958` と `2059`）
  - `needPrintedName` が `true` になるのは `id === '1958'` と `id === '2059'` だけ
  - `readPath` が `'1000'` の項目は `tmp/image-alt/scaled/cards/1000.webp`、`fallbackPath` が `public/assets/th_cards/1000.webp`
  - `id === '2059'`（`cardImageIds` に無い）の項目は `readPath` が `public/assets/th_cards/2059.webp` で `fallbackPath` が `null`
  - `id === '100'`（楽曲）の項目は `readPath` が `public/assets/songs/100.webp` で `fallbackPath` が `null`
  - `batches` の各 `items` の合計が `stats.cardCount + stats.songCount`
  - `batches` の並びが `card` のみ → `song` のみ
  - `batches[0].name` は `'batch-00'`、`out` は `'tmp/image-alt/batch-00.jsonl'`
  - カード 3,376 / 楽曲 151 を渡したとき `batches.length` が `36`、`items` の長さが `[100 × 33, 76, 76, 75]`

- [ ] **Step 2: テストが失敗することを確認する**

  Run: `npx vitest run tests/unit/scripts/buildManifest.test.ts`
  Expected: FAIL — import 解決失敗

- [ ] **Step 3: `scripts/image-alt/build-manifest.mjs` を実装する**

  `main()` は `fetchRetry(url)`（**`{ json: true }` は使わない**）で GViz 応答を取り、`google.visualization.Query.setResponse(...)` を JSONP として剥がして列ラベルの配列と行の配列にする。カードは列ラベル `ID`、楽曲は `ID` / `曲名` / `アーティスト名` を読む。

  GViz は `content-type: application/javascript` で返すので `JSON.parse` は必ず落ちる。`{ json: true }` を付けると 4 回リトライして必ず失敗する。

- [ ] **Step 4: テストが通ることを確認する**

  Run: `npx vitest run tests/unit/scripts/buildManifest.test.ts`
  Expected: PASS

- [ ] **Step 5: 実データで Manifest を取り、`spec 1 章の母数` と一致することを確認する**

  Run: `node scripts/image-alt/build-manifest.mjs`
  Expected: `stats` が `cardCount: 3376` / `songCount: 151` / `dbMatchedCardCount: 2871` / `orphanCardCount: 505` を出し、`batches.length` が `36`。`cardCount` が 3,376 でないなら `public/assets/` かシートが spec 作成時から変わっているので、**この時点で止めて spec を更新する**（先に進まない）

- [ ] **Step 6: commit する**

  ```bash
  git add scripts/image-alt/build-manifest.mjs tests/unit/scripts/buildManifest.test.ts
  git commit -m "✨ 画像 alt 対象の Manifest とバッチ分割を生成するスクリプトを追加する"
  ```

---

### Task 4: カード画像の縮小 `scripts/image-alt/scale-cards.mjs`

**Files:**
- Create: `scripts/image-alt/scale-cards.mjs`
- Test: `tests/unit/scripts/scaleCards.test.ts`

**Interfaces:**
- Consumes: `public/assets/cards/*.webp`、`tmp/image-alt/manifest.json`
- Produces: `tmp/image-alt/scaled/cards/<id>.webp`（512x768 lossy webp）と stdout の件数

**Notes:** 実 Sharp を使うので、テストも実 Sharp で 1 枚だけ通す（モックにしない）。`public/` を壊さないことが最重要なので、変換前後の `public/` のサイズと mtime を比較する。

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/scripts/scaleCards.test.ts`

  `scaleOne(srcPath, outPath)` を export し、`node:os` の `tmpdir()` に 1 枚だけ変換する:

  - `public/assets/cards/1000.webp` を変換した出力のメタデータが `width === 512` / `height === 768` / `format === 'webp'`
  - 変換前に記録した `public/assets/cards/1000.webp` の `size` と `mtimeMs` が変換後に**一致する**（`public/` を書いていない）

- [ ] **Step 2: テストが失敗することを確認する**

  Run: `npx vitest run tests/unit/scripts/scaleCards.test.ts`
  Expected: FAIL — import 解決失敗

- [ ] **Step 3: `scripts/image-alt/scale-cards.mjs` を実装する**

  `main()` は `runPool` で並列実行する（同時実行数は `8`）。sharp は `.resize(512, 768, { fit: 'fill' })` と `.webp({ quality: 80 })`。`manifest.json` を読み、`readPath` が `tmp/image-alt/scaled/` 配下のものだけを対象にする。

- [ ] **Step 4: テストが通ることを確認する**

  Run: `npx vitest run tests/unit/scripts/scaleCards.test.ts`
  Expected: PASS

- [ ] **Step 5: 全件を縮小し、件数を確かめる**

  Run: `node scripts/image-alt/scale-cards.mjs`
  Expected: `2893` 件を変換し、`ls tmp/image-alt/scaled/cards | wc -l` が `2893`

- [ ] **Step 6: 元画像が変わっていないことを確認する**

  Run: `git status --short public/`
  Expected: 出力なし

- [ ] **Step 7: commit する**

  ```bash
  git add scripts/image-alt/scale-cards.mjs tests/unit/scripts/scaleCards.test.ts
  git commit -m "✨ カード画像を 512x768 に縮小して alt 記述コストを下げる"
  ```

---

### Task 5: バッチ検証とマージ `scripts/image-alt/merge-visual.mjs`

**Files:**
- Create: `scripts/image-alt/merge-visual.mjs`
- Test: `tests/unit/scripts/mergeVisual.test.ts`

**Interfaces:**
- Consumes: `scripts/image-alt/validate-visual.mjs` の `validateCatalog` / `validateEntry`、`tmp/image-alt/batches.json`、`tmp/image-alt/batch-*.jsonl`
- Produces:
  ```js
  /** JSONL 文字列をレコード配列にする。数値 id は文字列に正規化し、壊れた行は errors に積む */
  export function parseBatch(text) -> { records, errors }
  /** 存在的ファイルと各バッチの件数を検査する。不足していれば缺席したバッチ名を列挙する */
  export function checkBatches(batches, existsFn) -> string[]
  ```
  書き込み: `src/data/image-visual.json`（2 スペース・改行あり）

**Notes:** Review Focus 1（数値 `id`）と 2（バッチ欠落）はここが所有する。`merge` は `cards` と `songs` を分けて集約し、`kind` ではなくどちらのファイルに由来かで振り分ける。1 つのバッチが `card` と `song` を混ぜないことは Task 3 が保証している。

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/scripts/mergeVisual.test.ts`

  `parseBatch`:
  - `'{}\n{"kind":"card","id":1000,"v":"あ"}\n'` → `records.length === 1` かつ `records[0].id === '1000'`
  - `'not json\n'` → `records.length === 0` かつ `errors.length === 1`
  - `''`（空ファイル）→ `records.length === 0` かつ `errors.length === 0`（空はエラーではなく「0 件」として扱う。`checkBatches` 側で検出する）
  - 末尾に改行が無い 1 行だけ → `records.length === 1`

  `checkBatches`:
  - 全バッチのファイルが存在し件数が合う → `[]`
  - 1 バッチだけファイルが無い → その `name` を含む違反 1 件（Review Focus 2）
  - 全バッチのファイルが**存在するが 0 件** → 違反（空ファイルは「書いた」とみなさない）
  - 1 バッチだけファイルがあるのに件数が `items.length` より少ない → 違反

- [ ] **Step 2: テストが失敗することを確認する**

  Run: `npx vitest run tests/unit/scripts/mergeVisual.test.ts`
  Expected: FAIL — import 解決失敗

- [ ] **Step 3: `scripts/image-alt/merge-visual.mjs` を実装する**

  処理順は ① `checkBatches` ② 実 ID 集合の走査 ③ 各 JSONL の `parseBatch` ④ カタログ組み立て ⑤ `validateCatalog` ⑥ 書出。①〜⑤ のどこかで違反が出たら、違反 ID を列挙して exit≠0。`n` は `cards` にだけ引き継ぐ。

- [ ] **Step 4: テストが通ることを確認する**

  Run: `npx vitest run tests/unit/scripts/mergeVisual.test.ts`
  Expected: PASS

- [ ] **Step 5: commit する**

  ```bash
  git add scripts/image-alt/merge-visual.mjs tests/unit/scripts/mergeVisual.test.ts
  git commit -m "✨ alt カタログのマージと検証を行うスクリプトを追加する"
  ```

---

### Task 6: パイロットで描写書式を確定する（人手ゲート）

**Files:**
- Create: `scripts/image-alt/describe-images.md`
- Read: `tmp/image-alt/manifest.json`

**Produces:** `tmp/image-alt/pilot.jsonl`（4 レコード）と、確定した `scripts/image-alt/describe-images.md`

**Notes:** このタスクはコードを決定する代わりに**書式を確定する**。Task 7 の 36 本が使うプロンプトの本文がここで確定する。ユーザー確認なしに Task 7 へ進まない。

- [ ] **Step 1: 4 件のスライスを選ぶ** —  Represents な組み合わせを意図的に混ぜる

  `1000`（`needPrintedName: false` のカード）、`1958`（孤児カードで `needPrintedName: true`）、`100`（楽曲）、`2059`（フル画像なし・`fallbackPath` の 200x300 サムネだけを読む孤児）

- [ ] **Step 2: 指示文 `scripts/image-alt/describe-images.md` を書く**

  spec 4 章の 10 ルールをそのまま写成する。「やること / 書き方のルール / 出力形式」の 3 段構え。**書き出し先のパスはこのファイルに書かない**（Task 7 は 1 本ごとに違うパスを渡すが、パイロットは `tmp/image-alt/pilot.jsonl`）。書き出し先は常に dispatch が `## 今回の担当` で指定する。Global Constraints と同じ文言を 1 か所にまとめ、Master Prompt と二重管理にしない。

- [ ] **Step 3: sub-agent 1 本をパイロットとして走らせる** — `tmp/image-alt/pilot.jsonl` に書き出させる

- [ ] **Step 4: 出力を自分で読み、Global Constraints に反する記述を洗い出す**

  Check: `v` が 40〜70 文字の日本語か / 主語で始まっているか / キャラクター名・カード名・レアリティ・属性・ローマ字・主観語が入っていないか / 禁則語が入っていないか

- [ ] **Step 5: ユーザーに `tmp/image-alt/pilot.jsonl` を見せて承認を取る**

  4 行をそのまま貼って確認する。**返事が「よい」になるまで Task 7 へ進まない。**

- [ ] **Step 6: 承認結果を `scripts/image-alt/describe-images.md` に反映して commit する**

  パイロットで許容しにくかった表現を 1 例として `describe-images.md` に足す。`tmp/image-alt/pilot.jsonl` は書式比較用に残す（gitignore 済みなので commit はしない）。

  ```bash
  git add scripts/image-alt/describe-images.md
  git commit -m "📝 alt 記述 sub-agent の指示文をパイロットで確定する"
  ```

---

### Task 7: 本番 36 本で 3,527 件を記述する

**Files:**
- Read: `tmp/image-alt/batches.json`, `scripts/image-alt/describe-images.md`
- Create: `tmp/image-alt/batch-00.jsonl` … `tmp/image-alt/batch-35.jsonl`（すべて gitignore 済み）

**Notes:** 検査はまだ走らせない。**このタスクの完了条件は「36 本が全件書き終えた」ことだけ**で、検証は Task 8 の `merge` に一本化する。1 ウェーブの投下数は 8、ウェーブは 5 回（8 / 8 / 8 / 8 / 4）。

- [ ] **Step 1: 入力が準備できていることを確認する**

  Run: `node -e "const b=JSON.parse(require('fs').readFileSync('tmp/image-alt/batches.json','utf8'));console.log(b.length,b.reduce((s,x)=>s+x.items.length,0))"`
  Expected: `36 3527`

- [ ] **Step 2: 5 ウェーブに分けて 36 本を投げる**

  各 sub-agent は `agent: "general"` / `background: true` で投げ、完了通知を待つ（ポーリングしない）。ウェーブの構成は下表のとおり。**前のウェーブの通知が返るまで次のウェーブを投げない**（上下文の 同时 消費を避ける）。

  | ウェーブ | バッチ | 本数 |
  | -------- | ------ | ---- |
  | 1 | batch-00 … batch-07 | 8 |
  | 2 | batch-08 … batch-15 | 8 |
  | 3 | batch-16 … batch-23 | 8 |
  | 4 | batch-24 … batch-31 | 8 |
  | 5 | batch-32 … batch-35 | 4 |

  各 sub-agent へ渡すプロンプトは次の形（`tmp/image-alt/batches.json` の当該バッチの `items` を**そのまま** JSON 化して貼る。`ManifestItem` の 5 フィールドすべてを含める）:

  ````
  <scripts/image-alt/describe-images.md の全文をそのまま貼る>

  ## 今回の担当

  書き出し先: tmp/image-alt/batch-07.jsonl
  担当スライス（この 100 件だけ）:
  ```json
  [{"kind":"card","id":"…","readPath":"…","fallbackPath":null,"needPrintedName":false}, …]
  ```

  全件を書き終えたら「書き終えた」とだけ報告してください。レコード本文を報告に含めないでください。
  ````

- [ ] **Step 3: 36 本すべてが 3,527 行を書き終えたことを確認する**

  Run: `cat tmp/image-alt/batch-*.jsonl | wc -l`
  Expected: `3527`。違う場合はどのバッチが何行不足しているかを報告する（重複 ID の検出は Task 8 の `merge` に任せる）

- [ ] **Step 4: このタスクは commit しない** — `tmp/` は gitignore 済み。生成物の commit は Task 8 で行う

---

### Task 8: マージして `src/data/image-visual.json` を commit する

**Files:**
- Create: `src/data/image-visual.json`（生成物）
- Verify: `src/lib/imageAlt.ts`, `scripts/image-alt/merge-visual.mjs`

**Notes:** ここで初めて spec 5 章の検証が全部走る。落ちた場合の運用は「違反 ID が列挙される → その ID だけを含む小さなバッチを 1 本だけ追加投入 → 再度マージ」。

- [ ] **Step 1: マージを実行する**

  Run: `node scripts/image-alt/merge-visual.mjs`
  Expected: exit 0。違反があれば違反 ID を列挙して exit≠0 になるので、その ID だけで `tmp/image-alt/batch-XX.jsonl` を作り直して Step 1 に戻る

- [ ] **Step 2: 生成物を確認する**

  Run: `node -e "const c=JSON.parse(require('fs').readFileSync('src/data/image-visual.json','utf8'));console.log(Object.keys(c.cards).length, Object.keys(c.songs).length, Object.values(c.cards).filter(e=>e.n).length)"`
  Expected: `3376 151 505`（cards / songs / 孤児数）

- [ ] **Step 3: 全文を自分の目でサンプリングする**

  `v` を 10 件ランダムに抜き、1 枚ずつ元画像と突き合わせる。特に `1958`（孤児）と `100`（楽曲）を必ず見る。破綻があれば `describe-images.md` を直して該当バッチだけ再投する

- [ ] **Step 4: テストとカバレッジゲートを通す**

  Run: `npm run test:unit && npm run coverage`
  Expected: 両方 exit 0。`src/lib/imageAlt.ts` を含む全体カバレッジが 95% 以上

- [ ] **Step 5: 型検査と lint を通す**

  Run: `npm run typecheck && npm run lint`
  Expected: 両方 exit 0

- [ ] **Step 6: ビルドが通ることを確認する** — JSON の import 経路が壊れていないことの確認

  Run: `npm run build`
  Expected: exit 0

- [ ] **Step 7: commit する**

  ```bash
  git add src/data/image-visual.json
  git commit -m "🍱 画像 3,527 件の alt 描写カタログを追加する"
  ```

- [ ] **Step 8: ADR のステータスを `承認` に更新して commit する**

  `docs/adr/0094-image-alt-catalog-generation.md` の `- ステータス: 提案` を `承認` に、`docs/adr/README.md` の 0094 行のステータスを `承認` に直す。

  ```bash
  git add docs/adr/0094-image-alt-catalog-generation.md docs/adr/README.md
  git commit -m "📝 ADR 0094 を承認にする"
  ```

---

## 完了後の残件（別タスク・本計画の対象外）

- `src/` の `<img>` 21 箇所の `alt={card.cardname}` を、`src/lib/imageAlt.ts` の `cardAlt` / `songAlt` に差し替える結線作業。あわせて `image-visual.json` から ID で `VisualEntry` 引く lookup を用意する
- 結線時に `image-visual.json` の import を build 時のみ通る経路（`src/lib/data/fetch*.ts` 側）に閉じ込め、クライアントバンドルへ入れないこと
