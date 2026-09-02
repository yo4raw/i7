# i7マネ部屋

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
- **ラビットノート** - 共通ブローチ等の固定データ表示
- **衣装比較** - スキル種別ごとの比較軸で衣装を並べ、スコア寄与や判定縮小カバー率を比較
- **編成組合計算** - 理論値が最大になる編成を総当たりで探索（所持衣装の枚数を上限とする縛りモードあり）
- **ポイント芸計算** - 目標ポイントに対する編成・消費の最適解をソルバーで算出
- **共通ブローチ** - 共通ブローチの所持数登録
- **スコア計算 仕様解説** - スコア計算パイプラインの各段階を図解
- **リリース履歴** - git タグごとの変更点を自動生成して表示
- **About** - サイトの説明・謝辞
- **データのエクスポート/インポート** - 所持衣装・保存デッキ等の localStorage データをまとめて JSON ファイルとしてバックアップ・復元（端末間移行用、フッターから利用可）

## 技術スタック

- [Astro](https://astro.build/) 7 - 静的サイトジェネレーター
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
npm run typecheck        # 型チェック
npm run lint             # oxlint
npm run coverage         # 単体テストカバレッジ（src/lib、4 指標いずれか 95% 未満で fail）
```

Node.js は `.nvmrc` で 22 を指定。事前に `nvm use` 等でホスト環境に Node.js 22 を用意してください。

PR では `typecheck` / `coverage` / `build` / `lint` が CI で実行されます（`.github/workflows/ci.yml`）。E2E は CI では実行しません。

## ブランチ戦略

簡易 Git Flow で運用しています（[ADR 0052](docs/adr/0052-adopt-git-flow.md)）。`main` の不変条件は **「常にリリース済み（本番にデプロイ済み）」** です。

| ブランチ | 役割 |
|---------|------|
| `main` | 常にリリース済み |
| `develop` | 統合ブランチ（default branch）。人手の変更はここに溜める |
| `feat/` `fix/` `chore/` ほか | `develop` から切って `develop` へ PR |
| `hotfix/` | `main` から切って `main` へ PR（本番の緊急修正） |
| `auto/` | cron の自動取り込み。`main` 直行の例外 |

`main` への push は `sync-main-to-develop.yml` が `develop` へ自動 back-merge するため、`main` は常に `develop` の祖先に保たれます。

## デプロイ

Cloudflare Workers (Static Assets) にデプロイしています（公開 URL: <https://i7.yo4raw.com>）。静的アセットのみの Worker のためリクエスト課金対象外です。

- `v*` タグの push で `release.yml` が GitHub Release を作成し、同時に `deploy.yml` が `wrangler deploy` を実行します
- リリースは `develop` を `main` へ fast-forward してからタグを打ちます。手順は [`.claude/skills/release/SKILL.md`](.claude/skills/release/SKILL.md) を参照してください
- タグ発行なしで再デプロイしたい場合は Actions タブから `Deploy to Cloudflare Workers` を手動実行します。**その際は `Use workflow from` で `main` を選んでください**（default branch が `develop` のため、既定のままだと未リリースの `develop` が本番に出ます。ワークフロー側にもガードがあり `main` 以外は失敗します）

## データ自動取得

ゲームサーバーから GitHub Actions の cron ワークフローで画像・イベント DB を定期取得し、PR として追加します:

| ワークフロー | スケジュール | 内容 |
|-------------|-------------|------|
| `fetch-new-cards.yml` | 毎時 00 分 (UTC) | 新規衣装画像（フルサイズ + サムネイル）の前方スキャン + ギャップ埋め |
| `fetch-gap-cards.yml` | 毎時 00 分 (UTC) | 衣装 ID ギャップの補完 |
| `fetch-event-db.yml` | 毎時 00 分 (UTC) | イベント DB CSV を `public/events/events.csv` に取得 |
| `fetch-new-songs.yml` | 毎時 00 分 (UTC) | IDOLiSH7 Wiki から不足楽曲ジャケット画像を取得 |

取り込んだアセットは `main` へ自動マージされ、パッチ版タグが自動採番されて本番へ反映されます（新規衣装が 1 時間以内にサイトへ出ます）。画像は取得時に WebP へ変換されます（[ADR 0033](docs/adr/0033-webp-image-format.md)）。
