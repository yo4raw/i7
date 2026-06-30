import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getEventSongIds,
  firstEventSongId,
  filterValidSongs,
  fetchSongsJson,
  type Song,
} from '../../../src/lib/data/fetchSongsJson';

afterEach(() => vi.unstubAllGlobals());

describe('fetchSongsJson: row.c が無い行のフォールバック (L167 || [])', () => {
  it('c を持たない行は空セル配列として変換され song_name 無しで除外される', () => {
    const cols = new Array(67).fill({ id: '', label: '', type: '' });
    const withName = { c: (() => { const a = new Array(67).fill(null); a[0] = { v: 1 }; a[3] = { v: '曲A' }; return a; })() };
    const noC = {}; // row.c なし → convertRow(row.c || []) の || [] を通す
    const payload = { version: '1', status: 'ok', table: { cols, rows: [withName, noC] } };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => `google.visualization.Query.setResponse(${JSON.stringify(payload)});`,
    })));
    return fetchSongsJson().then((songs) => {
      // c なし行は song_name=null → filter で除外され、有効な 1 曲のみ
      expect(songs).toHaveLength(1);
      expect(songs[0].song_name).toBe('曲A');
    });
  });
});

describe('filterValidSongs: 各必須フィールド欠落の除外 (L135)', () => {
  it('notes_count が 0/null の曲を除外する', () => {
    const valid = { category: 'A', artist: 'B', notes_count: 100 } as Song;
    const songs = [
      valid,
      { category: 'A', artist: 'B', notes_count: 0 } as Song,    // notes_count falsy
      { category: 'A', artist: 'B', notes_count: null } as Song, // notes_count null
    ];
    expect(filterValidSongs(songs)).toEqual([valid]);
  });
});

describe('getEventSongIds', () => {
  it('config の eventSongIds 配列を返す（実データは配列なので非空でも空でも配列）', () => {
    const ids = getEventSongIds();
    expect(Array.isArray(ids)).toBe(true);
  });
});

describe('firstEventSongId: id=null の曲を除外して既定選択を解決 (L167)', () => {
  it('id が null の曲は Set に含めず、該当が無ければ null', () => {
    const songs = [
      { id: null, category: 'A', artist: 'B', notes_count: 1 } as unknown as Song, // id null → filter で除外
      { id: -9999, category: 'A', artist: 'B', notes_count: 1 } as Song,            // event 対象外
    ];
    // eventSongIds に存在しない id しか無い → null
    expect(firstEventSongId(songs)).toBeNull();
  });

  it('eventSongIds に一致する曲があればその id を返す', () => {
    const eventIds = getEventSongIds();
    if (eventIds.length === 0) {
      // config が空ならスキップ相当 (常に null)
      expect(firstEventSongId([{ id: 1 } as Song])).toBeNull();
      return;
    }
    const target = eventIds[0];
    const songs = [
      { id: null } as unknown as Song,    // id null を含めて L167 の除外も通す
      { id: target } as Song,
    ];
    expect(firstEventSongId(songs)).toBe(target);
  });
});
