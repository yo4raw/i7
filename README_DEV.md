# 開発環境について

このプロジェクトでは、Dockerを使用した開発環境を用意しています。

## 開発環境の起動

```bash
./dev.sh
```

または

```bash
docker compose -f docker-compose.dev.yml up -d
```

## 特徴

- ホットリロード対応
- ソースコードの変更が即座に反映される
- Docker再起動不要

## 本番環境の起動

```bash
docker compose up -d
```

## 注意事項

- 開発環境では `npm run dev` が実行されます
- 本番環境では事前にビルドされたアプリケーションが実行されます
- ポート3000でアクセス可能

## トラブルシューティング

### 変更が反映されない場合

1. ブラウザのキャッシュをクリア
2. Viteのキャッシュをクリア
   ```bash
   docker compose -f docker-compose.dev.yml exec app rm -rf node_modules/.vite
   ```
3. コンテナを再起動
   ```bash
   docker compose -f docker-compose.dev.yml restart app
   ```