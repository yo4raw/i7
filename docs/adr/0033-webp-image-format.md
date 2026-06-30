# 0033: コンテンツ画像を PNG から WebP へ全面移行

- 日付: 2026-06-30
- ステータス: 承認

## 背景

サイトのコンテンツ画像（フルカード `public/assets/cards/`・サムネ `public/assets/th_cards/`・楽曲ジャケット `public/assets/songs/`）はすべて PNG で、working tree 合計が約 3.5GB（フルカード 3.1GB / サムネ 357MB / 楽曲 44MB）に達していた。`dist/` のビルド成果物・Cloudflare デプロイ・ページ転送量が肥大していた。

サンプル変換の実測では、フルカード PNG 約 1,200KB に対し lossy q85 で約 100KB（92% 減）、ロスレス WebP で約 950KB（20% 減）。サムネは q85 で約 85% 減、楽曲は q85 で約 50% 減。

## 決定

コンテンツ画像を WebP 単一形式へ全面移行し、PNG は working tree から削除する（`<picture>` フォールバックは設けない。WebP は現行ブラウザで普遍的にサポートされるため）。

品質は種別ごとに変える:

- **フルカード `cards/`: ロスレス WebP**（劣化ゼロ）。高解像度のカードイラストの画質を最優先する。削減幅は約 20% に留まるが意図的なトレードオフ。
- **サムネ `th_cards/` / 楽曲 `songs/`: lossy WebP q85**。小サイズで劣化が視認できないため強圧縮で稼ぐ。

実装の要点:

- 参照側は `src/lib/ui.ts` の `cardImageUrl` / `cardThumbUrl` / `songImageUrl` の拡張子を `.webp` に変更。og:image・JSON-LD・各 `<img>` はすべてこのヘルパー経由のため一括で追従する。
- 既存画像は共通スクリプト `scripts/png-to-webp.mjs`（sharp、品質モード切替・冪等）で一括変換し PNG を削除する。同スクリプトを GHA フェッチワークフローからも再利用する。
- ソースサーバー（`i7.step-on-dream.net`）と IDOLiSH7 Wiki は PNG 配信のため、フェッチ系ワークフロー（`fetch-new-cards.yml` / `fetch-gap-cards.yml` / `fetch-new-songs.yml`）は「PNG 取得 → WebP 変換 → PNG 破棄」とする。
- og:image / 構造化データも WebP で配信する。

GitHub の push 制限（1 ファイル 100MiB・1 push 約 2GiB 超で拒否）に対し、フルカード約 2.4GB はコミットを容量チャンクに分割し各 push を 2GiB 未満に抑える「チャンク push + 単一 PR（原子的マージ）」で投入する。

## 検討した代替案

- **全画像 lossy q85** — リポジトリ約 330MB（90% 減）と最大の削減幅。フルカードのイラスト画質劣化を避けるため、フルカードのみロスレスに変更して却下（サムネ・楽曲は q85 採用）。
- **PNG と WebP を `<picture>` で併存** — フォールバックで安全だが、ストレージが倍増し削減目的に反するため却下。
- **og:image だけ PNG を維持** — LINE 等一部 SNS のリンクプレビュー互換のため。ただし og はフルカード画像を参照するため、維持するとフルカード PNG（最大の削減対象）を残すことになり効果が大きく削がれる。WebP の OGP は主要プラットフォームで表示されるため、WebP 統一を採用し一部プラットフォームでのプレビュー画像非表示（機能破壊ではない）を許容する。
- **`.git` 履歴のリライト（filter-repo 等）で過去 PNG を除去** — clone サイズ削減には有効だが、強制 push と全 fork/clone への影響が大きい。本移行は配信サイズ削減を目的とし、履歴リライトは将来の別タスクとして見送る（履歴には旧 PNG と新 WebP の双方が残り `.git` は一時的に肥大する）。

設計詳細は [docs/superpowers/specs/2026-06-30-webp-migration-design.md](../superpowers/specs/2026-06-30-webp-migration-design.md) を参照。
