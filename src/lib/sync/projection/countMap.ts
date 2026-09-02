import type { RowSet } from '../rows';

export type CountMap = Record<string, number>;

/** 0 以上の整数に正規化する。NaN / undefined は 0 */
function normalize(value: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * localStorage の CountMap を行集合にする。
 *
 * 0 のエントリを残すのが要点。所持数 0 と未所持はドメイン上同じ意味なので、
 * サーバ側では行を消さず 0 を書くことで削除の伝播を通常の値変更に還元している
 * (ADR 0064 決定 4)。
 */
export function countMapToRowSet(map: CountMap): RowSet<number> {
  return new Map(Object.entries(map).map(([key, value]) => [key, normalize(value)]));
}

/**
 * 行集合を CountMap に戻す。0 は落とす。
 * 既存の cardCounts / broachCounts ストアが 0 のときキーを delete する表現に揃える。
 */
export function rowSetToCountMap(rows: RowSet<number>): CountMap {
  const out: CountMap = {};
  for (const [key, value] of rows) {
    if (value > 0) out[key] = value;
  }
  return out;
}

/** サーバから引いた行を行集合にする */
export function countRowsToRowSet(
  rows: readonly Record<string, unknown>[],
  idKey: 'card_id' | 'broach_id',
): RowSet<number> {
  return new Map(
    rows.map((row) => [String(row[idKey]), normalize(row.count as number)]),
  );
}
