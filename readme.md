# About
このレポジトリはアイナナ（アイドリッシュセブン）の攻略サイトを構築するための諸々のファイルが格納されています。
https://i7.step-on-dream.net/index.phpを改善したサイトを目指しています。
またデプロイ先URLはhttps://i7-rs4b.onrender.comです。

## 🎯 プロジェクト概要
このプロジェクトは、アイドリッシュセブンのカード情報を管理し、プレイヤーに有用な情報を提供する攻略サイトを構築することを目的としています。

### 主な機能
- カード情報の管理と表示
- ステータス計算
- スキル情報の詳細表示
- カード画像の管理

## 🏗️ インフラ構成
### デプロイ先
**Render** - Webアプリケーションのホスティングプラットフォーム

### データベース
**Neon** - サーバーレスPostgreSQLデータベース

### フレームワーク
**SvelteKit** - モダンなWebアプリケーションフレームワーク

## 📁 プロジェクト構造
```
i7/
├── assets/                 # アセットファイル
│   └── cards/             # カード画像（1.png～1440.png）
│       └── *.png          # 各カードの画像ファイル
├── tools/                 # ユーティリティツール
│   ├── db/               # データベース関連スクリプト
│   │   ├── script.py     # SQLiteデータベース作成スクリプト
│   │   ├── sync_to_postgres.py  # PostgreSQL同期スクリプト
│   │   ├── requirements.txt     # Python依存関係
│   │   ├── .env.example        # 環境変数設定例
│   │   └── README.md          # DB同期の詳細ドキュメント
│   └── scraping/         # スクレイピング関連
│       ├── scrape_images.py    # カード画像取得スクリプト
│       ├── requirements.txt    # Python依存関係
│       └── readme.md          # スクレイピング手順
└── readme.md             # このファイル
```

## 🚀 セットアップ手順

### 1. リポジトリのクローン
```bash
git clone https://github.com/yo4raw/i7.git
cd i7
```

### 2. データベースセットアップ

#### PostgreSQL（本番環境）
```bash
cd tools/db
pip install -r requirements.txt
cp .env.example .env
# .envファイルを編集してデータベース接続情報を設定
python sync_to_postgres.py
```

#### SQLite（開発環境）
```bash
cd tools/db
python script.py
# i7card.dbファイルが生成されます
```

### 3. カード画像の取得
```bash
cd tools/scraping
pip install -r requirements.txt
python scrape_images.py
```

## 📊 データベース構造

### メインテーブル
1. **cards** - カードマスター情報
   - ID, cardID, cardname, name, rarity等

2. **card_stats** - カードステータス
   - attribute, shout/beat/melody の最小/最大値

3. **card_skills** - カードスキル情報
   - ap_skill_type, ap_skill_name, ct_skill等

4. **skill_details** - スキル詳細（レベル別）
   - skill_level, count, per, value, rate

5. **release_info** - リリース情報
   - year, month, day, event

## 🔧 スクリプト詳細

### tools/db/script.py
- Google SheetsからCSVをダウンロード
- SQLiteデータベースを作成
- データのクリーニングと正規化
- URL: https://docs.google.com/spreadsheets/d/1GQTb7iew6BwS9-VYB2Uu-1zp23RA9o124RObPeUCDVU/

### tools/db/sync_to_postgres.py
- Google SheetsからPostgreSQLへの同期
- 環境変数による設定管理
- エラーハンドリングとログ機能
- URL: https://docs.google.com/spreadsheets/d/1LifgqDiRlQOIhP8blqEngJhI_Nnagbo8uspwmfg72fY/

### tools/scraping/scrape_images.py
- カード画像の一括ダウンロード
- 進捗表示とエラーハンドリング
- 並列ダウンロード対応

## 💻 開発ワークフロー

### 新機能の追加
1. ブランチを作成: `git checkout -b feature/機能名`
2. 変更を実装
3. テストを実行
4. コミット: `git commit -m "feat: 機能の説明"`
5. プルリクエストを作成

### コミットメッセージ規約
- `feat:` 新機能
- `fix:` バグ修正
- `docs:` ドキュメント更新
- `style:` コードスタイルの変更
- `refactor:` リファクタリング
- `test:` テストの追加・修正
- `chore:` ビルドプロセスやツールの変更

### データ更新
1. Google Sheetsでデータを更新
2. 同期スクリプトを実行
3. データベースの整合性を確認
4. 必要に応じてマイグレーションを作成

## 🔍 よくあるタスク

### カードデータの更新
```bash
cd tools/db
python sync_to_postgres.py
```

### 新しいカード画像の追加
```bash
cd tools/scraping
python scrape_images.py --start 1441 --end 1500
```

### データベースのバックアップ
```bash
pg_dump -h localhost -U postgres i7card_db > backup_$(date +%Y%m%d).sql
```

### ローカル開発環境の起動
```bash
npm install
npm run dev
```

## 🐛 トラブルシューティング

### データベース接続エラー
- `.env`ファイルの設定を確認
- PostgreSQLサービスが起動しているか確認
- ファイアウォール設定を確認

### 画像ダウンロードエラー
- インターネット接続を確認
- 一時的な503エラーの場合は時間をおいて再試行
- `--retry`オプションを使用

### 同期エラー
- Google Sheetsの公開設定を確認
- CSV形式でのエクスポートが可能か確認
- データ形式の変更がないか確認

## 📝 環境変数

### 必須
- `PG_HOST`: PostgreSQLホスト
- `PG_PORT`: PostgreSQLポート
- `PG_DATABASE`: データベース名
- `PG_USER`: ユーザー名
- `PG_PASSWORD`: パスワード

### オプション
- `LOG_LEVEL`: ログレベル（DEBUG, INFO, WARNING, ERROR）
- `BATCH_SIZE`: バッチ処理サイズ

## 🔗 関連リンク
- [アイドリッシュセブン公式サイト](https://idolish7.com/)
- [SvelteKit ドキュメント](https://kit.svelte.dev/)
- [Neon ドキュメント](https://neon.tech/docs)
- [Render ドキュメント](https://render.com/docs)

## 📊 Badge
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/yo4raw/i7?utm_source=oss&utm_medium=github&utm_campaign=yo4raw%2Fi7&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)