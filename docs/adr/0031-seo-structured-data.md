# 0031: SEO メタデータ／構造化データの強化

- 日付: 2026-06-27
- ステータス: 承認

## 背景

SEO の基礎（title / canonical / OGP / Twitter カード / `WebSite`・`Organization`・詳細ページの `BreadcrumbList` JSON-LD / サイトマップ / robots.txt / PWA / GTM）は実装済みだが、以下の改善余地があった。主目的は**検索流入・インデックス向上**（リッチリザルト狙いではない）。

1. 衣装詳細（最大2689ページ＝主要ページ群）に項目レベルの構造化データが無い
2. トップ・各一覧・各ツール計14ページが既定 description のまま
3. 一覧ページにコレクションを表す構造化データが無い
4. 一覧・ツールページにパンくずが無い

## 決定

上記4点を1つの SEO 強化として実装する。既存の `BaseLayout` の `jsonLd` / `breadcrumbs` prop に乗せ、共通処理は `src/lib/seo.ts`（`PAGE_DESCRIPTIONS` と `cardCreativeWorkLd` / `collectionPageLd` の純粋関数）に集約する。

- **衣装詳細**: `CreativeWork` JSON-LD を付与（`name` / `image` / `url` / `description` / `inLanguage` / `isPartOf` / `character` / `additionalProperty`）。
- **固有 description**: 14ページに手書きのキーワード入り description を設定。
- **一覧**: 衣装・楽曲・イベント一覧に `CollectionPage` JSON-LD を付与し、件数は `numberOfItems` で表現（全件は列挙しない）。
- **パンくず**: 一覧・ツールページに `breadcrumbs` を追加（`BreadcrumbList` と画面パンくずが付与される）。

## 検討した代替案

- **衣装を `Product` 型にする** — 商取引前提（価格/在庫）で警告リスクがあり検索流入目的に不適。意味的に正しい `CreativeWork` を採用。
- **description を自動生成** — 14ページ程度なら手書きの方が品質・キーワード最適化で勝るため手書きを採用。
- **一覧で `ItemList` を全件列挙** — 衣装2689件で JSON-LD が肥大しページ重量が増えるため、`CollectionPage` + `numberOfItems` に留める。
- **FAQPage を追加** — Google が2023年に多くのサイトで FAQ リッチリザルトを廃止しており ROI が低いため見送り。
- **関連衣装の相互リンク（内部リンク強化）** — 実装が重く効果が限定的なため今回は対象外とし、一覧パンくずの追加に留める。

設計詳細は [docs/superpowers/specs/2026-06-27-seo-structured-data-design.md](../superpowers/specs/2026-06-27-seo-structured-data-design.md) を参照。
