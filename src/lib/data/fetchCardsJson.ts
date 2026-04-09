import { SPREADSHEET_ID, fetchSheetAsJson } from './gviz.ts';

export interface Card {
  [key: string]: string | number | boolean | null;
}

const CARDS_GID = 480354522;

/** ap_skill_type の表記揺れを正規化するマップ */
const SKILL_TYPE_NORMALIZE: Record<string, string> = {
  'MISS→GOOD': 'MISS→Good',
  '判定領域を': '判定縮小スコアアップ',
};

/**
 * カードデータをGoogle Spreadsheetから取得してクリーンなJSON配列で返す
 */
export async function fetchCardsJson(): Promise<Card[]> {
  const rows = await fetchSheetAsJson(SPREADSHEET_ID, CARDS_GID);
  return rows.map((row) => {
    const raw = row.ap_skill_type;
    if (typeof raw === 'string' && raw in SKILL_TYPE_NORMALIZE) {
      row.ap_skill_type = SKILL_TYPE_NORMALIZE[raw];
    }
    // スコアアップ＋タイマーを区別して表示
    if (row.ap_skill_type === 'スコアアップ' && row.ap_skill_req === 'タイマー') {
      row.ap_skill_type = 'スコアアップ（タイマー）';
    }
    return row;
  });
}
