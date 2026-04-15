import { SPREADSHEET_ID, fetchSheetAsJson } from './gviz.ts';
import { CHARACTER_GROUPS } from '../constants';

/** APスキル1レベル分のパラメータ */
export interface ApSkillLevel {
  count: number | null;   // 発動間隔（ノート数 or 秒数）
  per: number | null;     // 発動確率（%）
  value: number | null;   // 効果値（スコアアップ加算値）
  rate: number | null;    // 効果率
}

export interface Card {
  // 基本情報
  ID: number | null;
  cardID: number | null;
  cardname: string | null;
  name: string | null;
  name_other: string | null;
  groupname: string | null;
  rarity: string | null;
  get_type: string | null;
  story: string | null;
  awakening_item: string | null;

  // 属性（"Shout" | "Beat" | "Melody"）
  attribute: string | null;

  // ステータス
  shout_min: number | null;
  shout_max: number | null;
  beat_min: number | null;
  beat_max: number | null;
  melody_min: number | null;
  melody_max: number | null;

  // APスキル
  ap_skill_type: string | null;
  ap_skill_req: string | null;
  ap_skill_name: string | null;
  ap_skill_1_count: number | null;
  ap_skill_1_per: number | null;
  ap_skill_1_value: number | null;
  ap_skill_1_rate: number | null;
  ap_skill_2_count: number | null;
  ap_skill_2_per: number | null;
  ap_skill_2_value: number | null;
  ap_skill_2_rate: number | null;
  ap_skill_3_count: number | null;
  ap_skill_3_per: number | null;
  ap_skill_3_value: number | null;
  ap_skill_3_rate: number | null;
  ap_skill_4_count: number | null;
  ap_skill_4_per: number | null;
  ap_skill_4_value: number | null;
  ap_skill_4_rate: number | null;
  ap_skill_5_count: number | null;
  ap_skill_5_per: number | null;
  ap_skill_5_value: number | null;
  ap_skill_5_rate: number | null;

  // センタースキル・SPスキル
  ct_skill: string | null;
  comment: string | null;
  sp_time: number | null;
  sp_value: number | null;

  // スプレッドシートに将来カラム追加された場合のフォールバック
  [key: string]: string | number | boolean | null;
}

const CARDS_GID = 480354522;

/** ap_skill_type の表記揺れを正規化するマップ */
const SKILL_TYPE_NORMALIZE: Record<string, string> = {
  'MISS→GOOD': 'MISS→Good',
  '判定領域を': '判定縮小スコアアップ',
};

const MIN_EXPECTED_CARDS = 100;

/**
 * カードデータをGoogle Spreadsheetから取得してクリーンなJSON配列で返す
 */
export async function fetchCardsJson(): Promise<Card[]> {
  const rows = await fetchSheetAsJson(SPREADSHEET_ID, CARDS_GID);
  if (rows.length < MIN_EXPECTED_CARDS) {
    throw new Error(`カードデータが不足しています: ${rows.length}件 (最低${MIN_EXPECTED_CARDS}件を期待)`);
  }
  return rows.map((row) => {
    const raw = row.ap_skill_type;
    if (typeof raw === 'string' && raw in SKILL_TYPE_NORMALIZE) {
      row.ap_skill_type = SKILL_TYPE_NORMALIZE[raw];
    }
    // スコアアップ系は発動条件を括弧付きで表示（例: スコアアップ（タイマー）、スコアアップ（コンポ））
    if (row.ap_skill_type === 'スコアアップ' && row.ap_skill_req) {
      row.ap_skill_type = `スコアアップ（${row.ap_skill_req}）`;
    }
    // groupname が null の場合、キャラクター名からグループを解決
    if (!row.groupname && row.name) {
      for (const group of CHARACTER_GROUPS) {
        if ((group.members as readonly string[]).includes(row.name as string)) {
          row.groupname = group.name;
          break;
        }
      }
    }
    return row as unknown as Card;
  });
}

/** カードからN番目のAPスキルレベルのパラメータを取得する */
export function getApSkillLevel(card: Card, level: 1 | 2 | 3 | 4 | 5): ApSkillLevel {
  return {
    count: card[`ap_skill_${level}_count`] as number | null,
    per: card[`ap_skill_${level}_per`] as number | null,
    value: card[`ap_skill_${level}_value`] as number | null,
    rate: card[`ap_skill_${level}_rate`] as number | null,
  };
}
