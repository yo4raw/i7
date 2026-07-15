import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  filterValidSongs,
  fetchSongsJson,
  type Song,
} from '../../../src/lib/data/fetchSongsJson';

/** 指定セル値を持つ GViz 行を作る（cells[index] = { v }） */
function makeRowCells(values: Record<number, string | number | null>): { c: ({ v: string | number | boolean | null } | null)[] } {
  const c: ({ v: string | number | boolean | null } | null)[] = Array.from({ length: 67 }, () => null);
  for (const [idx, v] of Object.entries(values)) {
    c[Number(idx)] = { v };
  }
  return { c };
}

function stubGvizFetch(rows: ReturnType<typeof makeRowCells>[]): void {
  const payload = {
    version: '1',
    status: 'ok',
    table: { cols: Array.from({ length: 67 }, () => ({ id: '', label: '', type: '' })), rows },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(`google.visualization.Query.setResponse(${JSON.stringify(payload)});`),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('filterValidSongs', () => {
  const valid = { category: 'A', artist: 'B', notes_count: 100 } as Song;

  it('category / artist / notes_count がすべて存在する曲のみ残す', () => {
    const songs = [
      valid,
      { category: null, artist: 'B', notes_count: 100 } as Song,
      { category: 'A', artist: null, notes_count: 100 } as Song,
      { category: 'A', artist: 'B', notes_count: null } as Song,
    ];
    expect(filterValidSongs(songs)).toEqual([valid]);
  });
});

describe('fetchSongsJson (fetch モック)', () => {
  it('GViz テーブルをネスト構造の Song に変換する', async () => {
    const row = makeRowCells({
      0: 10, 1: 'カテゴリ', 2: 'アーティスト', 3: '曲名', 6: '★★★', 10: 200, 11: 120,
      12: 5, 13: 6, 14: 7, 15: 8, 16: 9, 17: 10, // notes_20 グループ
      60: 1, 61: 2, 62: 3, 63: 4, 64: 5, 65: 6, // 合計
      66: '2026-06-01',
    });
    stubGvizFetch([row]);

    const songs = await fetchSongsJson();
    expect(songs).toHaveLength(1);
    const s = songs[0];
    expect(s.id).toBe(10);
    expect(s.song_name).toBe('曲名');
    // stars は文字列なら length に変換
    expect(s.stars).toBe(3);
    // ネストグループ
    expect(s.notes_20).toEqual({
      shout_white: 5, shout_color: 6, beat_white: 7, beat_color: 8, melody_white: 9, melody_color: 10,
    });
    expect(s.total_shout_white).toBe(1);
    expect(s.updated_at).toBe('2026-06-01');
  });

  it('song_name が無い行は除外する', async () => {
    const withName = makeRowCells({ 0: 1, 3: '有効曲' });
    const withoutName = makeRowCells({ 0: 2 }); // song_name (col3) なし
    stubGvizFetch([withName, withoutName]);

    const songs = await fetchSongsJson();
    expect(songs).toHaveLength(1);
    expect(songs[0].song_name).toBe('有効曲');
  });

  it('ネストグループの欠損セルは 0 で埋める', async () => {
    const row = makeRowCells({ 0: 1, 3: '曲' }); // notes_20 のセルなし
    stubGvizFetch([row]);
    const songs = await fetchSongsJson();
    expect(songs[0].notes_20).toEqual({
      shout_white: 0, shout_color: 0, beat_white: 0, beat_color: 0, melody_white: 0, melody_color: 0,
    });
  });
});
