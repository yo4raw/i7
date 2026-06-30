import { describe, it, expect } from 'vitest';
import { buildNoteBreakdown } from '../../src/lib/songNoteBreakdown';
import type { Song } from '../../src/lib/data/fetchSongsJson';

/** ステージグループを部分的にしか持たない (一部キー欠落 / フィールド欠落) Song を作る */
function makeSparseSong(groups: Record<string, Record<string, number | undefined> | undefined>): Song {
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
  for (const [k, v] of Object.entries(groups)) song[k] = v;
  return song as unknown as Song;
}

describe('buildNoteBreakdown: 欠落グループ・欠落フィールドの処理', () => {
  it('存在しないステージグループ (undefined) は continue でスキップする (L59)', () => {
    // light_3 のみ存在し、他のステージキーは Song に存在しない
    const song = makeSparseSong({ light_3: { shout_white: 10 } });
    const bd = buildNoteBreakdown(song);
    expect(bd.rows.map((r) => r.key)).toEqual(['light_3']);
    expect(bd.totals.shoutWhite).toBe(10);
  });

  it('グループ内のフィールドが欠落していれば 0 として扱う (L61)', () => {
    // shout_white のみ定義、他フィールドは undefined → ?? 0 で 0 になる
    const song = makeSparseSong({
      light_4: { shout_white: 7, shout_color: undefined, beat_white: undefined },
    });
    const bd = buildNoteBreakdown(song);
    const row = bd.rows.find((r) => r.key === 'light_4')!;
    expect(row.shoutWhite).toBe(7);
    expect(row.shoutColor).toBe(0);
    expect(row.beatWhite).toBe(0);
    expect(row.beatColor).toBe(0);
    expect(row.melodyWhite).toBe(0);
    expect(row.melodyColor).toBe(0);
  });
});
