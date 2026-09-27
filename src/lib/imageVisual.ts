/**
 * `src/data/image-visual.json` の読み込みと lookup。
 *
 * `cardAlt` / `songAlt` / `orphanCardAlt` が必要とする `VisualEntry` を
 * `cards.<id>` / `songs.<id>` から取り出す。JSON を直接 import せず、
 * ここだけがファイルを読む。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CATALOG_PATH = resolve(import.meta.dirname, '..', 'data', 'image-visual.json');

export interface VisualEntry {
  v?: string | null;
  n?: string | null;
}

interface Catalog {
  cards: Record<string, VisualEntry>;
  songs: Record<string, VisualEntry>;
}

let catalog: Catalog | null = null;

function load(): Catalog {
  if (!catalog) {
    catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as Catalog;
  }
  return catalog!;
}

/** カード ID で `VisualEntry` を引く。見つからなければ `undefined`。 */
export function cardVisualEntry(id: string | number): VisualEntry | undefined {
  return load().cards[String(id)];
}

/** 楽曲 ID で `VisualEntry` を引く。見つからなければ `undefined`。 */
export function songVisualEntry(id: string | number): VisualEntry | undefined {
  return load().songs[String(id)];
}
