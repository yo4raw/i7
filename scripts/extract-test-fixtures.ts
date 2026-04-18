/**
 * tests/fixtures/ 配下に固定スナップショット JSON を生成するワンショットスクリプト。
 *
 * 実行: npm run extract-fixtures
 *
 * 実スプレッドシートから「10th Anniversary 環 (Main color)」カードと
 * 「MONSTER GENERATiON」楽曲データを取得し、
 *   - tests/fixtures/10th-tamaki-main.json
 *   - tests/fixtures/monster-generation.json
 * に保存する。
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

function abortWithCandidates<T>(label: string, items: T[], summarize: (item: T) => string): never {
  console.error(`\n[extract-fixtures] ${label}: 候補が ${items.length} 件見つかりました。`);
  for (const it of items) {
    console.error(`  - ${summarize(it)}`);
  }
  console.error('[extract-fixtures] フィルタ条件を絞り込んでください。\n');
  process.exit(1);
}

async function main(): Promise<void> {
  console.log('[extract-fixtures] スプレッドシートからデータをフェッチ中...');
  const [cards, songs] = await Promise.all([fetchCardsJson(), fetchSongsJson()]);

  const tamakiCandidates = cards.filter(matches10thTamaki);
  const monsterCandidates = songs.filter(matchesMonsterGeneration);

  if (tamakiCandidates.length === 0) {
    console.error('[extract-fixtures] 10th Anniversary 環 (Main color) が見つかりません。');
    process.exit(1);
  }
  if (tamakiCandidates.length > 1) {
    abortWithCandidates(
      '10th 環 Main color',
      tamakiCandidates,
      (c) => `cardID=${c.cardID} name=${c.name} cardname=${c.cardname} story=${c.story} rarity=${c.rarity}`,
    );
  }

  if (monsterCandidates.length === 0) {
    console.error('[extract-fixtures] MONSTER GENERATiON 楽曲が見つかりません。');
    process.exit(1);
  }
  if (monsterCandidates.length > 1) {
    abortWithCandidates(
      'MONSTER GENERATiON',
      monsterCandidates,
      (s) => `id=${s.id} song_name=${s.song_name} difficulty=${s.difficulty} stars=${s.stars}`,
    );
  }

  const tamaki = tamakiCandidates[0];
  const monster = monsterCandidates[0];

  mkdirSync(FIXTURES_DIR, { recursive: true });
  const tamakiPath = resolve(FIXTURES_DIR, '10th-tamaki-main.json');
  const monsterPath = resolve(FIXTURES_DIR, 'monster-generation.json');

  writeFileSync(tamakiPath, JSON.stringify(tamaki, null, 2) + '\n', 'utf-8');
  writeFileSync(monsterPath, JSON.stringify(monster, null, 2) + '\n', 'utf-8');

  console.log(`[extract-fixtures] saved: ${tamakiPath}`);
  console.log(`  cardID=${tamaki.cardID} cardname=${tamaki.cardname} rarity=${tamaki.rarity} attribute=${tamaki.attribute}`);
  console.log(`[extract-fixtures] saved: ${monsterPath}`);
  console.log(`  id=${monster.id} song_name=${monster.song_name} difficulty=${monster.difficulty} notes=${monster.notes_count}`);
}

main().catch((err) => {
  console.error('[extract-fixtures] 失敗:', err);
  process.exit(1);
});
