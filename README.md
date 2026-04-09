# i7 カードデータベース

アイドリッシュセブン（IDOLiSH7）のカード・楽曲データベースサイトです。

## サイト

https://yo4raw.github.io/i7/

## 機能

- **カード一覧** - 全カードの検索・フィルタリング（レアリティ、属性、キャラクター、スキルタイプ）
- **カード詳細** - ステータス、APスキル、固有ブローチの表示
- **楽曲一覧** - 楽曲情報と属性比率の確認

## 技術スタック

- [Astro](https://astro.build/) 6 - 静的サイトジェネレーター
- [Tailwind CSS](https://tailwindcss.com/) 4 - ユーティリティファーストCSS
- Google Sheets (GViz API) - データソース
- GitHub Pages - ホスティング

## 開発

```bash
npm install     # 依存関係のインストール
npm run dev     # 開発サーバー起動
npm run build   # 本番ビルド
npm run preview # ビルドプレビュー
```

## デプロイ

バージョンタグ（`v1.0.0` 等）の push で GitHub Actions により自動デプロイされます。データ鮮度のため6時間ごとに自動リビルドも行われます。
