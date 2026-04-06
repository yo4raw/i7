/**
 * Google Spreadsheet GViz JSON → 楽曲データJSON変換ユーティリティ
 *
 * 2行ヘッダーのSongsシートからデータを取得し、
 * ネスト構造のオブジェクト配列に変換する。
 *
 * 使い方:
 *   import { fetchSongsJson } from './fetchSongsJson.js';
 *   const data = await fetchSongsJson();
 *   console.log(data);
 */

const SONGS_SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';
const SONGS_GID = 1083871743;

// フラットカラム定義 (col index → key)
const FLAT_COLUMNS = {
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
const NESTED_GROUPS = {
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
const SUB_KEYS = [
  'shout_white', 'shout_color',
  'beat_white', 'beat_color',
  'melody_white', 'melody_color',
];

// 合計カラム定義
const TOTAL_COLUMNS = {
  60: 'total_shout_white',
  61: 'total_shout_color',
  62: 'total_beat_white',
  63: 'total_beat_color',
  64: 'total_melody_white',
  65: 'total_melody_color',
};

// col 66 = updated_at, col 67 = 除外

function extractCellValue(cell) {
  if (!cell || cell.v === null || cell.v === undefined) {
    return null;
  }
  const v = cell.v;
  if (typeof v === 'string' && /^Date\(\d+,\d+,\d+/.test(v)) {
    return new Date(eval(v)).toISOString().split('T')[0];
  }
  return v;
}

function parseGvizResponse(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
  if (!match) {
    throw new Error('GViz JSONレスポンスのパースに失敗しました');
  }
  return JSON.parse(match[1]);
}

function convertRow(cells) {
  const obj = {};

  // フラットカラム
  for (const [col, key] of Object.entries(FLAT_COLUMNS)) {
    let val = extractCellValue(cells[col] ?? null);
    if (key === 'stars' && typeof val === 'string') {
      val = val.length;
    }
    obj[key] = val;
  }

  // ネストグループ
  for (const [startCol, groupKey] of Object.entries(NESTED_GROUPS)) {
    const group = {};
    const start = Number(startCol);
    SUB_KEYS.forEach((subKey, i) => {
      group[subKey] = extractCellValue(cells[start + i] ?? null) ?? 0;
    });
    obj[groupKey] = group;
  }

  // 合計カラム
  for (const [col, key] of Object.entries(TOTAL_COLUMNS)) {
    obj[key] = extractCellValue(cells[col] ?? null);
  }

  // データ更新日
  obj.updated_at = extractCellValue(cells[66] ?? null);

  return obj;
}

/**
 * 楽曲データをGoogle Spreadsheetから取得してネスト構造のJSON配列で返す
 * @returns {Promise<Object[]>} 楽曲データ配列
 */
export async function fetchSongsJson() {
  const url = `https://docs.google.com/spreadsheets/d/${SONGS_SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${SONGS_GID}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`スプレッドシートの取得に失敗: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const gvizData = parseGvizResponse(text);
  const table = gvizData.table;

  return table.rows
    .map((row) => convertRow(row.c || []))
    .filter((row) => row.song_name != null);
}
