# 0063 クローラーの到達性を確保する（フッターのリンク集・lastmod・IndexNow）

- ステータス: 承認
- 日付: 2026-08-31

## 文脈

ADR 0057 でインデックス対象を 246 ページへ絞ったが、リリース 10 日後の Search Console 実測で状況が動いていないことが分かった（実測値は ADR 0057「事後の実測」に記載）。

- Google が認識しているのはサイト全体で **4 ページのみ**、インデックス登録済みは **0** 件
- `/score-calc/spec/`（独自テキスト 14,554 文字の最重要ページ）を含むツールページの大半が「URL が Google に認識されていません」= 未クロール

ADR 0057 は「技術的な阻害要因は無い」と結論づけたが、`noindex` / canonical / HTTP ステータスだけを見ており、**内部リンクを調べていなかった**。改めて実測すると、クローラーがページへ到達できない経路上の問題が見つかった。

### グローバルナビのリンクが静的 HTML に出力されていない

`HeaderNav.svelte` のドロップダウン子リンクは `{#if openDropdown === item.label}` の内側にある。`client:load` の SSR 出力にも初期状態が反映されるため、**リンクが 1 本も HTML に含まれない**。クローラーはドロップダウンを開かないので、これらのページは内部リンクとして発見されない。

| ページ | ナビ以外のリンク元 | Search Console の状態 |
| --- | --- | --- |
| `/point-calc/` | **なし（完全に孤立）** | 未認識 |
| `/rabbit-note/` `/shared-broach/` | トップ本文のみ | — |
| `/score-calc/` `/max-score-finder/` `/card-compare/` | トップ本文にあり | `/score-calc/` のみクロール済み |

実測とも整合する。トップ本文からリンクのある `/score-calc/` はクロールされ、リンクの無い `/point-calc/` は未認識だった。

### 独自性の高いページほどリンクが薄い

- `/score-calc/spec/` への内部リンクはサイト全体で **1 本だけ**（`/score-calc/` から）
- `/about/` は **どこからもリンクされていない**（sitemap にのみ存在）

### sitemap に lastmod が無い

`changefreq` と `priority` しか出力していなかった。Google はこの 2 つを使わないと明言している一方、`lastmod` は再クロールの判断に使う。実際、送信済み sitemap は 2 か月間読み直されていなかった。

## 決定

### 1. フッターにサイト内リンク集を置く

`BaseLayout.astro` のフッターに、sitemap に載せている静的 11 ページへの静的リンクを置く。定義は `src/lib/constants.ts` の `SITE_LINKS` に集約し、sitemap の対象と 1:1 で対応させる。

全ページの静的 HTML に出るため、クローラーはどのページから入っても全ツールページへ到達できる。`/score-calc/spec/` と `/about/` の孤立も同時に解消する。

**`HeaderNav.svelte` には手を触れない。** ドロップダウンを常時 DOM 出力にすると `materialIn` / `materialOut`（ADR 0046 のモーション規約）を壊す。フッターのリンク集なら規約に触れずに同じ到達性が得られる。

`noindex` のページ（`/mycard/` `/decks/` `/rabbit-note/` `/shared-broach/`）は含めない。検索評価の面で意味がなく、リンク先を薄めるため。

### 2. sitemap に git 由来の lastmod を出力する

**ビルド日時は使わない。** 毎時ビルドされるため 246 ページ全部が毎回「更新された」ことになり、嘘のシグナルとして `lastmod` 自体が無視される。代わりに、ページの内容を決めているソースファイルの **git 最終コミット日**（committer date）を使う。

| URL | lastmod のソース | 件数 |
| --- | --- | --- |
| 静的ページ | 各ページの `.astro` | 11 |
| `/events/{id}/` | `public/events/events.csv` | 88 |
| `/songs/{id}/` | `src/pages/songs/[id].astro` | 147 |

楽曲データは GViz のクライアントフェッチでビルド時に持たないため、楽曲詳細の `lastmod` は「その静的 HTML が最後に変わった日」= テンプレートの更新日になる。`lastmod` の定義としてはこれで正しい。

`git log` の結果はファイル単位でキャッシュする。CI / deploy とも `fetch-depth: 0` なので履歴は取れるが、git が無い環境ではファイルの mtime で代替する。

### 3. IndexNow で Bing / DuckDuckGo へ通知する

Google のクロールが枯れている以上、別経路のインデックスを確保する価値が相対的に大きい。`public/<32桁hex>.txt` にキーを置き、デプロイ後に sitemap の URL 一覧を IndexNow API へ送る。

**毎時の cron 取り込みでは送らない。** 246 URL を毎時通知するのは IndexNow のガイドライン上スパムとみなされうる。ADR 0059 でタグは「人手のリリース = MINOR（`vX.Y.0`）／ cron = PATCH」と分かれているため、**タグが `vX.Y.0` のときだけ送信**する。

通知の失敗でデプロイ結果は覆さない（`continue-on-error`）。

**送信前にキーファイルの配信を確認する。** v1.65.0 のリリースで、デプロイ直後に送ったところ IndexNow が `403 SiteVerificationNotCompleted` を返した。Cloudflare へのデプロイ完了からアセットが行き渡るまでにラグがあり、所有証明のためのキーファイル取得が失敗したためである。キーファイルが本番から 200 で返り中身も一致することを確認してから送り、それでも検証が伝播していなければ間隔を空けて再送する。配信が確認できないまま送らない。

## 検討した代替案

### HeaderNav のドロップダウンを常時 DOM 出力にする（却下）

リンクを初期 HTML に出す最も直接的な方法だが、`{#if}` を外すと `svelte/transition` の `materialIn` / `materialOut` が要素の mount / unmount に紐づかなくなり、ADR 0046 のモーション規約を壊す。加えて、閉じているドロップダウンを `aria-hidden` で隠す扱いが必要になり、アクセシビリティの実装が複雑になる。フッターのリンク集で同じ到達性が得られるため採らない。

### lastmod にビルド日時を入れる（却下）

実装は最も簡単だが、毎時ビルドで全ページが毎回更新扱いになる。Google は `lastmod` の正確性を評価しており、信用できないと判断されると無視される。再クロールを促すという本来の目的に逆行する。

### 全 URL を毎デプロイで IndexNow に送る（却下）

cron を含めると毎時 246 URL の通知になる。IndexNow は「変更があった URL を通知する」仕組みで、実際には変わっていない URL を繰り返し送るのは想定された使い方ではない。

### robots.txt や sitemap をさらに調整する（見送り）

クロール量そのものが割り当てられていない現状では、申告の仕方を変えても効果は見込めない。ADR 0057 の「事後の実測」に記したとおり、本質的な解決は被リンクの獲得である。

## 影響

- `src/lib/constants.ts` に `SITE_LINKS` を追加。
- `src/layouts/BaseLayout.astro` のフッターにリンク集を描画。
- `astro.config.mjs` の `serialize` で `lastmod` を出力（`lastmodOf` / `sourceOf`）。
- `scripts/notify-indexnow.mjs` を追加し、`.github/workflows/deploy.yml` から呼ぶ。
- `public/<key>.txt` に IndexNow のキーを配置。キーは所有証明のため公開される前提のもので、秘密情報ではない。
- `tests/seo.test.ts` にフッターリンクの到達性、`lastmod`、IndexNow キーファイルの配信の検証を追加。キーファイルが 404 だと所有証明が通らず通知が全て拒否されるが、デプロイは成功したように見えるため、テストで守る。

## 残る課題

- **Bing Webmaster Tools への登録は人手が必要。** Search Console からインポートできる。IndexNow の通知はサイト所有者の登録が無くても受理されるが、登録すればインデックス状況を確認できるようになる。
- **被リンクが無い。** ADR 0057 から引き続き、これが本質的な制約である。本 ADR は「クローラーが来たときに正しく辿れる状態にしておく」ための施策であり、クロール量そのものを増やすものではない。
