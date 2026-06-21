import { describe, it, expect } from 'vitest';
import { toEventForBonus, type EventRow } from '../../../src/lib/data/fetchEventsCsv';

function makeRow(over: Partial<EventRow> = {}): EventRow {
  const emptyTier = { cardIds: [], costumeIds: [], effect: [], param_up: 0, item_up: 0, bpt_up: 0, ept_up: 0, gpt_up: 0, score_up: 0 };
  return {
    id: 1, eventname: 'テストイベント', eventtype: 'ハイスコアライブイベント',
    start_date: '2026-06-15', end_date: '2026-06-22', special3_member: '', comment: '',
    gold: { ...emptyTier, cardIds: [10] }, silver: { ...emptyTier }, bronze: { ...emptyTier },
    ...over,
  };
}

describe('toEventForBonus', () => {
  it('eventtype を含めて返す', () => {
    const out = toEventForBonus(makeRow());
    expect(out.eventtype).toBe('ハイスコアライブイベント');
    expect(out.eventname).toBe('テストイベント');
    expect(out.gold).toEqual([10]);
  });
});
