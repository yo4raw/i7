# i7 カードデータベース

アイドリッシュセブン（IDOLiSH7）のカード・楽曲データベースサイトです。

## サイト

<https://i7.yo4raw.com>

## 機能

- **カード一覧** - 全カードの検索・フィルタリング（レアリティ、属性、キャラクター、スキルタイプ）
- **カード詳細** - ステータス、APスキル、固有ブローチの表示
- **楽曲一覧** - 楽曲情報と属性比率の確認
- **楽曲詳細** - 楽曲の詳細情報表示
- **所持カード** - localStorage ベースの所持カード管理・一覧表示
- **スコア計算** - モンテカルロシミュレーションによるスコア計算

## 技術スタック

- [Astro](https://astro.build/) 6 - 静的サイトジェネレーター
- [Tailwind CSS](https://tailwindcss.com/) 4 - ユーティリティファーストCSS
- [htmx](https://htmx.org/) - 軽量なクライアントサイドインタラクション
- Google Sheets (GViz API) - データソース
- Cloudflare Pages - ホスティング
- [Playwright](https://playwright.dev/) - E2E テスト

## 開発

ローカルのホスト環境で直接実行します。Node.js は `.nvmrc` で 22 を指定:

```bash
npm install              # 依存関係のインストール
npm run dev              # 開発サーバー (http://localhost:4321)
npm run preview          # ビルド + ローカル配信 (http://localhost:4321)
npm run test             # Playwright E2E テスト
npm run test:unit        # Vitest 単体テスト

npx wrangler dev --port 8788  # Cloudflare Workers 挙動再現 (要: 事前に npm run build)
```

## デプロイ

Cloudflare Pages の Git 連携により main ブランチへの push で自動デプロイされます。データ鮮度のため6時間ごとに Deploy Hook 経由で自動リビルドも行われます。
