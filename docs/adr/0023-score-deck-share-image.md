# 0023: スコア計算の編成・スコアを画像で共有

- 日付: 2026-06-16
- ステータス: 承認

## 背景

スコア計算ページには編成シェア URL コピー（`deckShareUrl`）は既にあったが、SNS 等にそのまま貼れる画像での共有手段がなかった。イベント詳細では `EventShareImage`（`modern-screenshot` の `domToPng`）で DOM を PNG 化する仕組みが既にある。

## 決定

スコア計算ページに「📷 画像」ボタンを追加し、編成＋スコア表示領域を PNG としてダウンロードできるようにする。

- 既存依存 `modern-screenshot` の `domToPng` を流用（新規依存なし）
- キャプチャ対象は計算機ルート要素 `#score-share-target`（楽曲サマリー・オプション・デッキ編成・カード明細・結果を含む）
- 操作ボタン行とカード選択モーダルには `data-noshot` 属性を付け、`domToPng` の `filter` で画像から除外
- ファイル名は `i7-score-{曲名}.png`。空編成時は URL 共有と同じ `isDeckEmpty` ガードで抑止

## 検討した代替案

- **`EventShareImage` コンポーネントをそのまま設置** — ボタン意匠が大きく既存の小さな操作ボタン行と不揃いになるため、同じ `domToPng` ロジックを用いた小型ボタンを自前で追加
- **キャプチャ専用の整形パネルを別途用意** — MVP では実画面をそのまま撮る方式で十分。整形は今後の課題
- **Canvas で手描き** — 実装コストが高く、`domToPng` で実 DOM を撮れば十分なため不採用

詳細は [docs/superpowers/specs/2026-06-16-score-deck-share-image-design.md](../superpowers/specs/2026-06-16-score-deck-share-image-design.md) を参照。
