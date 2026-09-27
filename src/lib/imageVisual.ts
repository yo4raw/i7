/**
 * `src/data/image-visual.json` の読み込みと lookup。
 *
 * `cardAlt` / `songAlt` / `orphanCardAlt` が必要とする `VisualEntry` を
 * `cards.<id>` / `songs.<id>` から取り出す。JSON import なのでビルド時に
 * バンドルされ、ランタイムでファイルを読まない。
 */

import catalogJson from '../data/image-visual.json';

export interface VisualEntry {
  v?: string | null;
  n?: string | null;
}

interface Catalog {
  cards: Record<string, VisualEntry>;
  songs: Record<string, VisualEntry>;
}

const catalog: Catalog = catalogJson as Catalog;

/** カード ID で `VisualEntry` を引く。見つからなければ `undefined`。 */
export function cardVisualEntry(id: string | number): VisualEntry | undefined {
  return catalog.cards[String(id)];
}

/** 楽曲 ID で `VisualEntry` を引く。見つからなければ `undefined`。 */
export function songVisualEntry(id: string | number): VisualEntry | undefined {
  return catalog.songs[String(id)];
}
