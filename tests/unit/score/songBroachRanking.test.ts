import { describe, it, expect } from 'vitest';
import { buildBroachRanking } from '../../../src/lib/score/songBroachRanking';
import type { Song } from '../../../src/lib/data/fetchSongsJson';

function makeSong(groups: Partial<Record<string, Partial<Record<string, number>>>>): Song {
  const empty = {
    shout_white: 0, shout_color: 0,
    beat_white: 0, beat_color: 0,
    melody_white: 0, melody_color: 0,
  };
  const allKeys = [
    'notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6',
  ];
  const song: Record<string, unknown> = {
    id: 1, category: 'IDOLiSH7', artist: 'IDOLiSH7', song_name: 'TEST',
    song_type: null, difficulty: null, stars: null,
    shout_ratio: null, beat_ratio: null, melody_ratio: null,
    notes_count: null, duration: null,
    total_shout_white: null, total_shout_color: null,
    total_beat_white: null, total_beat_color: null,
    total_melody_white: null, total_melody_color: null,
    updated_at: null,
  };
  for (const k of allKeys) song[k] = { ...empty, ...(groups[k] ?? {}) };
  return song as unknown as Song;
}

describe('buildBroachRanking', () => {
  it('最大10件・score降順で返す', () => {
    const song = makeSong({ light_6: { shout_white: 50, beat_white: 50, melody_white: 50 } });
    const ranking = buildBroachRanking(song);
    expect(ranking.length).toBeLessThanOrEqual(10);
    expect(ranking.length).toBeGreaterThan(0);
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].score).toBeGreaterThanOrEqual(ranking[i].score);
    }
  });

  it('targetAttribute を持つ id 24-26 を含まない', () => {
    const song = makeSong({ light_6: { shout_white: 100, beat_white: 100, melody_white: 100 } });
    const ranking = buildBroachRanking(song);
    expect(ranking.some(e => e.id >= 24 && e.id <= 26)).toBe(false);
  });

  it('Shout偏重曲では Shout系ブローチが Melody系より上位', () => {
    const song = makeSong({ light_6: { shout_white: 200, melody_white: 1 } });
    const ranking = buildBroachRanking(song);
    const shout1100 = ranking.findIndex(e => e.name === 'Shout1100');
    const melody1100 = ranking.findIndex(e => e.name === 'Melody1100');
    expect(shout1100).toBeGreaterThanOrEqual(0);
    expect(shout1100 < melody1100 || melody1100 === -1).toBe(true);
  });

  it('単一属性ブローチは attribute にその属性、ALL系は All', () => {
    const song = makeSong({ light_6: { shout_white: 100, beat_white: 100, melody_white: 100 } });
    const ranking = buildBroachRanking(song);
    const shout = ranking.find(e => e.name === 'Shout1100');
    const all = ranking.find(e => e.name === 'ALL750');
    expect(shout?.attribute).toBe('Shout');
    expect(all?.attribute).toBe('All');
  });

  it('ノーツが無ければ空配列', () => {
    expect(buildBroachRanking(makeSong({}))).toEqual([]);
  });

  it('寄与は実エンジン式（2段floor）と一致する', () => {
    // light_6 (×1.5), shout_white 10 のみ。ALL700 の shout=700。
    // perNote = floor(700*0.025)=17 → floor(17*1.5)=25。10ノーツ → 250。
    const song = makeSong({ light_6: { shout_white: 10 } });
    const ranking = buildBroachRanking(song);
    const all700 = ranking.find(e => e.name === 'ALL700');
    expect(all700?.score).toBe(250);
  });
});
