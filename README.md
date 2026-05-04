# i7マネ部屋(β)

アイドリッシュセブン（IDOLiSH7）の衣装・楽曲データベースサイトです。

## サイト

<https://i7.yo4raw.com>

## 機能

- **衣装一覧** - 全衣装の検索・フィルタリング（レアリティ、属性、キャラクター、スキルタイプ）・開催中イベントの特効表示
- **衣装詳細** - ステータス、APスキル、固有ブローチの表示
- **楽曲一覧** - 楽曲情報と属性比率の確認
- **楽曲詳細** - 楽曲の詳細情報表示
- **所持衣装** - localStorage ベースの所持衣装管理・一覧表示
- **スコア計算** - モンテカルロシミュレーションによるスコア計算（開催中イベントの特効を自動反映）
- **保存デッキ** - localStorage ベースのデッキ構成保存・呼び出し
- **イベント一覧 / 詳細** - ボーナス特効衣装・期間などの確認
- **ラビットノート** - 共有ブローチ等の固定データ表示
- **データのエクスポート/インポート** - 所持衣装・保存デッキ等の localStorage データをまとめて JSON ファイルとしてバックアップ・復元（端末間移行用、フッターから利用可）

## 技術スタック

- [Astro](https://astro.build/) 6 - 静的サイトジェネレーター
- [Svelte](https://svelte.dev/) 5 - クライアントサイド UI コンポーネント
- [Tailwind CSS](https://tailwindcss.com/) 4 - ユーティリティファースト CSS（`@tailwindcss/vite` プラグイン）
- Google Sheets (GViz API) - マスターデータのデータソース
- Cloudflare Workers (Static Assets) - ホスティング
- [Playwright](https://playwright.dev/) - E2E テスト
- [Vitest](https://vitest.dev/) - 単体テスト

## 開発

ローカル環境はホスト上で直接 npm scripts を実行します（Docker は使用しません）:

```bash
npm install              # 依存関係のインストール
npm run dev              # 開発サーバー (http://localhost:4321)
npm run build            # 本番ビルド (dist/ に出力)
npm run preview          # ビルド + ローカル配信 (http://localhost:4321)
npm run test             # Playwright E2E テスト
npm run test:unit        # Vitest 単体テスト
```

Node.js は `.nvmrc` で 22 を指定。事前に `nvm use` 等でホスト環境に Node.js 22 を用意してください。

## デプロイ

Cloudflare Workers (Static Assets) にデプロイしています（公開 URL: <https://i7.yo4raw.com>）。静的アセットのみの Worker のためリクエスト課金対象外です。

- `v*` タグの push または GitHub Actions の `Deploy to Cloudflare Workers` ワークフロー手動実行で `wrangler deploy` が走ります
- リリース手順: `git tag v1.x.x && git push origin v1.x.x` — `release.yml` が GitHub Release を作成し、同時に `deploy.yml` が Cloudflare Workers へデプロイ
- スプレッドシートのマスターデータ反映などタグ発行なしで再デプロイしたい場合は、Actions タブから `Deploy to Cloudflare Workers` を手動実行してください

## データ自動取得

ゲームサーバーから GitHub Actions の cron ワークフローで画像・イベント DB を定期取得し、PR として追加します:

| ワークフロー | スケジュール (UTC) | 内容 |
|-------------|-------------------|------|
| `fetch-new-cards.yml` | 03:00 | 新規衣装画像の前方スキャン + ギャップ埋め |
| `fetch-new-th-cards.yml` | 04:00 | サムネイル画像のバックフィル・同期 |
| `fetch-gap-cards.yml` | 05:00 | 衣装 ID ギャップの補完 |
| `fetch-event-db.yml` | 19:00 (JST 04:00) | イベント DB CSV を `public/events/events.csv` に取得 |
