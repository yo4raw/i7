# SEO メタデータ／構造化データ強化 設計

- 日付: 2026-06-27
- 目的: 検索流入・インデックス向上（リッチリザルト狙いではなく、クローラの理解促進と正しいインデックス、検索スニペット最適化）

## 背景

サイトの SEO 基礎（title / canonical / OGP / Twitter カード / `WebSite`・`Organization`・詳細ページの `BreadcrumbList` JSON-LD / サイトマップ / robots.txt / PWA / GTM）は実装済み。残る改善余地は以下。

1. 衣装詳細（最大2689ページ＝主要ページ群）に項目レベルの構造化データが無い（楽曲・イベントには有る）
2. トップ・各一覧・各ツール計14ページが既定 description のまま（ページ固有文言が無い）
3. 一覧ページにコレクションを表す構造化データが無い
4. 一覧・ツールページにパンくずが無い（現状は詳細ページのみ）

## 決定スコープ

上記4点を1つの SEO 強化として横断実装する。実装は既存の仕組み（`BaseLayout` の `jsonLd` / `breadcrumbs` prop、`JsonLd.astro` コンポーネント）に乗せ、新規の大きな抽象は作らない。

**見送り**: FAQPage 構造化データ。Google は2023年に多くのサイトで FAQ リッチリザルトを廃止しており、検索流入が主目的の本件では ROI が低い。関連衣装の相互リンク（内部リンク強化）も今回は対象外とし、一覧パンくずの追加に留める。

## 構成要素

### 共通モジュール `src/lib/seo.ts`

- `PAGE_DESCRIPTIONS`: ページキー → 固有 description（手書き・キーワード入り）の集中管理マップ。
- `cardCreativeWorkLd(card, siteUrl)`: 衣装の `CreativeWork` JSON-LD オブジェクトを返す純粋関数（画像・URL は絶対URL化）。
- `collectionPageLd({ name, url, description, numberOfItems })`: 一覧の `CollectionPage` JSON-LD を返す純粋関数。

純粋関数化することで Vitest 単体テスト可能にする。絶対URLが必要なため `siteUrl`（`Astro.site`）を引数で受け取る。

### A. 衣装詳細の構造化データ（#1）

`src/pages/cards/[id].astro` に `jsonLd={cardCreativeWorkLd(card, siteUrl)}` を追加。型は **`CreativeWork`**（販売物ではないコレクタブルなイラスト作品のため意味的に正しい。`Product` は商取引前提で Search Console 警告リスクのため不採用）。

プロパティ:
- `@type`: `CreativeWork`
- `name`: `card.cardname`
- `image`: フルサイズ画像の絶対URL（`cardImageUrl(card.ID)` を `siteUrl` で絶対化）
- `url`: 詳細ページ絶対URL
- `description`: 既存 `ogDescription`（レア×属性×キャラ（ユニット））
- `inLanguage`: `ja`
- `isPartOf`: `{ '@type': 'WebSite', name, url }`
- `character`: `{ '@type': 'Person', name: card.name }`（キャラ名がある場合）
- `additionalProperty`: レアリティ・属性を `PropertyValue` で（値がある場合のみ）

### B. ページ固有 description（#2）

既定文のままの14ページに `description={PAGE_DESCRIPTIONS['<key>']}` を渡す。対象: トップ / 楽曲一覧 / イベント一覧 / 衣装一覧 / 衣装比較 / スコア計算 / スコア計算 仕様解説 / 編成組合計算 / 所持衣装 / 保存デッキ / ラビットノート / 共通ブローチ / About / リリース履歴。各文はページ内容＋アイナナ関連キーワードを含む80〜120字程度。

### C. 一覧の構造化データ（#3）

衣装一覧・楽曲一覧・イベント一覧に `collectionPageLd(...)` を `jsonLd` で追加。`CollectionPage` を用い、件数は `numberOfItems` で表現する。**全件列挙はしない**（衣装2689件の巨大 JSON-LD によるページ肥大回避）。件数はビルド時に取得済みのデータ長から渡す。

### D. 一覧・ツールページのパンくず（#4）

パンくずが無いページに `breadcrumbs` prop を追加（`BreadcrumbList` JSON-LD が自動付与され、画面パンくずも表示される）。トップはホーム自身のため付与しない。スコア計算 仕様解説は「ホーム > スコア計算 > 仕様解説」の3階層。

## テスト

- **単体（Vitest）** `tests/unit/seo.test.ts`: `cardCreativeWorkLd` / `collectionPageLd` が期待の `@type`・必須プロパティ・絶対URLを返すこと、欠損フィールド（キャラ名・属性 null）で該当プロパティを出さないこと。
- **E2E（Playwright）** `tests/seo.test.ts`: トップに `WebSite`/`Organization`、衣装詳細に `CreativeWork`、衣装/楽曲/イベント一覧に `CollectionPage` の `script[type="application/ld+json"]` が存在することを検証。衣装詳細の id は `fetchCardsJson` の先頭から取得して動的に決定。
- ビルドで全ページ生成が壊れないこと、JSON-LD でページが肥大しないことを確認。

## 影響範囲

主に `.astro` ページ群と新規 `src/lib/seo.ts`。`BaseLayout` は変更不要（既存 prop を使うのみ）。スコア計算等のロジックには触れない。低リスク。

## 検討した代替案

- **衣装を `Product` 型にする** — リッチリザルト候補だが商取引前提で価格/在庫が無く警告リスク。検索流入目的には不適。不採用。
- **description を自動生成** — 14ページ程度なら手書きの方が品質・キーワード最適化で勝るため手書きを採用。
- **一覧で全 `ItemList` を列挙** — 2689件で JSON-LD が肥大しページ重量増。`CollectionPage` + `numberOfItems` に留める。
- **FAQPage 追加** — リッチリザルト廃止済みで ROI 低。見送り。
