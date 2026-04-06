/**
 * Google Spreadsheet GViz JSON → 固定ブローチデータJSON変換ユーティリティ
 *
 * 使い方:
 *   import { fetchFixedBroachsJson } from './fetchFixedBroachsJson.js';
 *   const data = await fetchFixedBroachsJson();
 *   console.log(data);
 */

const SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';
const GID = 1087762308;

// カラム定義 (col index → key)、空ラベルのカラムは除外
const COLUMNS = {
  0: 'id',
  1: 'card_id',
  2: 'card_name',
  3: 'name',
  4: 'name_other',
  6: 'shout',
  7: 'beat',
  8: 'melody',
  10: 'attribute',
  11: 'idol',
  12: 'group',
  13: 'auto',
  14: 'song',
  15: 'score',
  16: 'limit',
  17: 'broach_type',
};

function extractCellValue(cell) {
  if (!cell || cell.v === null || cell.v === undefined) {
    return null;
  }
  const v = cell.v;
  if (typeof v === 'string' && /^Date\(\d+,\d+,\d+/.test(v)) {
    const m = v.match(/Date\((\d+),(\d+),(\d+)/);
    if (m) return new Date(Number(m[1]), Number(m[2]), Number(m[3])).toISOString().split('T')[0];
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

/**
 * 固定ブローチデータをGoogle Spreadsheetから取得してJSON配列で返す
 * @returns {Promise<Object[]>} ブローチデータ配列
 */
export async function fetchFixedBroachsJson() {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`スプレッドシートの取得に失敗: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const gvizData = parseGvizResponse(text);
  const table = gvizData.table;

  return table.rows
    .map((row) => {
      const cells = row.c || [];
      const obj = {};
      for (const [col, key] of Object.entries(COLUMNS)) {
        obj[key] = extractCellValue(cells[col] ?? null);
      }
      return obj;
    })
    .filter((row) => row.card_name != null);
}
