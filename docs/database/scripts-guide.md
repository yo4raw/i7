# データインポートスクリプト

このディレクトリには、Google Sheetsからデータをインポートするためのスクリプトが含まれています。

## スクリプト一覧

### fetch_sheets_data.py
- 最初のシート（GID: 480354522）からカードデータをインポート
- 従来の単一シートインポート用

### fetch_all_sheets_data.py
- 複数のシートからデータをインポート
  - Sheet 1 (GID: 480354522): メインのカードデータ
  - Sheet 2 (GID: 10283871743): ゲームメカニクスデータ（現在は構造調査中）
  - Sheet 3 (GID: 1555231665): スコア計算・チーム編成データ

### init-db.sh
- 従来の単一シート用の初期化スクリプト

### init-db-all.sh
- 全シートをインポートする初期化スクリプト

## 使用方法

### 手動実行
```bash
# Dockerコンテナ内で実行
docker run --rm --network i7-network \
  -v $(pwd)/scripts:/scripts \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=i7card \
  -e DB_USER=i7user \
  -e DB_PASS=i7password \
  python:3.11-alpine \
  sh -c "pip install requests psycopg2-binary && python /scripts/fetch_all_sheets_data.py"
```

### 初期セットアップ時
```bash
# 専用のdocker-composeファイルを使用
docker compose -f docker-compose.init.yml up
```

## データソース
- スプレッドシート: https://docs.google.com/spreadsheets/d/1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4/
  - Sheet 1 (カードデータ): gid=480354522
  - Sheet 2 (ゲームメカニクス): gid=1083871743
  - Sheet 3 (スコア計算): gid=1555231665

## 注意事項
- スクリプトはUnix形式の改行コード（LF）である必要があります
- データベースが起動していることを確認してください
- 既存のデータは上書きされます