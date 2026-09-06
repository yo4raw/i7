# 0075 cron ワークフローの外部フェッチにリトライを組み込む

- ステータス: 承認
- 日付: 2026-09-06

## 文脈

毎時実行している 3 本のアセット自動取り込みワークフローのうち、2 本が外部サーバーの一時的な不調で失敗していた。直近 400 run の失敗内訳は次のとおり。

| ワークフロー | 失敗 / 総数 | 原因 |
| --- | --- | --- |
| Fetch new song images | 13 / 64 | 12 件は 2026-09-04 20:35 UTC 以降の毎時連続失敗。Miraheze の API が JSON ではなく HTML を返し、`res.json()` が `SyntaxError` で落ちる。1 件はロックファイル不整合 |
| Fetch event DB | 3 / 67 | `curl` の接続タイムアウト（10 秒）。一過性 |
| CI / Deploy | 6 / 49、2 / 28 | `package-lock.json` 不整合と optional dependency の欠落。決定的な失敗で解消済み |
| Fetch new card images（当時併存していた gap 版を含む） | 0 | 個別 ID の取得失敗は翌時間のギャップ埋めで自己修復する |

楽曲画像の HTML 応答はローカルで再現できた。User-Agent が空のリクエストに対して Miraheze は HTTP 403 の HTML ページ（"Something went wrong"）を返す。Node.js の `fetch` は User-Agent を `node` 固定で送っており、GitHub Actions のデータセンター IP と汎用 User-Agent の組み合わせでボット判定されている可能性が高い。既存の `fetchWithRetry` は非 2xx を 1 秒後に 1 回だけ再試行し、それでも非 2xx なら HTML 本文に `.json()` を呼んで例外になっていた。HTTP ステータスも本文もログに残らないため、失敗しても原因を特定できなかった。

## 決定

外部サーバーへのフェッチは**それぞれの実行環境が持つ標準機能で、ワークフロー 1 run の中で**リトライする。ジョブ全体の再実行や外部アクションは導入しない。

### Fetch event DB（`curl`）

`curl` 組み込みの `--retry 3 --retry-delay 10 --retry-connrefused` を付ける。タイムアウト・接続拒否・HTTP 408/429/5xx を最大 4 回試行し、最悪でも約 4 分で確定する。既存の HTTP ステータス・サイズ・ヘッダー検証はそのまま残す。

### Fetch new song images（`scripts/fetch-song-images.mjs`）

クローラー内の `fetchWithRetry` を廃止し、[0069](0069-ponytail-audit-cleanup.md) で並列制御と PNG 取得を集約した `scripts/lib/util.mjs` に `fetchRetry` を追加して置き換える。

- 記述的な User-Agent（連絡先としてリポジトリ URL を含む）を全リクエストに付ける。MediaWiki API の利用作法に沿う
- ネットワーク例外・非 2xx・（JSON を期待する呼び出しでは）JSON として解釈できない本文を、すべて失敗として扱う
- 2 秒 → 4 秒 → 8 秒の指数バックオフで最大 3 回再試行する
- 使い切ったら HTTP ステータス、Content-Type、本文先頭 200 字を含む `Error` を投げる。次に失敗した際はログから原因が読める

Wiki API（cargoquery / revisions / imageinfo）、Google Spreadsheet の GViz、画像ダウンロードの全呼び出しがこの関数を通る。既存の `fetchPng`（カード画像用。HTTP エラーはリトライせずステータスを返す契約）はそのまま残す。呼び出し側がステータスで分岐する `fetchPng` と、失敗なら例外で止まってよい `fetchRetry` は契約が異なり、無理に 1 つにすると両方の呼び出し側が複雑になる。

## 検討した代替案

### ジョブ単位の自動再実行（却下）

`nick-fields/retry` 等のアクションや、失敗時に `gh run rerun --failed` を呼ぶ方式。依存を増やすうえ、`npm ci` や checkout まで丸ごとやり直すため 1 回のリトライに数分かかる。フェッチだけを数秒待って再試行すれば足りる。

### カード画像ワークフローへも適用（見送り）

直近 400 run で失敗はゼロ。個別 ID の取得は `xargs -P 10` で最大 1500 件を並列に回すため、ここにリトライを乗せるとソースサーバー停止時に 1 run が数時間化する。取れなかった ID は翌時間のギャップ埋めが拾うので、リトライなしの現状が適切。失敗が観測された時点で改めて判断する。

### `continue-on-error` で失敗を隠す（却下）

失敗しても run は緑になるが、取り込みが止まったことに気づけなくなる。リトライを使い切った失敗は引き続き赤で見えるべき。

### 4xx は再試行しない（却下）

一般には 4xx は恒久的なエラーだが、今回まさに直したい事象が 403 のボット判定である。Wiki API と GViz が正当に 4xx を返す場面はなく、画像ダウンロードの 404 は稀なので、非 2xx をすべて再試行対象とする単純な規則にした。

## 影響

- `fetch-event-db.yml` の `curl` 1 行と、`scripts/fetch-song-images.mjs` のフェッチ経路が変わる。取り込みの成否判定・PR 作成・タグ採番は変更しない
- cron ワークフローはスクリプトを `main` から checkout するため、楽曲側の修正は `develop` へのマージだけでは効かず、リリースして `main` に載って初めて有効になる
- Miraheze が GitHub Actions の IP 帯そのものを弾いている場合は User-Agent を付けても失敗が続く。その場合は新しいエラーメッセージで状態を判別できるので、別 ADR で対処を決める
