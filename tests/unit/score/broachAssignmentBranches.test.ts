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
import { SHARED_BROACHS } from '../../../src/lib/data/sharedBroachs';
import { NOTE_RATE, LIGHT_MULTIPLIER } from '../../../src/lib/score/constants';
import { findCardById } from '../../fixtures';

const urBeat = findCardById(959); // UR / Beat / IDOLiSH7
const urShout = findCardById(406); // UR / Shout

function note(attribute: FlatNote['attribute'], type: FlatNote['type'], group: string): FlatNote {
  return { attribute, type, group, excluded: false };
}

const noFixed = () => false;

describe('calcAttrWeights', () => {
  it('既知グループのノーツは NOTE_RATE × LIGHT_MULTIPLIER で重み付けされる', () => {
    const w = calcAttrWeights([note('Shout', 'color', 'light_4')]);
    expect(w.Shout).toBeCloseTo(NOTE_RATE.color * LIGHT_MULTIPLIER.light_4, 10);
    expect(w.Beat).toBe(0);
    expect(w.Melody).toBe(0);
  });

  it('LIGHT_MULTIPLIER に無いグループは 0 倍として無視される (line 26 || 0)', () => {
    const w = calcAttrWeights([note('Beat', 'white', 'unknown_group')]);
    expect(w.Beat).toBe(0);
    expect(w.Shout).toBe(0);
    expect(w.Melody).toBe(0);
  });
});

describe('countDeckAttrs', () => {
  it('属性別カード枚数を集計し、null スロットは無視する', () => {
    const deck: (Card | null)[] = [urBeat, urShout, null, null, null, null];
    const counts = countDeckAttrs(deck);
    expect(counts.Beat).toBe(1);
    expect(counts.Shout).toBe(1);
    expect(counts.Melody).toBe(0);
  });
});

describe('broachValue', () => {
  const weights: AttrWeights = { Shout: 1, Beat: 2, Melody: 3 };
  const attrCounts = { Shout: 2, Beat: 1, Melody: 0 };

  it('無条件ブローチ (ALL750) は倍率 1 で重み付き寄与値を返す', () => {
    const all750 = SHARED_BROACHS.find(s => s.id === 1)!;
    expect(broachValue(all750, weights, attrCounts)).toBe((750 * 1 + 750 * 2 + 750 * 3) * 1);
  });

  it('条件付きブローチ (S属性枚数分Shout+300, id=24) は対象属性枚数を倍率にする', () => {
    const cond = SHARED_BROACHS.find(s => s.id === 24)!;
    // targetAttribute=Shout、attrCounts.Shout=2 → 倍率 2
    expect(broachValue(cond, weights, attrCounts)).toBe((300 * 1) * 2);
  });
});

describe('broachCapacity', () => {
  const hasFixed = (card: Card) => card.cardID === urBeat.cardID;

  it('null スロットは 0', () => {
    expect(broachCapacity(null, hasFixed)).toBe(0);
  });

  it('非 UR カードは 0', () => {
    const sr = findCardById(1622); // SR
    expect(broachCapacity(sr, hasFixed)).toBe(0);
  });

  it('UR で固有ブローチ持ちは 1', () => {
    expect(broachCapacity(urBeat, hasFixed)).toBe(1);
  });

  it('UR で固有ブローチ無しは 2', () => {
    expect(broachCapacity(urShout, hasFixed)).toBe(2);
  });
});

describe('assignBroachs', () => {
  const weights: AttrWeights = { Shout: 1, Beat: 1, Melody: 1 };

  it('所持ブローチを寄与値降順で slot0-4 に貪欲割当し、フレンド枠 (slot5) に最良ブローチを容量分割当てる', () => {
    // slot0-4 全員 UR・固有なし → 各 cap 2、friend(slot5) も UR → cap 2
    const deck: (Card | null)[] = [urShout, urShout, urShout, urShout, urShout, urShout];
    // ALL750 (id1) を 1 個所持
    const owned: Record<string, number> = { '1': 1 };
    const sel = assignBroachs(deck, owned, weights, noFixed);
    // 所持 1 個 → slot0 に 1 個割当 (line 77 / 83-87)
    expect(sel[0]).toEqual([1]);
    expect(sel[1]).toEqual([]);
    // フレンド枠: 全種から最良 (ALL750=id1) を cap2 個 (line 92-104)
    expect(sel[5]).toEqual([1, 1]);
  });

  it('寄与値 0 のブローチ (重み全 0 で属性値 0) は展開されない', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, null];
    // Shout1100 (id6) は beat/melody=0。weights を Beat/Melody のみ正にすると寄与値 0
    const beatOnlyWeights: AttrWeights = { Shout: 0, Beat: 1, Melody: 1 };
    const owned: Record<string, number> = { '6': 1 };
    const sel = assignBroachs(deck, owned, beatOnlyWeights, noFixed);
    expect(sel[0]).toEqual([]);
  });

  it('所持数 0 のブローチはスキップされる', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, null];
    const owned: Record<string, number> = { '1': 0 };
    const sel = assignBroachs(deck, owned, weights, noFixed);
    expect(sel[0]).toEqual([]);
  });

  it('フレンド枠が非 UR (cap 0) のときフレンド割当は行われない', () => {
    const sr = findCardById(1622); // SR
    const deck: (Card | null)[] = [urShout, null, null, null, null, sr];
    const owned: Record<string, number> = { '1': 5 };
    const sel = assignBroachs(deck, owned, weights, noFixed);
    expect(sel[5]).toEqual([]);
  });

  it('全ブローチの寄与値が 0 のときフレンド枠の best は null のまま (line 102 false 分岐)', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, urShout];
    const zeroWeights: AttrWeights = { Shout: 0, Beat: 0, Melody: 0 };
    const sel = assignBroachs(deck, {}, zeroWeights, noFixed);
    expect(sel[5]).toEqual([]);
  });
});
