# スコア計算 編成・スコアの画像共有 設計

- 日付: 2026-06-16
- 関連 ADR: [0023](../../adr/0023-score-deck-share-image.md)

## 目的

スコア計算ページの編成＋スコアを PNG 画像として保存し、SNS 等で共有できるようにする。URL 共有（`deckShareUrl` の「🔗 URLコピー」）は既存のため、本件は画像共有のみを追加する。

## 実装

`ScoreCalc.svelte` に追加:
- 計算機ルート `<div>` に `id="score-share-target"` を付与（楽曲サマリー・オプション・デッキ編成・カード明細・結果を含む）
- 操作ボタン行 `<div class="relative flex gap-2">` と `CardPickerModal` ラッパに `data-noshot` 属性
- `📷 画像` ボタン（`#btn-share-image`）を URL コピーボタンの隣に追加
- `shareDeckImage()`:
  - 空編成は `isDeckEmpty(buildStateObject())` で抑止（URL 共有と同一ガード）
  - `modern-screenshot` の `domToPng(node, { scale: 2, backgroundColor: '#fff', filter })` で生成。`filter` は `data-noshot` を持つ要素を除外
  - `i7-score-{曲名}.png` としてダウンロード。`imageBusy` で二重実行防止

新規依存なし（`modern-screenshot` は `EventShareImage` で既に使用）。

## 検証結果

- `astro check` 0 errors
- dev サーバーで `#btn-share-image` クリック → `domToPng` が `data:image/png`（約1MB）を生成し `i7-score-{曲名}.png` のダウンロードが発火、操作ボタン行（`data-noshot`）が除外されることを `evaluate_script` で確認
- 初回失敗は dev の Vite 依存再最適化 504（`modern-screenshot`）によるもので、dev 再起動後に成功。コード起因ではない
