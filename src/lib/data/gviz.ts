/**
 * GViz (Google Visualization) API 共通ユーティリティ
 *
 * Google Spreadsheet の GViz エンドポイントからデータを取得し、
 * 1行目をヘッダーとしたオブジェクト配列に変換する。
 */

export interface GVizCell {
  v: string | number | boolean | null;
  f?: string;
}

export interface GVizRow {
  c: (GVizCell | null)[];
}

export interface GVizTable {
  cols: { id: string; label: string; type: string }[];
  rows: GVizRow[];
}

export interface GVizResponse {
  version: string;
  status: string;
  table: GVizTable;
}

export const SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';

/**
 * GVizセルから値を抽出する
 */
export function extractCellValue(cell: GVizCell | null | undefined): string | number | boolean | null {
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
 */
export function parseGvizResponse(text: string): GVizResponse {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
  if (!match) {
    throw new Error('GViz JSONレスポンスのパースに失敗しました');
  }
  return JSON.parse(match[1]);
}

/**
 * GViz JSON経由でスプレッドシートデータを取得し、クリーンなJSON配列に変換する
 */
export async function fetchSheetAsJson(spreadsheetId: string, gid: number): Promise<Record<string, string | number | boolean | null>[]> {
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
    const obj: Record<string, string | number | boolean | null> = {};
    headers.forEach((header, i) => {
      if (header.startsWith('column_')) return;
      const cell = row.c ? row.c[i] : null;
      obj[header] = extractCellValue(cell);
    });
    return obj;
  });
}
