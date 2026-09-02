# over-engineering 監査に基づく削減 設計

- 日付: 2026-09-02
- 関連 ADR: [0069](../../adr/0069-ponytail-audit-cleanup.md)（新規）、[0048](../../adr/0048-baseline-ui-compliance.md)（追記）
- 対象外と決めた ADR: [0032](../../adr/0032-unit-test-coverage-gate.md)、[0054](../../adr/0054-gsap-home-motion.md)

## 背景

リポジトリ全体を over-engineering 観点で走査し、17 件の削減候補を挙げた。ユーザーとの検討で、既存 ADR の決定を覆す 2 件は現状維持とし、残りを実施することにした。

さらに設計中の実地検証で、監査時点の判断が誤っていた 2 件が判明した。本設計はその修正を含む。

## 現状維持と決めたもの

### カバレッジゲート（ADR 0032）

`src/lib/**` に対する 4 指標 95% のしきい値を維持する。これを緩めれば `*Branches.test.ts` 群 2,164 行とテスト専用 export 約 50 個、`/* v8 ignore */` 23 箇所を削除できるが、ADR 0032 は「可視化のみ」「Branches だけ緩める」「分母を score/ に限定」をいずれも検討のうえ却下している。スコア計算エンジンの回帰検知という目的は今も有効であり、それらのテスト行数は over-engineering ではなく意図した投資と見なす。

**この決定は本設計全体の制約になる。** 以下すべての変更は、変更後も 4 指標 95% を維持しなければならない。

### GSAP（ADR 0054）

トップページ専用の GSAP を維持する。ADR 0054 は「WAAPI + IntersectionObserver で自作する」案をまさに検討し、100 行程度の実装とその保守を抱えることを理由に却下している。トップページ専用チャンクに切り出されるため他 2,778 ページへの追加ペイロードは 0 バイトであり、監査時点でこの却下理由を読めていなかった。

## 監査の誤りとその修正

### cron の直 push 化は行わない

監査では、毎時の取り込み 4 本が `peter-evans/create-pull-request` で PR を作り即 `gh pr merge` していることを冗長と判断し、`main` への直 push を提案した。

これは誤りである。4 本はすべて `0 * * * *` で起動し、`concurrency` ガードを持たない。現在は PR 経由のため GitHub 側がマージを直列化しているが、直 push にすると 4 本が同時に `main` を叩き 3 本が non-fast-forward で失敗する。`concurrency` で直列化しても待機枠は 1 本ぶんで、残りはキャンセルされ取り込み漏れになる。回避には rebase リトライループの自作が要る。

削減 68 行に対し、自作の競合処理 20 行を毎時本番公開の経路へ持ち込む取引であり、割に合わない。**本項目は却下する。**

### tsx の除去は 2 箇所の修正を伴う

監査では import チェーンに TS 専用のランタイム構文がないことを確認し、Node の型ストリップで `tsx` を置換できると判断した。構文までしか見ていなかった点が不足だった。

Node v24.3.0 で実測したところ、型ストリップは拡張子なしの相対 import を解決できず `ERR_MODULE_NOT_FOUND` になる。また JSON の既定 import も import attributes を要求する。

ただし該当は `scripts/extract-test-fixtures.ts` の依存グラフ全体で 2 箇所だけだった。

| 箇所 | 修正 |
|------|------|
| `src/lib/data/fetchCardsJson.ts:2` | `from '../constants'` → `from '../constants.ts'` |
| `src/lib/data/fetchSongsJson.ts:2` | JSON import に `with { type: 'json' }` を付与 |

どちらも Vite と Astro で問題ない。同じディレクトリの `from './gviz.ts'` が既に動いており、拡張子付き import は実績がある。書き換え後の形が Node で動くことは実測済み。よって**本項目は実施する**。`src` 全体に 352 箇所ある拡張子なし import は触らない。

## 実施する変更

### PR 1: ワークフローとツールチェーン

**`fetch-gap-cards.yml` を削除する。** カード画像は ID 2〜3892 で、`cards` に 483 件の欠落がある。`fetch-new-cards.yml` の GAP 判定は `cards ∩ th` の補集合を取るため、この 483 件をすべて拾う。`fetch-gap-cards.yml` の対象はその真部分集合で、差は ID 1 のみ。その ID 1 は両ディレクトリに存在せず、ソース側にも無い。`fetch-new-cards.yml` の `BATCH_LIMIT` は 1500 で、483 件は 1 回で収まる。

**`serve` を `astro preview` へ置き換える。** `output: 'static'` かつ adapter なしのため、Astro の組み込みプレビューサーバーが `dist/` を配信する。`package.json` の `preview` スクリプトと `playwright.config.ts` の `webServer.command` が対象。CLAUDE.md の「本番配信を再現する」という記述は、どちらも Cloudflare Workers Static Assets そのものではないため、表現を「ビルド成果物をローカル配信する」へ改める。

**`tsx` を Node の型ストリップへ置き換える。** 上記 2 箇所を修正し、`extract-fixtures` スクリプトを `node scripts/extract-test-fixtures.ts` にする。`.nvmrc` は変更しない。型ストリップが既定で有効になったのは Node 22.18.0 で、現行の `.nvmrc`（`22`）と CI の `node-version: 22` はどちらも最新の 22.x を解決するため、この下限を満たす。下限そのものは ADR と CLAUDE.md に記録する。

**`husky` と `lint-staged` を除去する。** `prepare` を `git config core.hooksPath .husky` にし、`.husky/pre-commit` を `npx oxlint` の全体実行にする。oxlint は Rust 製で全体走査も十分速い。`.husky/commit-msg` は現状のまま維持する（ADR 0066 が依存する）。

**未追跡ディレクトリ `ouj/` を削除する。** 中身は空のネストした `.git` のみ。

### PR 2: scripts の重複統合

**手書き引数パーサを `node:util` の `parseArgs` へ置き換える。** `refetch-card-images.mjs`、`verify-card-images.mjs`、`png-to-webp.mjs` の 3 箇所。

**共通ユーティリティを 1 ファイルへ集約する。** 並列実行の制限（`runPool` ×2、`parallelLimit` ×1）とリトライ付きフェッチ（`fetchRemote` / `headRemote` / `getRemote`）が重複している。`scripts/lib/util.mjs` を新設して寄せる。ファイルを 1 つ増やして 3 ファイルから重複を除く取引になる。

**`await new Promise(r => setTimeout(r, ms))` を `node:timers/promises` の `setTimeout` へ置き換える。** 6 箇所。`notify-indexnow.mjs` は既にこの形。

**`parseCsv` の二重実装を解消する。** `src/lib/data/fetchEventsCsv.ts` の実装（現在は非 export）を export し、`scripts/extract-point-calc-golden.mjs` を `.ts` へ改名して import する。PR 1 の型ストリップが前提。export 化は行数を増やさず、既存テストが `fetchEventsCsv` 経由で経路を通しているためカバレッジは落ちない。

### PR 3: src のコード整理

**残り時間フォーマッタ 4 実装を 1 本にする。** `EventStatusBadge.svelte`、`EventList.svelte`（2 本）、`EventCountdown.svelte` に、接頭辞の有無と精度だけが違う実装が散っている。`eventPeriod.ts` に `formatRemaining(ms, { prefix, unit })` を置く。`unit: 'second'` は残り時間の大きさに応じて「d日 h時間 m分 s秒」から「s秒」まで単位を落とす。`unit: 'minute'` は秒を切り捨て、「d日 h時間」「h時間 m分」「m分」の 3 形態を取る。`src/lib/**` に入るためテストを新規に書く。

**所持数ストア 2 本を factory へ寄せる。** `cardCounts.svelte.ts` と `broachCounts.svelte.ts` は localStorage キーと上限値以外が同一で、各 45 行ある。`createCountStore(storageKey, max?)` を 1 つ置く。現行と同じく `$state` をクロージャに閉じ込め関数経由で読み書きする形を保ち、リアクティビティを維持する。

**`CardListItem` を削除する。** `Card` の部分集合に `[key: string]: any` を足しただけで、型としての制約になっていない。参照している 6 ファイルを `Card` へ切り替える。

**呼び出し側が一度も渡さない引数を削る。**

| 対象 | 判断 |
|------|------|
| `refreshData` の `options.maxAgeMs` | 削除。12 箇所の呼び出しすべてが未指定 |
| `materialIn` / `materialOut` の `duration` と `blurFrom` | 削除して定数化。呼び出し側は `scaleFrom` のみ渡す |
| `fetchSheetRaw` の `maxRetries` | **残す。** テスト 3 箇所が明示的に渡しており、削るとリトライ経路のカバレッジが落ちる |

**デッドエクスポートを削る。** カバレッジゲートを維持するため、対象は監査で挙げた約 50 個より大幅に狭い。テストが直接検証している export（`countDeckAttrs`、`broachValue`、`binomial` など）を un-export すると、そのテストが書けなくなりカバレッジが落ちるため触らない。

| 対象 | 措置 |
|------|------|
| `ALL_SELECT_CLASSES` | 削除。src・テストとも参照なし |
| `isOpenEndedEvent` | 削除。src 未使用。テストも同時に落とす |
| `ownedIdSet` | 削除。src 未使用。テストも同時に落とす |
| `formatEventStart` | un-export。`formatEventPeriod` が内部で呼ぶ |
| `prefersReducedMotion` | un-export。`materialIn` / `materialOut` が内部で呼ぶ |

### PR 4: ModalDialog のネイティブ化

`<div role="dialog">` を `<dialog>` + `showModal()` へ置き換える。ADR 0048 は代替案として React 系プリミティブのみを検討しており、ネイティブ `<dialog>` は検討していない。同 ADR は「`inert` による背景要素の無効化、iOS のスクロールロック等は未対応」をトレードオフとして明記しており、`showModal()` はそこを標準機能で埋める。

| 現行 | 置換後 |
|------|--------|
| `FOCUSABLE` 定数と `onKeydown` の Tab 分岐 | `showModal()` の標準フォーカストラップ |
| `onKeydown` の Escape 分岐と `<svelte:window>` | `<dialog>` の `cancel` イベント |
| スクリム用の `<div class="absolute inset-0 bg-black/40">` | `::backdrop` 疑似要素 |
| `returnFocusEl` と `tick().then(target.focus())` | `close()` 時の標準フォーカス復帰 |

`{#if visible}` は残す。これを外すと `materialIn` / `materialOut` が使えず、ADR 0046 のモーション規約から外れる。`{#if}` で `<dialog>` を描画し、`tick()` 後に `showModal()` を呼ぶ。

初期フォーカスの明示指定は残す。`danger: true` で初期フォーカスをキャンセル側へ置く要件があり、`<dialog>` の既定挙動（最初の focusable）と一致しないため。

フォーカス復帰の標準挙動はブラウザ実装に差がありうるため、E2E で実測し、期待どおりでなければ `returnFocusEl` を残す。

削減見込みは約 30 行。監査時の「約 80 行」は過大だった。

## 検証

| PR | 検証内容 |
|----|---------|
| 1 | `npm run build` の成功、`npx playwright test` 全件、`node scripts/extract-test-fixtures.ts` の実行、コミットフックの発火確認 |
| 2 | 各スクリプトを `--dry-run` で実行し、置換前と同じ対象を選ぶこと |
| 3 | `npm run typecheck`、`npm run coverage`（4 指標 95% 維持）、`npm run dev` での画面確認 |
| 4 | `npx playwright test`、Esc・Tab 巡回・背景クリック・フォーカス復帰の手動確認 |

## 検討した代替案

### 1 つの PR にまとめる

差分は独立しており、まとめれば ADR とレビューが 1 回で済む。しかし E2E に回帰が出たとき、ワークフロー変更・スクリプト整理・src 整理・ダイアログ書き換えのどれが原因か切り分けられない。切り戻しの単位が大きすぎるため却下した。

### 項目ごとに 13 本の PR に分ける

切り分けは最も細かくなるが、`parseCsv` の統合が型ストリップに依存するなど項目間に前提関係があり、順序制約を PR の依存として表現する手間が利益を上回る。性質ごとの 4 本を採った。

### `serve` を残す

`astro preview` と `serve` はどちらも Cloudflare Workers Static Assets ではなく、置き換えても本番忠実度は上がらない。しかし依存を 1 つ減らせるうえ、Astro のルーティング設定（`trailingSlash` / `build.format`）に従う分だけ配信の解釈は近くなる。E2E 全件が通ることを条件に置き換える。
