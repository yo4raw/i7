import { fetchSheetAsJson } from './gviz.ts';

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
  auto: number | null;
  song: string | null;
  score: number | null;
  limit: number | null;
  broach_type: number | null;
  condition: string | null;
  [key: string]: string | number | boolean | null;
}

const GID = 1087762308;
// 固有ブローチは楽曲と同じスプレッドシート（手動管理マスター）にある。
// gviz.ts の SPREADSHEET_ID（カード用）にはこの gid が存在せず、
// 存在しない gid 指定時に GViz が先頭シート（衣装データ）を返すため
// 列がずれて壊れたデータを取り込んでいた (2026-09 障害)。
const BROACHS_SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';

/**
 * 固定ブローチデータをGoogle Spreadsheetから取得してJSON配列で返す
 */
export async function fetchFixedBroachsJson(): Promise<FixedBroach[]> {
  const rows = await fetchSheetAsJson(BROACHS_SPREADSHEET_ID, GID, {
    0: 'id',              // ID → id
    1: 'card_id',         // cardID → card_id
    2: 'card_name',       // cardname → card_name
    6: 'shout',           // Shout → shout
    7: 'beat',            // Beat → beat
    8: 'melody',          // Melody → melody
    10: 'attribute',      // 属性
    11: 'idol',           // アイドル
    12: 'group',          // グループ
    13: 'auto',           // オート
    14: 'song',           // 楽曲
    15: 'score',          // スコア
    16: 'limit',          // 上限
    17: 'broach_type',    // ブローチの種類
    18: 'condition',      // 条件
  });
  return (rows as unknown as FixedBroach[]).filter((row) => row.card_name !== null);
}
