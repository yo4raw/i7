# 0069 over-engineering 監査に基づく削減（カバレッジゲートと GSAP は現状維持、cron 直 push は却下）

- ステータス: 承認
- 日付: 2026-09-02

## 文脈

リポジトリ全体を over-engineering の観点で走査し、削除・統合・標準機能への置換の候補を 17 件挙げた。候補には、過去の ADR が意図して選んだ構成を覆すものが含まれていたため、実施前に一件ずつ既存 ADR と突き合わせた。

## 決定

### 1. カバレッジゲート（ADR 0032）は現状維持とする

`src/lib/**` に対する 4 指標 95% のしきい値を維持する。

このゲートを緩めれば `*Branches.test.ts` 群 2,164 行、テスト専用の export 約 50 個、`/* v8 ignore */` 23 箇所が削除できる。しかし ADR 0032 は「可視化のみでゲートなし」「Branches だけ別しきい値」「分母を score/ に限定」の 3 案をいずれも検討したうえで却下しており、スコア計算エンジンの回帰をテスト追加忘れで素通りさせないという目的は今も有効である。それらのテスト行数は over-engineering ではなく意図した投資と見なす。

**この決定は本 ADR で実施する他のすべての変更の制約になる。** 変更後も 4 指標 95% を維持する。結果として、テストが直接検証している export は un-export できず、デッドエクスポートの削減対象は当初候補より大幅に狭くなる。

### 2. GSAP（ADR 0054）は現状維持とする

トップページ専用の GSAP を維持する。ADR 0054 は「WAAPI + IntersectionObserver で自作する」案を検討し、シーケンス制御とカウントアップのイージングを自前で書く 100 行程度の実装と保守を抱えることを理由に却下している。依存はトップページ専用チャンクに閉じており、他 2,778 ページへの追加ペイロードは 0 バイトである。

### 3. cron の取り込みを main 直 push にする案は却下する

毎時の取り込み 4 本が PR を作って即マージしている構成を、`main` への直 push に置き換える案を検討し、却下した。

4 本はすべて `0 * * * *` で起動し `concurrency` ガードを持たない。現在は PR 経由のため GitHub 側がマージを直列化しているが、直 push にすると 4 本が同時に `main` を叩き 3 本が non-fast-forward で失敗する。`concurrency` で直列化しても待機枠は 1 本ぶんで残りはキャンセルされ、取り込み漏れになる。回避には rebase リトライループの自作が要る。

削減 68 行に対して、自作の競合処理を毎時の本番公開経路へ持ち込む取引であり、`peter-evans/create-pull-request` が吸収している価値のほうが大きい。

### 4. `fetch-gap-cards.yml` を削除する

カード画像は ID 2〜3892 で、`cards` に 483 件の欠落がある。`fetch-new-cards.yml` のギャップ判定は `cards ∩ th` の補集合を取るため、この 483 件をすべて拾う。`fetch-gap-cards.yml` の対象はその真部分集合であり、差は ID 1 のみで、その ID は両ディレクトリにもソース側にも存在しない。

### 5. `serve` を `astro preview` へ置き換える

`output: 'static'` かつ adapter なしのため、Astro の組み込みプレビューサーバーが `dist/` を配信する。どちらも Cloudflare Workers Static Assets そのものではないため本番忠実度は変わらないが、依存を 1 つ減らせる。E2E 全件が通ることを条件とする。

### 6. `tsx` を Node の型ストリップへ置き換える

`tsx` の用途は `scripts/extract-test-fixtures.ts` 1 本のみ。Node の型ストリップは拡張子なしの相対 import を解決せず、JSON の既定 import に import attributes を要求するが、該当は依存グラフ全体で 2 箇所だけだった（`fetchCardsJson.ts` の `'../constants'` と `fetchSongsJson.ts` の JSON import）。どちらも Vite と Astro で問題なく、同ディレクトリの `'./gviz.ts'` に拡張子付き import の実績がある。`src` 全体に 352 箇所ある拡張子なし import は触らない。

型ストリップが既定で有効になったのは Node 22.18.0 である。`.nvmrc`（`22`）と CI の `node-version: 22` はどちらも最新の 22.x を解決するためこの下限を満たしており、変更しない。

### 7. `husky` と `lint-staged` を除去する

`prepare` を `git config core.hooksPath .husky` に置き換え、`.husky/pre-commit` を oxlint の全体実行にする。oxlint は Rust 製で全体走査も十分速く、変更ファイルだけを渡す仕組みを別依存で持つ必要がない。`.husky/commit-msg`（ADR 0066）はそのまま維持する。

### 8. ネイティブ `<dialog>` へ移行する

詳細は ADR 0048 への追記に記す。

### 9. その他のコード整理を行う

手書き引数パーサの `node:util` `parseArgs` 化、並列制御とリトライフェッチの重複統合、`setTimeout` の `node:timers/promises` 化、`parseCsv` の二重実装解消、残り時間フォーマッタ 4 実装の統合、所持数ストア 2 本の factory 化、`CardListItem` の削除、呼び出し側が渡さない引数の削除。

## 検討した代替案

上記 1〜3 が、検討のうえ採用しなかった案そのものである。加えて次を検討した。

### 変更を 1 つの PR にまとめる

ADR とレビューが 1 回で済むが、E2E に回帰が出たときにワークフロー変更・スクリプト整理・src 整理・ダイアログ書き換えのどれが原因か切り分けられない。性質ごとに 4 本へ分ける。

## 影響

- `.github/workflows/fetch-gap-cards.yml` を削除する。
- `package.json` から `serve`・`tsx`・`husky`・`lint-staged` を除き、`lint-staged` 設定ブロックも削る。
- `playwright.config.ts` の `webServer.command` を変更する。
- `scripts/lib/util.mjs` を新設する。
- `CLAUDE.md` の「`npm run preview` は本番配信を再現する」という記述を実態に合わせて改め、Node の下限（22.18.0）を追記する。
- 設計の詳細は [docs/superpowers/specs/2026-09-02-ponytail-audit-cleanup-design.md](../superpowers/specs/2026-09-02-ponytail-audit-cleanup-design.md) を参照。
