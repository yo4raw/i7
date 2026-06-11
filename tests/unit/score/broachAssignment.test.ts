import { describe, it, expect } from 'vitest';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FlatNote } from '../../../src/lib/score/types';
import {
  calcAttrWeights,
  countDeckAttrs,
  broachValue,
  broachCapacity,
  assignBroachs,
  type AttrWeights,
} from '../../../src/lib/score/broachAssignment';

const ur = (attribute: string, cardID: number): Card =>
  ({ rarity: 'UR', attribute, cardID } as unknown as Card);
const sr = (attribute: string, cardID: number): Card =>
  ({ rarity: 'SR', attribute, cardID } as unknown as Card);

const note = (attribute: FlatNote['attribute'], type: FlatNote['type'], group = 'light_2'): FlatNote =>
  ({ attribute, type, group, excluded: false });

// Shout 偏重の重み (Shout 主体の譜面相当)
const W: AttrWeights = { Shout: 10, Beat: 1, Melody: 1 };
const noFixed = () => false;

describe('broachAssignment (共通ブローチのグリーディ割当)', () => {
  it('calcAttrWeights: ノーツの属性ごとに NOTE_RATE×LIGHT_MULTIPLIER を合算する', () => {
    const w = calcAttrWeights([
      note('Shout', 'white'),          // 0.025 × 1.0
      note('Beat', 'color'),           // 0.030 × 1.0
      note('Beat', 'color', 'light_6'), // 0.030 × 1.5
    ]);
    expect(w.Shout).toBeCloseTo(0.025);
    expect(w.Beat).toBeCloseTo(0.03 + 0.045);
    expect(w.Melody).toBe(0);
  });

  it('countDeckAttrs: 6 枠の属性別枚数を数える (null は無視)', () => {
    const counts = countDeckAttrs([ur('Shout', 1), ur('Shout', 2), ur('Beat', 3), null, null, ur('Melody', 4)]);
    expect(counts).toEqual({ Shout: 2, Beat: 1, Melody: 1 });
  });

  it('broachCapacity: UR=2 / 固有ブローチ持ち UR=1 / UR 以外と空=0', () => {
    expect(broachCapacity(ur('Shout', 1), noFixed)).toBe(2);
    expect(broachCapacity(ur('Shout', 1), () => true)).toBe(1);
    expect(broachCapacity(sr('Shout', 1), noFixed)).toBe(0);
    expect(broachCapacity(null, noFixed)).toBe(0);
  });

  it('broachValue: 条件付きブローチは対象属性枚数を乗じる', () => {
    const sb = { id: 24, name: 'S枚数分', shout: 300, beat: 0, melody: 0, targetAttribute: 'Shout' as const };
    expect(broachValue(sb, W, { Shout: 3, Beat: 0, Melody: 0 })).toBe(300 * 10 * 3);
    expect(broachValue(sb, W, { Shout: 0, Beat: 3, Melody: 0 })).toBe(0);
  });

  it('assignBroachs: 寄与値の高い順に所持数の範囲で slot 0-4 に割当てる', () => {
    const deck = [ur('Shout', 1), ur('Shout', 2), null, null, null, null];
    // Shout1100(id=6) 1個 + ALL750(id=1) 3個所持 → Shout 偏重なら Shout1100 が先頭
    const sel = assignBroachs(deck, { '6': 1, '1': 3 }, W, noFixed);
    const own = [...sel[0], ...sel[1], ...sel[2], ...sel[3], ...sel[4]];
    expect(own).toHaveLength(4); // 容量 2+2
    expect(sel[0][0]).toBe(6); // 最高値が先頭スロットから埋まる
    expect(own.filter((id) => id === 6)).toHaveLength(1); // 所持 1 個まで
    expect(own.filter((id) => id === 1)).toHaveLength(3);
  });

  it('assignBroachs: 所持合計が容量未満ならあるだけ割当てる', () => {
    const deck = [ur('Shout', 1), null, null, null, null, null];
    const sel = assignBroachs(deck, { '1': 1 }, W, noFixed);
    expect(sel[0]).toEqual([1]);
    expect(sel[1]).toEqual([]);
  });

  it('assignBroachs: UR 以外と固有ブローチ持ちの容量を守る', () => {
    const hasFixed = (c: Card) => c.cardID === 1;
    const deck = [ur('Shout', 1), sr('Shout', 2), null, null, null, null];
    const sel = assignBroachs(deck, { '1': 5 }, W, hasFixed);
    expect(sel[0]).toEqual([1]); // 固有ブローチ持ち → 1 個
    expect(sel[1]).toEqual([]); // SR → 0 個
  });

  it('assignBroachs: フレンド枠は所持制約なしで最良ブローチを重複割当てる', () => {
    const deck = [null, null, null, null, null, ur('Shout', 9)];
    const sel = assignBroachs(deck, {}, W, noFixed);
    expect(sel[5]).toHaveLength(2);
    expect(sel[5][0]).toBe(sel[5][1]); // 同種 2 個
    expect(sel[5][0]).toBe(6); // Shout 偏重では Shout1100 (id=6) が最良
  });

  it('assignBroachs: 固有ブローチ持ちフレンドは 1 個のみ', () => {
    const deck = [null, null, null, null, null, ur('Shout', 9)];
    const sel = assignBroachs(deck, {}, W, (c) => c.cardID === 9);
    expect(sel[5]).toHaveLength(1);
  });

  it('assignBroachs: 条件付きブローチが編成次第で無条件ブローチを上回る', () => {
    // Shout 5 枚編成: S属性枚数分Shout+300 (id=24) = 300×5 = 1500 > Shout1100
    const deck = [ur('Shout', 1), ur('Shout', 2), ur('Shout', 3), ur('Shout', 4), ur('Shout', 5), ur('Shout', 6)];
    const sel = assignBroachs(deck, { '24': 1, '6': 1 }, W, noFixed);
    expect(sel[0][0]).toBe(24);
    expect(sel[5][0]).toBe(24); // フレンド枠の最良も条件付き
  });
});
