# 0055 E2E のハイドレート待ちを Playwright フィクスチャへ集約する

- ステータス: 承認
- 日付: 2026-08-21

## 文脈

E2E スイートに、**単独では通るが並列実行時だけ落ちる**フレークが慢性的に存在していた。落ちるテストは実行のたびに入れ替わり、`event-detail` / `shared-broach` / `score-calc` / `max-score-finder` などで観測された。実測では 4 回中 3 回のフルスイート実行で 1 件が落ちていた。

代表的な失敗は次の形をしている。

```
Locator:  locator('input[data-broach-input="1"]')
Expected: "2"
Received: "1"
```

`+` ボタンを 2 回押しているのに 1 回しか反映されていない。原因は **`client:load` の Astro 島がハイドレートし終える前にクリックしていた**こと。ハイドレート前の要素にはイベントハンドラが登録されていないため、クリックが握り潰される。マシン負荷が高い（= Playwright が複数ワーカーで並列実行している）ときだけ顕在化するため、フレークとして現れていた。

このパターンは `page.goto` / `page.reload` の直後に操作するテストすべてに潜在しており、対象は 19 ファイル・57 箇所に及ぶ。個々のテストに待機を書き足す方式では、書き漏らしと将来の再発を防げない。

あわせて、CPU バウンドな処理（`max-score-finder` の総当たり探索、`score-calc` の MC シミュレーション）が、並列実行時のコアの奪い合いで既定タイムアウトを超過する問題も観測された。ブラウザごとに `navigator.hardwareConcurrency` 分の Web Worker が起動するため、コア数を大きく超過する。

## 決定

1. **`page.goto` / `page.reload` の直後に自動でハイドレート完了を待つ Playwright フィクスチャを導入する。** `tests/helpers/fixtures.ts` が `page` を拡張し、遷移メソッドをラップして `astro-island[ssr]` が 0 件になるまで待つ。Astro の島はハイドレート完了時に `ssr` 属性を外すため、これが完了判定として使える。

2. **E2E テストは `@playwright/test` ではなく `tests/helpers/fixtures.ts` から `test` / `expect` を import する。** 既存 19 ファイルすべてを切り替えた。新規テストもこれに従うこと。型のみの import（`type Page` など）は `@playwright/test` から直接で構わない。

3. **CPU バウンドなテストは、単独実行時の所要時間ではなく枯渇時の最悪値にタイムアウトを合わせる。** `max-score-finder` はテスト 420 秒 / 探索完了 360 秒、`score-calc` はテスト 180 秒 / MC 完了 120 秒とする。`playwright.config.ts` の既定 30 秒では並列実行時に足りない。

## 検討した代替案

### 個々のテストに `waitForHydration(page)` を書き足す（却下）

対象が 19 ファイル・57 箇所あり、書き漏らしが避けられない。新規テストでも同じ事故が繰り返される。フィクスチャなら遷移のたびに必ず適用され、利用側は何も意識しなくてよい。

### Playwright のワーカー数を減らす（却下）

`workers` を絞ればコアの奪い合いは緩和されるが、ハイドレート競合そのものは解消しない（ワーカー 1 でも遅いマシンでは起こりうる）。スイート全体の実行時間も伸びる。

### アプリ側の Web Worker プール数を `hardwareConcurrency - 1` に絞る（見送り → 不要と判明）

コアを全部占有すると UI スレッドが飢えるため、実ユーザーにとっても改善になりうると考えて見送っていた。

**訂正: この前提は誤りだった。** [0056](0056-worker-pool-sizing.md) の調査により、総当たり探索の worker 数は既に `min(8, hardwareConcurrency - 1, chunks.length)` で上限が掛かっており、MC シミュレーションはそもそも Worker を使っていない（メインスレッドで `MC_CHUNK_SIZE` ごとに制御を返す）ことが判明した。アプリ側に変更すべき点は無く、E2E で観測した枯渇は Playwright が複数ブラウザを同時に走らせるテスト環境固有の事象である。

## 影響

- `tests/helpers/fixtures.ts` を新設し、`test` / `expect` / `waitForHydration` を公開する。
- `tests/*.test.ts` 19 ファイルの import を切り替える。
- `tests/max-score-finder.test.ts` / `tests/score-calc.test.ts` のタイムアウトを引き上げる。
- 効果: フルスイート 5 回連続で 73 passed / 0 failed（22〜28 秒）。修正前は 4 回中 3 回で 1 件が落ちていた。
