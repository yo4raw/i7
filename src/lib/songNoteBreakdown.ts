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
  shoutWhite: number;
  shoutColor: number;
  beatWhite: number;
  beatColor: number;
  melodyWhite: number;
  melodyColor: number;
}

export interface NoteAttrTotals {
  shoutWhite: number;
  shoutColor: number;
  beatWhite: number;
  beatColor: number;
  melodyWhite: number;
  melodyColor: number;
}

export interface NoteBreakdown {
  rows: NoteBreakdownRow[];
  totals: NoteAttrTotals;
  hasNotes: boolean;
}

/**
 * 楽曲の 8 ステージ × 属性 × 白(始点)/色(終点) のノーツ数を、ステージ別・属性別の表示用データに集計する。
 * 白(white)と色(color)は分離して保持する（スコア係数が白 ×0.025 / 色 ×0.03 と異なるため）。
 * 全属性（白+色）が 0 のステージ行は除外する。倍率は LIGHT_MULTIPLIER を再利用。
 */
export function buildNoteBreakdown(song: Song): NoteBreakdown {
  const rows: NoteBreakdownRow[] = [];
  const totals: NoteAttrTotals = {
    shoutWhite: 0, shoutColor: 0,
    beatWhite: 0, beatColor: 0,
    melodyWhite: 0, melodyColor: 0,
  };

  for (const key of SONG_NOTE_GROUP_KEYS) {
    const group = song[key] as SongNoteGroup | undefined;
    if (!group) continue;

    const cell = (field: keyof SongNoteGroup): number => group[field] ?? 0;

    const shoutWhite = cell('shout_white');
    const shoutColor = cell('shout_color');
    const beatWhite = cell('beat_white');
    const beatColor = cell('beat_color');
    const melodyWhite = cell('melody_white');
    const melodyColor = cell('melody_color');

    totals.shoutWhite += shoutWhite;
    totals.shoutColor += shoutColor;
    totals.beatWhite += beatWhite;
    totals.beatColor += beatColor;
    totals.melodyWhite += melodyWhite;
    totals.melodyColor += melodyColor;

    if (shoutWhite + shoutColor + beatWhite + beatColor + melodyWhite + melodyColor === 0) continue;

    rows.push({
      key,
      label: STAGE_LABELS[key] ?? key,
      multiplier: LIGHT_MULTIPLIER[key] ?? 1,
      shoutWhite, shoutColor,
      beatWhite, beatColor,
      melodyWhite, melodyColor,
    });
  }

  return { rows, totals, hasNotes: rows.length > 0 };
}
