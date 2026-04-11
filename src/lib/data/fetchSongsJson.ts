import { SPREADSHEET_ID, extractCellValue, fetchSheetRaw, type GVizCell } from './gviz.ts';

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

/**
 * 有効な楽曲データのみに絞り込む（カテゴリ・アーティスト・ノーツ数がすべて存在するもの）
 */
export function filterValidSongs(songs: Song[]): Song[] {
  return songs.filter(s => s.category && s.artist && s.notes_count);
}

/**
 * 楽曲データをGoogle Spreadsheetから取得してネスト構造のJSON配列で返す
 */
export async function fetchSongsJson(): Promise<Song[]> {
  const table = await fetchSheetRaw(SPREADSHEET_ID, SONGS_GID);

  return table.rows
    .map((row) => convertRow(row.c || []))
    .filter((row) => row.song_name != null);
}
