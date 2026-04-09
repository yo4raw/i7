import { SPREADSHEET_ID, fetchSheetAsJson } from './gviz.ts';

export interface Card {
  [key: string]: string | number | boolean | null;
}

const CARDS_GID = 480354522;

/**
 * カードデータをGoogle Spreadsheetから取得してクリーンなJSON配列で返す
 */
export async function fetchCardsJson(): Promise<Card[]> {
  return fetchSheetAsJson(SPREADSHEET_ID, CARDS_GID);
}
