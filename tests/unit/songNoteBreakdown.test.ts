import { describe, it, expect } from 'vitest';
import { buildNoteBreakdown, STAGE_LABELS } from '../../src/lib/songNoteBreakdown';
import type { Song } from '../../src/lib/data/fetchSongsJson';

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
  for (const k of allKeys) {
    song[k] = { ...empty, ...groups[k] };
  }
  return song as unknown as Song;
}

describe('buildNoteBreakdown', () => {
  it('白(始点)と色(終点)を属性別に分離して出す', () => {
    const song = makeSong({
      light_3: { shout_white: 20, shout_color: 6, melody_white: 32, melody_color: 3 },
    });
    const bd = buildNoteBreakdown(song);
    const row = bd.rows.find(r => r.key === 'light_3')!;
    expect(row.shoutWhite).toBe(20);
    expect(row.shoutColor).toBe(6);
    expect(row.beatWhite).toBe(0);
    expect(row.beatColor).toBe(0);
    expect(row.melodyWhite).toBe(32);
    expect(row.melodyColor).toBe(3);
    expect(row.multiplier).toBe(1.1);
    expect(row.label).toBe(STAGE_LABELS.light_3);
  });

  it('白+色がすべて0のステージ行は除外する', () => {
    const song = makeSong({ light_3: { shout_white: 10 }, light_4: { shout_color: 5 } });
    const bd = buildNoteBreakdown(song);
    expect(bd.rows.map(r => r.key)).toEqual(['light_3', 'light_4']);
  });

  it('属性別×白/色の合計を全ステージ合算で返す', () => {
    const song = makeSong({
      light_3: { shout_white: 10, beat_color: 4 },
      chorus_light_6: { shout_color: 5, melody_white: 7 },
    });
    const bd = buildNoteBreakdown(song);
    expect(bd.totals.shoutWhite).toBe(10);
    expect(bd.totals.shoutColor).toBe(5);
    expect(bd.totals.beatWhite).toBe(0);
    expect(bd.totals.beatColor).toBe(4);
    expect(bd.totals.melodyWhite).toBe(7);
    expect(bd.totals.melodyColor).toBe(0);
  });

  it('ステージ順は notes_20 → … → chorus_light_6 を保つ', () => {
    const song = makeSong({
      chorus_light_6: { shout_white: 1 },
      notes_20: { beat_white: 1 },
      light_5: { melody_color: 1 },
    });
    const bd = buildNoteBreakdown(song);
    expect(bd.rows.map(r => r.key)).toEqual(['notes_20', 'light_5', 'chorus_light_6']);
  });

  it('ノーツが全くなければ hasNotes は false', () => {
    const bd = buildNoteBreakdown(makeSong({}));
    expect(bd.hasNotes).toBe(false);
    expect(bd.rows).toEqual([]);
    expect(bd.totals).toEqual({
      shoutWhite: 0, shoutColor: 0,
      beatWhite: 0, beatColor: 0,
      melodyWhite: 0, melodyColor: 0,
    });
  });

  it('STAGE_LABELS は 8 ステージすべてに日本語ラベルを持つ', () => {
    for (const k of ['notes_20','light_2','light_3','light_4','light_5','light_6','chorus_light_5','chorus_light_6']) {
      expect(typeof STAGE_LABELS[k]).toBe('string');
      expect(STAGE_LABELS[k].length).toBeGreaterThan(0);
    }
  });
});
