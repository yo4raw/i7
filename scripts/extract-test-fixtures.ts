/**
 * tests/fixtures/ 配下に固定スナップショット JSON を生成するワンショットスクリプト。
 *
 * 実行: npm run extract-fixtures
 *
 * 出力物:
 *   - tests/fixtures/cards.json              全カードデータ
 *   - tests/fixtures/songs.json              全楽曲データ
 *   - tests/fixtures/10th-tamaki-main.json   10th Anniversary 四葉環(ピン留め)
 *   - tests/fixtures/monster-generation.json MONSTER GENERATiON(ピン留め)
 *
 * スプレッドシートスキーマが変更された場合はこのスクリプトを再実行して fixture を更新する。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchCardsJson, type Card } from '../src/lib/data/fetchCardsJson.ts';
import { fetchSongsJson, type Song } from '../src/lib/data/fetchSongsJson.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = resolve(ROOT, 'tests/fixtures');

function matches10thTamaki(card: Card): boolean {
  if (card.name !== '四葉環') return false;
  return (card.cardname ?? '').includes('10th Anniversary');
}

function matchesMonsterGeneration(song: Song): boolean {
  const name = (song.song_name ?? '').toUpperCase().replace(/\s+/g, '');
  return name.includes('MONSTERGENERATION');
}

function pickUnique<T>(label: string, items: T[], summarize: (item: T) => string): T {
  if (items.length === 0) {
    console.error(`[extract-fixtures] ${label}: 見つかりません`);
    process.exit(1);
  }
  if (items.length > 1) {
    console.error(`\n[extract-fixtures] ${label}: 候補が ${items.length} 件見つかりました。`);
    for (const it of items) console.error(`  - ${summarize(it)}`);
    console.error('[extract-fixtures] フィルタ条件を絞り込んでください。\n');
    process.exit(1);
  }
  return items[0];
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`[extract-fixtures] saved: ${path}`);
}

async function main(): Promise<void> {
  console.log('[extract-fixtures] スプレッドシートからデータをフェッチ中...');
  const [cards, songs] = await Promise.all([fetchCardsJson(), fetchSongsJson()]);

  mkdirSync(FIXTURES_DIR, { recursive: true });

  // 全カード / 全楽曲
  const cardsPath = resolve(FIXTURES_DIR, 'cards.json');
  const songsPath = resolve(FIXTURES_DIR, 'songs.json');
  writeJson(cardsPath, cards);
  console.log(`  ${cards.length} 件のカード`);
  writeJson(songsPath, songs);
  console.log(`  ${songs.length} 件の楽曲`);

  // ピン留めフィクスチャ
  const tamaki = pickUnique(
    '10th Anniversary 四葉環',
    cards.filter(matches10thTamaki),
    (c) => `cardID=${c.cardID} name=${c.name} cardname=${c.cardname} story=${c.story} rarity=${c.rarity}`,
  );
  const monster = pickUnique(
    'MONSTER GENERATiON',
    songs.filter(matchesMonsterGeneration),
    (s) => `id=${s.id} song_name=${s.song_name} difficulty=${s.difficulty} stars=${s.stars}`,
  );

  writeJson(resolve(FIXTURES_DIR, '10th-tamaki-main.json'), tamaki);
  console.log(`  cardID=${tamaki.cardID} cardname=${tamaki.cardname} rarity=${tamaki.rarity} attribute=${tamaki.attribute}`);
  writeJson(resolve(FIXTURES_DIR, 'monster-generation.json'), monster);
  console.log(`  id=${monster.id} song_name=${monster.song_name} difficulty=${monster.difficulty} notes=${monster.notes_count}`);
}

main().catch((err) => {
  console.error('[extract-fixtures] 失敗:', err);
  process.exit(1);
});
