import type { Card } from '../../src/lib/data/fetchCardsJson';
import type { Song } from '../../src/lib/data/fetchSongsJson';

import cardsJson from './cards.json' with { type: 'json' };
import songsJson from './songs.json' with { type: 'json' };
import tamakiJson from './10th-tamaki-main.json' with { type: 'json' };
import monsterJson from './monster-generation.json' with { type: 'json' };

/** 全カードのスナップショット(スプレッドシートから npm run extract-fixtures で再生成) */
export const allCards = cardsJson as unknown as Card[];
/** 全楽曲のスナップショット(同上) */
export const allSongs = songsJson as unknown as Song[];

/** ピン留め: 10th Anniversary 四葉環 (cardID=2484 / UR / Beat) */
export const tenthTamakiMainCard = tamakiJson as unknown as Card;
/** ピン留め: MONSTER GENERATiON (id=2 / EXPERT+ / 428 notes) */
export const monsterGenerationSong = monsterJson as unknown as Song;

/** カード検索ヘルパー: cardID で1件取得(見つからなければ throw) */
export function findCardById(cardID: number): Card {
  const card = allCards.find((c) => c.cardID === cardID);
  if (!card) throw new Error(`cardID=${cardID} が fixture に存在しません`);
  return card;
}

/** 楽曲検索ヘルパー: id で1件取得(見つからなければ throw) */
export function findSongById(id: number): Song {
  const song = allSongs.find((s) => s.id === id);
  if (!song) throw new Error(`song id=${id} が fixture に存在しません`);
  return song;
}
