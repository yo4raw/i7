import type { Song, SongNoteGroup } from './data/fetchSongsJson';
import { SONG_NOTE_GROUP_KEYS } from './data/fetchSongsJson';
import { LIGHT_MULTIPLIER } from './score/constants';

/** ステージキー → ユーザー可視の日本語ラベル（ライト点灯状態） */
export const STAGE_LABELS: Record<string, string> = {
  notes_20: '点灯前(約20ノーツ)',
  light_2: 'ライト2つ',
  light_3: 'ライト3つ',
  light_4: 'ライト4つ',
  light_5: 'ライト5つ',
  light_6: 'ライト6つ',
  chorus_light_5: 'サビ(ライト5)',
  chorus_light_6: 'サビ(ライト6)',
};

export interface NoteBreakdownRow {
  key: string;
  label: string;
  multiplier: number;
  shout: number;
  beat: number;
  melody: number;
}

export interface NoteBreakdown {
  rows: NoteBreakdownRow[];
  totals: { shout: number; beat: number; melody: number };
  hasNotes: boolean;
}

/**
 * 楽曲の 8 ステージ × 属性 × 始点終点のノーツ数を、ステージ別・属性別の表示用データに集計する。
 * 始点(white)と終点(color)は合算する。全属性 0 のステージ行は除外する。倍率は LIGHT_MULTIPLIER を再利用。
 */
export function buildNoteBreakdown(song: Song): NoteBreakdown {
  const rows: NoteBreakdownRow[] = [];
  const totals = { shout: 0, beat: 0, melody: 0 };

  for (const key of SONG_NOTE_GROUP_KEYS) {
    const group = song[key] as SongNoteGroup | undefined;
    if (!group) continue;

    const cell = (attrKey: string): number =>
      (group[`${attrKey}_white` as keyof SongNoteGroup] ?? 0) +
      (group[`${attrKey}_color` as keyof SongNoteGroup] ?? 0);

    const shout = cell('shout');
    const beat = cell('beat');
    const melody = cell('melody');

    totals.shout += shout;
    totals.beat += beat;
    totals.melody += melody;

    if (shout + beat + melody === 0) continue;

    rows.push({
      key,
      label: STAGE_LABELS[key] ?? key,
      multiplier: LIGHT_MULTIPLIER[key] ?? 1,
      shout,
      beat,
      melody,
    });
  }

  return { rows, totals, hasNotes: rows.length > 0 };
}
