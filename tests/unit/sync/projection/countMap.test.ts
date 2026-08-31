import { describe, it, expect } from 'vitest';
import {
  countMapToRowSet, countRowsToRowSet, rowSetToCountMap,
} from '../../../../src/lib/sync/projection/countMap';

describe('countMapToRowSet', () => {
  it('localStorage の CountMap を行集合にする', () => {
    expect([...countMapToRowSet({ '5': 2, '12': 1 })]).toEqual([['5', 2], ['12', 1]]);
  });

  it('0 のエントリも行として残す (0 が削除の表現であり tombstone を兼ねる)', () => {
    expect([...countMapToRowSet({ '5': 0 })]).toEqual([['5', 0]]);
  });

  it('負値・小数・NaN は 0 以上の整数に丸める', () => {
    expect([...countMapToRowSet({ a: -3, b: 2.7, c: Number.NaN })]).toEqual([['a', 0], ['b', 2], ['c', 0]]);
  });

  it('空オブジェクトは空の行集合', () => {
    expect(countMapToRowSet({}).size).toBe(0);
  });
});

describe('rowSetToCountMap', () => {
  it('行集合を CountMap に戻す。0 のエントリは落とす (既存ストアの表現に合わせる)', () => {
    expect(rowSetToCountMap(new Map([['5', 2], ['12', 0]]))).toEqual({ '5': 2 });
  });

  it('空の行集合は空オブジェクト', () => {
    expect(rowSetToCountMap(new Map())).toEqual({});
  });
});

describe('countRowsToRowSet', () => {
  it('card_id の行を行集合にする', () => {
    const rows = [{ card_id: 5, count: 2 }, { card_id: 12, count: 0 }];
    expect([...countRowsToRowSet(rows, 'card_id')]).toEqual([['5', 2], ['12', 0]]);
  });

  it('broach_id の行を行集合にする', () => {
    expect([...countRowsToRowSet([{ broach_id: 3, count: 1 }], 'broach_id')]).toEqual([['3', 1]]);
  });
});
