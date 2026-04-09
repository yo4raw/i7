import { SPREADSHEET_ID, extractCellValue, parseGvizResponse } from './gviz.ts';

export interface FixedBroach {
  id: number | null;
  card_id: number | null;
  card_name: string | null;
  name: string | null;
  name_other: string | null;
  shout: number | null;
  beat: number | null;
  melody: number | null;
  attribute: string | null;
  idol: string | null;
  group: string | null;
  auto: string | null;
  song: string | null;
  score: number | null;
  limit: number | null;
  broach_type: string | null;
  [key: string]: string | number | boolean | null;
}

const GID = 1087762308;

// カラム定義 (col index → key)、空ラベルのカラムは除外
const COLUMNS: Record<number, string> = {
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

/**
 * 固定ブローチデータをGoogle Spreadsheetから取得してJSON配列で返す
 */
export async function fetchFixedBroachsJson(): Promise<FixedBroach[]> {
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
      const obj: Record<string, string | number | boolean | null> = {};
      for (const [col, key] of Object.entries(COLUMNS)) {
        obj[key] = extractCellValue(cells[Number(col)] ?? null);
      }
      return obj as unknown as FixedBroach;
    })
    .filter((row) => row.card_name != null);
}
