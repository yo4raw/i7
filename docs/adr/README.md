# Architecture Decision Records (ADR)

設計・仕様に関する意思決定の記録。決定の背景と理由を後から追えるようにする。

## 運用ルール

- ファイル名: `NNNN-<kebab-case-title>.md`（連番 4 桁）
- ステータス: `提案` → `承認` → 実装後も記録は残す。覆った場合は `却下` / `破棄` に更新し、理由を追記する
- 1 ADR = 1 つの意思決定。実装の詳細ではなく「何を・なぜ決めたか」を書く

## 一覧

| 番号 | タイトル | ステータス |
| ---- | -------- | ---------- |
| [0001](0001-reject-glassmorphism-redesign.md) | グラスモーフィズム全面リデザインの破棄 | 破棄 |
| [0002](0002-fixed-broach-in-max-score-finder.md) | 編成組合計算における固定ブローチの扱い | 承認（現状確認） |
| [0003](0003-shrink-min-two-or-more.md) | 判定縮小条件を「ちょうど2枚」から「2枚以上」へ | 承認 |
| [0004](0004-shared-broach-registration.md) | 共通ブローチ所持登録とスコア計算・編成探索への反映方針 | 承認 |
| [0005](0005-checkbox-filter-ui.md) | 衣装一覧フィルタを select multiple からチップ+折りたたみへ | 承認 |
| [0006](0006-event-share-dense-layout.md) | イベント SNS 共有パネルを高密度レイアウトへ | 承認 |
| [0007](0007-card-compare-page.md) | 衣装比較ページの新設とスキル種別ごとの比較軸 | 承認 |
