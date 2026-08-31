import { describe, it, expect } from 'vitest';
import {
  rabbitEquals, rabbitMapToRowSet, rabbitRowsToRowSet, rowSetToRabbitMap,
} from '../../../../src/lib/sync/projection/rabbitNotes';

describe('rabbitMapToRowSet', () => {
  it('キャラクター名をキーに行集合を作る', () => {
    const map = { 七瀬陸: { shout: 1, beat: 2, melody: 3 } };
    expect([...rabbitMapToRowSet(map)]).toEqual([['七瀬陸', { shout: 1, beat: 2, melody: 3 }]]);
  });

  it('欠けた属性・負値・小数は 0 以上の整数に丸める', () => {
    const map = { 和泉一織: { shout: -1, beat: 2.9, melody: Number.NaN } };
    expect(rabbitMapToRowSet(map).get('和泉一織')).toEqual({ shout: 0, beat: 2, melody: 0 });
  });

  it('空オブジェクトは空の行集合', () => {
    expect(rabbitMapToRowSet({}).size).toBe(0);
  });
});

describe('rowSetToRabbitMap', () => {
  it('行集合を RabbitNoteMap に戻す', () => {
    const rows = new Map([['二階堂大和', { shout: 0, beat: 0, melody: 5 }]]);
    expect(rowSetToRabbitMap(rows)).toEqual({ 二階堂大和: { shout: 0, beat: 0, melody: 5 } });
  });

  it('全属性 0 のエントリも残す (0 が未所持の表現)', () => {
    const rows = new Map([['四葉環', { shout: 0, beat: 0, melody: 0 }]]);
    expect(rowSetToRabbitMap(rows)).toEqual({ 四葉環: { shout: 0, beat: 0, melody: 0 } });
  });
});

describe('rabbitRowsToRowSet', () => {
  it('サーバの行から行集合を作る (余分な列は無視する)', () => {
    const rows = [{
      user_id: 'u', character: '逢坂壮五', shout: 1, beat: 0, melody: 0,
      rev: 7, updated_at: '2026-08-31T00:00:00Z',
    }];
    expect([...rabbitRowsToRowSet(rows)]).toEqual([['逢坂壮五', { shout: 1, beat: 0, melody: 0 }]]);
  });
});

describe('rabbitEquals', () => {
  it('3 属性すべて一致で true', () => {
    expect(rabbitEquals({ shout: 1, beat: 2, melody: 3 }, { shout: 1, beat: 2, melody: 3 })).toBe(true);
  });

  it('1 属性でも違えば false', () => {
    expect(rabbitEquals({ shout: 1, beat: 2, melody: 3 }, { shout: 1, beat: 2, melody: 4 })).toBe(false);
  });
});
