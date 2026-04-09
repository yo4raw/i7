import { SPREADSHEET_ID, fetchSheetAsJson } from './gviz.ts';

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

/**
 * 固定ブローチデータをGoogle Spreadsheetから取得してJSON配列で返す
 */
export async function fetchFixedBroachsJson(): Promise<FixedBroach[]> {
  const rows = await fetchSheetAsJson(SPREADSHEET_ID, GID);
  return (rows as unknown as FixedBroach[]).filter((row) => row.card_name != null);
}
