/**
 * Google Sheets から全カード・全楽曲・全固定ブローチを取得し、tests/fixtures/ 配下に
 * テスト用スナップショット JSON を生成する。
 * 実行: npm run extract-fixtures （= tsx scripts/extract-test-fixtures.ts）
 * 頻度: 必要時のみ（スプレッドシートのスキーマ変更・フィクスチャ更新が必要なときに再実行）
 *
 * 出力物:
 *   - tests/fixtures/cards.json   全カードデータ
 *   - tests/fixtures/songs.json   全楽曲データ
 *   - tests/fixtures/broachs.json 全固定ブローチデータ
 *
 * 個別のピン留めデータは tests/fixtures/index.ts の findCardById / findSongById / findBroachsByCardId 経由で取得する。
 * スプレッドシートスキーマが変更された場合はこのスクリプトを再実行して fixture を更新する。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchCardsJson } from '../src/lib/data/fetchCardsJson.ts';
import { fetchSongsJson } from '../src/lib/data/fetchSongsJson.ts';
import { fetchFixedBroachsJson } from '../src/lib/data/fetchFixedBroachsJson.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = resolve(ROOT, 'tests/fixtures');

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`[extract-fixtures] saved: ${path}`);
}

async function main(): Promise<void> {
  console.log('[extract-fixtures] スプレッドシートからデータをフェッチ中...');
  const [cards, songs, broachs] = await Promise.all([
    fetchCardsJson(),
    fetchSongsJson(),
    fetchFixedBroachsJson(),
  ]);

  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeJson(resolve(FIXTURES_DIR, 'cards.json'), cards);
  console.log(`  ${cards.length} 件のカード`);
  writeJson(resolve(FIXTURES_DIR, 'songs.json'), songs);
  console.log(`  ${songs.length} 件の楽曲`);
  writeJson(resolve(FIXTURES_DIR, 'broachs.json'), broachs);
  console.log(`  ${broachs.length} 件の固定ブローチ`);
}

main().catch((err) => {
  console.error('[extract-fixtures] 失敗:', err);
  process.exit(1);
});
