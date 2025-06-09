#!/bin/sh
# 開発環境起動スクリプト

echo "Starting development environment..."

# 既存のコンテナを停止
docker compose down

# 開発環境を起動
docker compose -f docker-compose.dev.yml up -d

echo "Development environment started!"
echo "Access the application at: http://localhost:3001"
echo ""
echo "To view logs: docker compose -f docker-compose.dev.yml logs -f app"
echo "To stop: docker compose -f docker-compose.dev.yml down"