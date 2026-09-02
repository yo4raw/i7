import type { RabbitNoteMap } from '../../data/rabbitNote';
import type { RabbitNoteRow, RowSet } from '../rows';

export type RabbitNoteValue = { shout: number; beat: number; melody: number };

function normalize(value: number | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toValue(entry: Partial<RabbitNoteValue>): RabbitNoteValue {
  return { shout: normalize(entry.shout), beat: normalize(entry.beat), melody: normalize(entry.melody) };
}

export function rabbitMapToRowSet(map: RabbitNoteMap): RowSet<RabbitNoteValue> {
  return new Map(Object.entries(map).map(([character, entry]) => [character, toValue(entry)]));
}

/** 全属性 0 のエントリも残す。0 が未所持の表現であり、削除の伝播を値変更に還元している */
export function rowSetToRabbitMap(rows: RowSet<RabbitNoteValue>): RabbitNoteMap {
  const out: RabbitNoteMap = {};
  for (const [character, value] of rows) out[character] = { ...value };
  return out;
}

export function rabbitRowsToRowSet(rows: readonly RabbitNoteRow[]): RowSet<RabbitNoteValue> {
  return new Map(rows.map((row) => [row.character, toValue(row)]));
}

export function rabbitEquals(a: RabbitNoteValue, b: RabbitNoteValue): boolean {
  return a.shout === b.shout && a.beat === b.beat && a.melody === b.melody;
}
