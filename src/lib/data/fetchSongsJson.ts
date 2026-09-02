import { SPREADSHEET_ID, extractCellValue, fetchSheetRaw, type GVizCell } from './gviz.ts';
import eventSongsConfig from '../../data/event-songs.json' with { type: 'json' };

export interface SongNoteGroup {
  shout_white: number; //shout属性値 * 0.025
  shout_color: number; //shout属性値 * 0.03
  beat_white: number; //beat属性値 * 0.025
  beat_color: number; //beat属性値 * 0.03
  melody_white: number; //melody属性値 * 0.025
  melody_color: number; //melody属性値 * 0.03
}

export interface Song {
  id: number | null;
  category: string | null;
  artist: string | null;
  song_name: string | null;
  song_type: string | null;
  difficulty: string | null;
  stars: number | null;
  shout_ratio: number | null;
  beat_ratio: number | null;
  melody_ratio: number | null;
  notes_count: number | null;
  duration: number | null;
  notes_20: SongNoteGroup; //属性値結果 * 1.0
  light_2: SongNoteGroup; //属性値結果 * 1.0
  light_3: SongNoteGroup; //属性値結果 * 1.1
  light_4: SongNoteGroup; //属性値結果 * 1.2
  light_5: SongNoteGroup; //属性値結果 * 1.3
  light_6: SongNoteGroup; //属性値結果 * 1.5
  chorus_light_5: SongNoteGroup; //属性値結果 * 2.6
  chorus_light_6: SongNoteGroup; //属性値結果 * 3
  total_shout_white: number | null;
  total_shout_color: number | null;
  total_beat_white: number | null;
  total_beat_color: number | null;
  total_melody_white: number | null;
  total_melody_color: number | null;
  updated_at: string | null;
  [key: string]: string | number | boolean | null | SongNoteGroup;
}

/** ノートグループの 8 キー（ステージ進行順）。LIGHT_MULTIPLIER (score/constants.ts) のキー順と一致 */
export const SONG_NOTE_GROUP_KEYS = [
  'notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6',
] as const;

const SONGS_GID = 1083871743;

// フラットカラム定義 (col index → key)
const FLAT_COLUMNS: Record<number, string> = {
  0: 'id',
  1: 'category',
  2: 'artist',
  3: 'song_name',
  4: 'song_type',
  5: 'difficulty',
  6: 'stars',
  7: 'shout_ratio',
  8: 'beat_ratio',
  9: 'melody_ratio',
  10: 'notes_count',
  11: 'duration',
};

// ネストグループ定義 (開始col index → group key)
const NESTED_GROUPS: Record<number, string> = {
  12: 'notes_20',
  18: 'light_2',
  24: 'light_3', 
  30: 'light_4',
  36: 'light_5',
  42: 'light_6',
  48: 'chorus_light_5',
  54: 'chorus_light_6',
};

// 各グループ内のサブキー (6列固定)
const SUB_KEYS: (keyof SongNoteGroup)[] = [
  'shout_white', 'shout_color',
  'beat_white', 'beat_color',
  'melody_white', 'melody_color',
];

// 合計カラム定義
const TOTAL_COLUMNS: Record<number, string> = {
  60: 'total_shout_white',
  61: 'total_shout_color',
  62: 'total_beat_white',
  63: 'total_beat_color',
  64: 'total_melody_white',
  65: 'total_melody_color',
};

// col 66 = updated_at, col 67 = 除外

function convertRow(cells: (GVizCell | null)[]): Song {
  const obj: Record<string, unknown> = {};

  // フラットカラム
  for (const [col, key] of Object.entries(FLAT_COLUMNS)) {
    let val = extractCellValue(cells[Number(col)] ?? null);
    if (key === 'stars' && typeof val === 'string') {
      val = val.length;
    }
    obj[key] = val;
  }

  // ネストグループ
  for (const [startCol, groupKey] of Object.entries(NESTED_GROUPS)) {
    const group: Record<string, number> = {};
    const start = Number(startCol);
    SUB_KEYS.forEach((subKey, i) => {
      group[subKey] = (extractCellValue(cells[start + i] ?? null) as number) ?? 0;
    });
    obj[groupKey] = group;
  }

  // 合計カラム
  for (const [col, key] of Object.entries(TOTAL_COLUMNS)) {
    obj[key] = extractCellValue(cells[Number(col)] ?? null);
  }

  // データ更新日
  obj.updated_at = extractCellValue(cells[66] ?? null);

  return obj as unknown as Song;
}

/** 難易度の優先順位（大きいほど優先）。未知・未入力は 0 として最下位に置く */
const DIFFICULTY_RANK: Record<string, number> = {
  'EXPERT+': 5,
  EXPERT: 4,
  HARD: 3,
  NORMAL: 2,
  EASY: 1,
};

function difficultyRank(difficulty: string | null): number {
  return difficulty === null ? 0 : (DIFFICULTY_RANK[difficulty] ?? 0);
}

/**
 * 同一カテゴリ内の同名曲を 1 行に畳む（ADR 0068）。
 *
 * マスターデータは「1 曲 = 1 行（イベント楽曲の EXPERT+ 譜面）」で運用されているが、
 * 同じ曲が別の難易度でもう一度登録されると、一覧・曲選択に同名の行が 2 つ並んでしまう。
 * 難易度の高い行（= EXPERT+）を残し、同順位なら先に現れた行を残す。
 */
export function dedupeSameSong(songs: Song[]): Song[] {
  const indexByKey = new Map<string, number>();
  const result: Song[] = [];

  for (const song of songs) {
    // カテゴリと曲名は区切り文字を含まない前提が置けないため NUL で連結する
    const key = `${song.category}\0${song.song_name}`;
    const found = indexByKey.get(key);
    if (found === undefined) {
      indexByKey.set(key, result.length);
      result.push(song);
    } else if (difficultyRank(song.difficulty) > difficultyRank(result[found].difficulty)) {
      result[found] = song;
    }
  }

  return result;
}

/**
 * 有効な楽曲データのみに絞り込む（カテゴリ・アーティスト・ノーツ数がすべて存在するもの）。
 * あわせて同一カテゴリ内の同名曲を 1 行に畳む。
 */
export function filterValidSongs(songs: Song[]): Song[] {
  return dedupeSameSong(songs.filter(s => s.category && s.artist && s.notes_count));
}

/**
 * `src/data/event-songs.json` の eventSongIds（配列順を維持）。
 * 曲選択ドロップダウンで「イベント対象楽曲」グループとして先頭に出す。
 */
export function getEventSongIds(): number[] {
  /* v8 ignore next 3 -- event-songs.json の eventSongIds は実 config で常に配列のため : [] へ到達しない */
  return Array.isArray(eventSongsConfig.eventSongIds)
    ? (eventSongsConfig.eventSongIds as number[])
    : [];
}

/**
 * eventSongIds の config 順で、songs に存在する最初の曲 ID を返す（既定選択用）。
 * 該当が無ければ null。
 */
export function firstEventSongId(songs: Song[]): number | null {
  const ids = new Set(songs.map((s) => s.id).filter((id): id is number => id !== null));
  for (const id of getEventSongIds()) {
    if (ids.has(id)) return id;
  }
  return null;
}

/**
 * 楽曲データをGoogle Spreadsheetから取得してネスト構造のJSON配列で返す
 */
export async function fetchSongsJson(): Promise<Song[]> {
  const table = await fetchSheetRaw(SPREADSHEET_ID, SONGS_GID);

  return table.rows
    .map((row) => convertRow(row.c || []))
    .filter((row) => row.song_name !== null);
}
