/**
 * Google Spreadsheet GViz JSON → クリーンJSON変換ユーティリティ
 *
 * GViz (Google Visualization) エンドポイントからスプレッドシートデータを取得し、
 * 1行目をヘッダーとしたオブジェクト配列に変換する。
 *
 * 使い方:
 *   import { fetchCardsJson } from './fetchCardsJson.js';
 *   const data = await fetchCardsJson();
 *   console.log(data);
 */

/**
 * GVizセルから値を抽出する
 * @param {Object|null} cell - GVizセルオブジェクト {v: value, f: formattedValue}
 * @returns {*} セルの値
 */
function extractCellValue(cell) {
  if (!cell || cell.v === null || cell.v === undefined) {
    return null;
  }
  const v = cell.v;
  // GViz Date型: "Date(2024,0,15)" のようなパターン
  if (typeof v === 'string' && /^Date\(\d+,\d+,\d+/.test(v)) {
    const m = v.match(/Date\((\d+),(\d+),(\d+)/);
    if (m) return new Date(Number(m[1]), Number(m[2]), Number(m[3])).toISOString().split('T')[0];
  }
  return v;
}

/**
 * GViz JSONレスポンスからJSONP wrappingを除去してパースする
 * @param {string} text - GVizレスポンステキスト
 * @returns {Object} パースされたJSONオブジェクト
 */
function parseGvizResponse(text) {
  // "/*O_o*/\ngoogle.visualization.Query.setResponse({...});" の形式
  const match = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
  if (!match) {
    throw new Error('GViz JSONレスポンスのパースに失敗しました');
  }
  return JSON.parse(match[1]);
}

const CARDS_SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';
const CARDS_GID = 480354522;

/**
 * GViz JSON経由でスプレッドシートデータを取得し、クリーンなJSON配列に変換する
 */
async function fetchSheetAsJson(spreadsheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&gid=${gid}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`スプレッドシートの取得に失敗: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const gvizData = parseGvizResponse(text);
  const table = gvizData.table;

  const headers = table.cols.map((col, i) => col.label || `column_${i}`);

  return table.rows.map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      if (header.startsWith('column_')) return;
      const cell = row.c ? row.c[i] : null;
      obj[header] = extractCellValue(cell);
    });
    return obj;
  });
}

/**
 * カードデータをGoogle Spreadsheetから取得してクリーンなJSON配列で返す
 * @returns {Promise<Object[]>} カードデータ配列
 */
export async function fetchCardsJson() {
  return fetchSheetAsJson(CARDS_SPREADSHEET_ID, CARDS_GID);
}
