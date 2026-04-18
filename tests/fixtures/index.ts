import type { Card } from '../../src/lib/data/fetchCardsJson';
import type { Song } from '../../src/lib/data/fetchSongsJson';
import type { FixedBroach } from '../../src/lib/data/fetchFixedBroachsJson';

import cardsJson from './cards.json' with { type: 'json' };
import songsJson from './songs.json' with { type: 'json' };
import broachsJson from './broachs.json' with { type: 'json' };

/** 全カードのスナップショット(スプレッドシートから npm run extract-fixtures で再生成) */
export const allCards = cardsJson as unknown as Card[];
/** 全楽曲のスナップショット(同上) */
export const allSongs = songsJson as unknown as Song[];
/** 全固定ブローチのスナップショット(同上) */
export const allBroachs = broachsJson as unknown as FixedBroach[];

/** カード検索ヘルパー: cardID で1件取得(見つからなければ throw) */
export function findCardById(cardID: number): Card {
  const card = allCards.find((c) => c.cardID === cardID);
  if (!card) throw new Error(`cardID=${cardID} が fixture に存在しません`);
  return card;
}

/** 固定ブローチ検索ヘルパー: card_id で該当する全ブローチを取得 */
export function findBroachsByCardId(cardID: number): FixedBroach[] {
  return allBroachs.filter((b) => b.card_id === cardID);
}

/** 楽曲検索ヘルパー: id で1件取得(見つからなければ throw) */
export function findSongById(id: number): Song {
  const song = allSongs.find((s) => s.id === id);
  if (!song) throw new Error(`song id=${id} が fixture に存在しません`);
  return song;
}
