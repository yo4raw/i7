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
| [0008](0008-event-detail-card-skill.md) | イベント詳細ページに特効衣装のスキルを表示する | 承認 |
| [0009](0009-song-note-breakdown.md) | 楽曲詳細ページにノーツ内訳を表示する | 承認 |
| [0010](0010-song-broach-score-ranking.md) | 楽曲詳細ページに共通ブローチ スコア寄与 TOP10 を表示する | 承認 |
| [0011](0011-song-detail-two-column.md) | 楽曲詳細の属性比率／ノーツ内訳を PC で横並びにする | 承認 |
| [0012](0012-highscore-event-ur-only.md) | ハイスコアイベントの特効衣装は UR のみ表示する | 承認 |
| [0013](0013-song-note-white-color-split.md) | 楽曲詳細のノーツ内訳で白ノーツ／色ノーツを分離表示する | 承認 |
| [0014](0014-bad-to-perfect-skill-label.md) | スキル種別ラベル「BAD以上をPerfectに変更」を「判定強化(BAD→Perfect)」に統一 | 承認 |
| [0015](0015-card-list-skill-effect.md) | 衣装一覧のリスト表示に最上位レベルのスキル効果文を表示する | 承認 |
| [0016](0016-card-compare-shrink-coverage.md) | 衣装比較 判定縮小タブの比較軸をカバー秒数／カバー率へ変更 | 承認 |
| [0017](0017-card-compare-shrink-attr-reference.md) | 衣装比較 判定縮小タブに属性値由来スコアを参考表示 | 承認 |
| [0018](0018-card-compare-scoreup-max-overlay.md) | 衣装比較 スコアアップタブに最大値を重ね、期待/最大ソートを追加 | 承認 |
| [0019](0019-home-page-dashboard-redesign.md) | トップページをダッシュボード型へフルリデザイン | 承認 |
| [0020](0020-abolish-dark-mode.md) | ダークモードの廃止（段階的） | 承認 |
| [0021](0021-event-songs-pinned-select.md) | 楽曲許可リストを「イベント対象楽曲」のピン留めに転換 | 承認 |
| [0022](0022-collection-dashboard.md) | 所持コレクションダッシュボードの追加 | 承認 |
| [0023](0023-score-deck-share-image.md) | スコア計算の編成・スコアを画像で共有 | 承認 |
| [0024](0024-card-compare-distribution.md) | 衣装比較 詳細パネルにスコア分布（二項分布）を追加 | 承認 |
| [0025](0025-deck-skill-distribution.md) | スコア計算画面に各衣装のスキル上乗せ分布チャートを追加 | 承認 |
| [0026](0026-card-compare-event-bonus-select.md) | 衣装比較のイベント特効反映をハイスコアイベント選択式へ変更 | 承認 |
| [0027](0027-card-compare-shrink-attribute-tiebreak.md) | 衣装比較 判定縮小タブの属性値タイブレーク化とカバー率用語統一 | 承認 |
| [0028](0028-card-compare-shrink-attribute-sort-dualbar.md) | 衣装比較 判定縮小タブに属性値由来スコア順ソートを追加しデュアルバー化 | 承認 |
| [0029](0029-max-finder-event-select.md) | 編成組合計算で過去のハイスコアイベントを選択可能にする | 承認 |
| [0030](0030-upgrade-astro7-svelte9.md) | astro 7 / @astrojs/svelte 9 へのメジャーアップグレードと CSS 圧縮の Vite 一本化 | 承認 |
| [0031](0031-seo-structured-data.md) | SEO メタデータ／構造化データの強化 | 承認 |
| [0032](0032-unit-test-coverage-gate.md) | 単体テストカバレッジ 95% ゲートを CI に導入 | 承認 |
| [0033](0033-webp-image-format.md) | コンテンツ画像を PNG から WebP へ全面移行 | 承認 |
| [0034](0034-llms-txt.md) | llms.txt の追加 | 承認 |
| [0035](0035-card-compare-broach-condition-notes.md) | 衣装比較で全属性編成ブローチを加算し条件付きブローチの前提を注記する | 承認 |
| [0036](0036-expected-score-rate-weighting.md) | 期待値スコアの縮小 rate 加重化と発動回数分母の実挙動統一 | 承認 |
| [0037](0037-parse-skill-input-hygiene.md) | 判定ガード・判定拡大スコアダウンのスコア計算除外と発動率クランプ | 承認 |
| [0038](0038-replace-rng-sfc32.md) | MC シミュレーションの乱数生成器を sfc32 へ差し替え | 承認 |
| [0039](0039-shared-broach-capacity-single-source.md) | 共有ブローチ容量ルールの単一ソース化と CardDetailTable の engine 出力化 | 承認 |
