import { describe, it, expect } from 'vitest';

import type { Song } from '../../../src/lib/data/fetchSongsJson';
import { firstEventSongId, getEventSongIds } from '../../../src/lib/data/fetchSongsJson';

/** id だけ持つ最小の Song を作る（firstEventSongId は id しか参照しない） */
const song = (id: number): Song => ({ id } as Song);

describe('getEventSongIds', () => {
  it('event-songs.json の eventSongIds を配列で返す', () => {
    const ids = getEventSongIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe('firstEventSongId', () => {
  const ids = getEventSongIds();

  it('config 順で最初に存在する曲 ID を返す（2番目のみ含む場合）', () => {
    expect(firstEventSongId([song(ids[1])])).toBe(ids[1]);
  });

  it('先頭2つを含むと config 先頭の ID を返す（曲配列の順序に依存しない）', () => {
    expect(firstEventSongId([song(ids[1]), song(ids[0])])).toBe(ids[0]);
  });

  it('イベント対象曲が1つも無ければ null', () => {
    expect(firstEventSongId([song(-1)])).toBeNull();
  });

  it('空配列なら null', () => {
    expect(firstEventSongId([])).toBeNull();
  });
});
