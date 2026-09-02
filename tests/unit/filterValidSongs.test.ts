import { describe, it, expect } from 'vitest';
import { filterValidSongs, type Song } from '../../src/lib/data/fetchSongsJson';

const EMPTY_GROUP = {
  shout_white: 0, shout_color: 0,
  beat_white: 0, beat_color: 0,
  melody_white: 0, melody_color: 0,
};

const NOTE_GROUP_KEYS = [
  'notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6',
];

function makeSong(overrides: Partial<Record<string, unknown>>): Song {
  const song: Record<string, unknown> = {
    id: 1, category: 'ŹOOĻ', artist: 'ŹOOĻ', song_name: 'Ache',
    song_type: 'イベント楽曲', difficulty: 'EXPERT+', stars: 1,
    shout_ratio: null, beat_ratio: null, melody_ratio: null,
    notes_count: 315, duration: 94,
    total_shout_white: null, total_shout_color: null,
    total_beat_white: null, total_beat_color: null,
    total_melody_white: null, total_melody_color: null,
    updated_at: null,
  };
  for (const k of NOTE_GROUP_KEYS) song[k] = { ...EMPTY_GROUP };
  return { ...song, ...overrides } as unknown as Song;
}

describe('filterValidSongs', () => {
  it('カテゴリ・アーティスト・ノーツ数が揃った曲だけを残す', () => {
    const songs = [
      makeSong({ id: 1, song_name: 'A' }),
      makeSong({ id: 2, song_name: 'B', category: null }),
      makeSong({ id: 3, song_name: 'C', artist: null }),
      makeSong({ id: 4, song_name: 'D', notes_count: null }),
    ];
    expect(filterValidSongs(songs).map(s => s.id)).toEqual([1]);
  });

  it('同一カテゴリの同名曲が重複したら EXPERT+ の行だけを残す', () => {
    const songs = [
      makeSong({ id: 42, song_name: 'Ache', song_type: 'イベント楽曲', difficulty: 'EXPERT+', notes_count: 315 }),
      makeSong({ id: 43, song_name: 'Ache', song_type: '通常楽曲', difficulty: 'EXPERT', notes_count: 282 }),
    ];
    const result = filterValidSongs(songs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42);
    expect(result[0].difficulty).toBe('EXPERT+');
  });

  it('EXPERT+ が後ろの行にあっても EXPERT+ を残す', () => {
    const songs = [
      makeSong({ id: 43, song_name: 'Ache', difficulty: 'EXPERT', notes_count: 282 }),
      makeSong({ id: 42, song_name: 'Ache', difficulty: 'EXPERT+', notes_count: 315 }),
    ];
    expect(filterValidSongs(songs).map(s => s.id)).toEqual([42]);
  });

  it('重複した行の難易度が同じなら先に現れた行を残す', () => {
    const songs = [
      makeSong({ id: 10, song_name: 'Ache', difficulty: 'EXPERT+' }),
      makeSong({ id: 11, song_name: 'Ache', difficulty: 'EXPERT+' }),
    ];
    expect(filterValidSongs(songs).map(s => s.id)).toEqual([10]);
  });

  it('難易度が両方とも EXPERT+ 以外なら難易度の高い行を残す', () => {
    const songs = [
      makeSong({ id: 20, song_name: 'Ache', difficulty: 'NORMAL' }),
      makeSong({ id: 21, song_name: 'Ache', difficulty: 'EXPERT' }),
    ];
    expect(filterValidSongs(songs).map(s => s.id)).toEqual([21]);
  });

  it('カテゴリが違えば同名でも別の曲として残す', () => {
    const songs = [
      makeSong({ id: 30, category: 'ŹOOĻ', song_name: 'Ache' }),
      makeSong({ id: 31, category: 'TRIGGER', song_name: 'Ache' }),
    ];
    expect(filterValidSongs(songs).map(s => s.id)).toEqual([30, 31]);
  });

  it('重複がなければ並び順を変えない', () => {
    const songs = [
      makeSong({ id: 1, song_name: 'A' }),
      makeSong({ id: 2, song_name: 'B' }),
      makeSong({ id: 3, song_name: 'C' }),
    ];
    expect(filterValidSongs(songs).map(s => s.id)).toEqual([1, 2, 3]);
  });
});
