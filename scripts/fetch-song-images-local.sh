#!/usr/bin/env bash
# 楽曲ジャケット画像の取り込み (ADR 0088 / 0092)。Miraheze が GitHub Actions の IP 帯を 403 で弾くため
# cron ワークフローは削除済みで、新曲が追加されたときにこれをローカルで実行する。
# 実行: npm run fetch-songs → 新規画像があれば衣装画像 cron と同じ形式の件名でコミットする（push / PR / リリースは release スキル参照）
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/assets/songs
node scripts/fetch-song-images.mjs

NEW_IDS=$(git ls-files --others --exclude-standard public/assets/songs/ \
  | grep -oE '[0-9]+\.webp$' | sed 's/\.webp$//' | sort -n | paste -sd, - | sed 's/,/, /g' || true)

if [ -z "$NEW_IDS" ]; then
  echo "新しい楽曲画像はありません"
  exit 0
fi

git add public/assets/songs/
git commit -m "🍱 楽曲ジャケット画像を追加: $NEW_IDS"
echo "コミットしました: $NEW_IDS"
