# 0076 楽曲画像の取り込み cron を 6 時間おきに減らす

- ステータス: 承認
- 日付: 2026-09-06

## 文脈

[0075](0075-external-fetch-retry-policy.md) で `Fetch new song images` の失敗原因を「GitHub Actions の IP 帯 + 汎用 User-Agent によるボット判定」と推定し、連絡先入り User-Agent とリトライを入れて v1.81.0 でリリースした。直後に `workflow_dispatch` で実行したところ、新しい診断ログに次が出て失敗した。

```
4 回試行しても取得できません: https://idolish7.miraheze.org/w/api.php?action=cargoquery...
  HTTP 403 text/html; charset=UTF-8: <!DOCTYPE html> ... "Our systems have detected unusual traffic..."
```

User-Agent を正しく付けてもブロックされるため、原因は **Miraheze が GitHub Actions（Azure）の IP 帯そのものを自動ブロックしていること**で確定した。同じスクリプトは手元のマシンからは正常に完走する。run 内のリトライ（合計 14 秒）では解決せず、2026-09-04 20:35 UTC から毎時赤い run が積み上がっている。Miraheze の公式ドキュメントに cloud IP のブロック解除手順は見当たらない。

一方、楽曲ジャケット画像の追加は稀である。楽曲は現在 149 曲で、直近の追加は 2 曲。毎時チェックする必要はもともと薄い。

## 決定

**`fetch-new-songs.yml` の schedule を `0 * * * *`（毎時）から `0 */6 * * *`（6 時間おき、UTC 0/6/12/18 時 = JST 9/15/21/3 時）に変える。** 取得処理・PR 作成・タグ採番は変更しない。

- 失敗 run が 1 日 24 回から 4 回に減り、Actions の一覧で他のワークフローの状態が読みやすくなる
- Miraheze 側のブロックが解ければ、人手を介さず自動で復旧する（cron を止めると復旧に気づけない）
- 新曲が追加された場合でも、ブロックが解けていれば最長 6 時間以内に本番へ出る。楽曲ジャケットは衣装画像ほど即時性を求められない

## 検討した代替案

### 毎時のまま維持する（却下）

ブロックが続く限り 1 日 24 回失敗し続ける。取得頻度を上げても得るものがなく、失敗ログだけが増える。

### Miraheze のボットアカウントでログインして取得する（見送り）

認証済みリクエストならブロックを通る可能性はあるが、エッジ（WAF）で弾かれている場合は効かない。アカウント作成と BotPassword の Secret 登録が必要で、効果は試すまで分からない。6 時間おきにしても復旧しない状態が続いたら、改めて検討する。

### schedule を外して手動運用にする（見送り）

新曲が出たら手元で `node scripts/fetch-song-images.mjs` を実行して PR を出す運用。手元からは取得できることを確認済みで確実だが、新曲に気づく責任が人に移り、ブロックが解けても自動復旧しない。

### Miraheze にブロック解除を依頼する（見送り）

ブロックページに request ID を添えて報告する導線はあるが、GitHub Actions の IP は run ごとに変わるため、個別 IP の解除では恒久的に直らない。

## 影響

- `.github/workflows/fetch-new-songs.yml` の `cron` 1 行と、CLAUDE.md の cron 一覧の該当行が変わる
- `tag-release.yml` の `concurrency` による直列化は、起動時刻が重なる 0/6/12/18 時でも従来どおり効く
- ブロックが解けたかどうかは `gh run list --workflow fetch-new-songs.yml --limit 5` で確認できる。成功に戻っても schedule は 6 時間おきのままでよい
