import { describe, it, expect } from 'vitest';
import { achievableBonusPcts } from '../../../src/lib/pointCalc/bonusPresets';
import { DEFAULT_BONUS_COUNTS, DEFAULT_BONUS_RATES } from '../../../src/lib/pointCalc/constants';
import type { BonusCounts, BonusRates } from '../../../src/lib/pointCalc/types';

const rates = (o: Partial<BonusRates> = {}): BonusRates => ({ gold: 50, silver: 20, bronze: 5, ...o });
const counts = (o: Partial<BonusCounts> = {}): BonusCounts => ({ gold: 0, silver: 0, bronze: 0, ...o });

describe('achievableBonusPcts: 基本', () => {
  it('既定値（上昇率 50/20/5・枚数 6/0/0）では 50 刻みの 7 段階になる', () => {
    expect(achievableBonusPcts(DEFAULT_BONUS_RATES, DEFAULT_BONUS_COUNTS))
      .toEqual([0, 50, 100, 150, 200, 250, 300]);
  });

  it('0 を必ず含む（1 枚も入れずに叩くパターン）', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 3 }))[0]).toBe(0);
  });

  it('昇順かつ重複なしで返す', () => {
    const result = achievableBonusPcts(rates(), counts({ gold: 6, silver: 6, bronze: 6 }));
    for (let i = 1; i < result.length; i++) expect(result[i]).toBeGreaterThan(result[i - 1]);
  });

  it('金 1 枚だけなら 0 と 50 の 2 段階', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 1 }))).toEqual([0, 50]);
  });

  it('金 2 枚・銀 3 枚の組合せを列挙する', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 2, silver: 3 })))
      .toEqual([0, 20, 40, 50, 60, 70, 90, 100, 110, 120, 140, 160]);
  });

  it('上昇率を変えると段階が変わる', () => {
    expect(achievableBonusPcts(rates({ gold: 30 }), counts({ gold: 2 }))).toEqual([0, 30, 60]);
  });
});

describe('achievableBonusPcts: 上限', () => {
  it('枚数の上限が効く（金 2 枚なら 100% までしか出ない）', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 2 }))).toEqual([0, 50, 100]);
  });

  it('スロット上限 6 が効く（各 6 枚持っていても合計 6 枚まで）', () => {
    // 6 枠を金/銀/銅に振り分ける全組合せで 49 段階になる
    expect(achievableBonusPcts(rates(), counts({ gold: 6, silver: 6, bronze: 6 }))).toHaveLength(49);
  });

  it('枚数がスロット上限を超えていてもスロット上限で頭打ちになる', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 99 })))
      .toEqual(achievableBonusPcts(rates(), counts({ gold: 6 })));
  });

  it('slots を明示するとその枠数で列挙する', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 6, silver: 6 }), 2))
      .toEqual([0, 20, 40, 50, 70, 100]);
  });
});

describe('achievableBonusPcts: 退化ケース', () => {
  it('枚数が全て 0 なら [0] のみ', () => {
    expect(achievableBonusPcts(rates(), counts())).toEqual([0]);
  });

  it('上昇率が 0 のティアは枚数を増やしても段階を増やさない', () => {
    expect(achievableBonusPcts(rates({ silver: 0, bronze: 0 }), counts({ gold: 2, silver: 6, bronze: 6 })))
      .toEqual([0, 50, 100]);
  });

  it('slots が 0 なら [0] のみ', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 6 }), 0)).toEqual([0]);
  });
});

describe('achievableBonusPcts: 入力の正規化', () => {
  it('負の枚数は 0 として扱う', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: -3 }))).toEqual([0]);
  });

  it('負の上昇率は 0 として扱う', () => {
    expect(achievableBonusPcts(rates({ gold: -50 }), counts({ gold: 2 }))).toEqual([0]);
  });

  it('非整数は切り捨てる', () => {
    expect(achievableBonusPcts(rates({ gold: 50.9 }), counts({ gold: 2.9 })))
      .toEqual(achievableBonusPcts(rates({ gold: 50 }), counts({ gold: 2 })));
  });

  it('負の slots は 0 として扱う', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: 6 }), -1)).toEqual([0]);
  });

  it('NaN は 0 として扱う（normalize の非有限分岐）', () => {
    expect(achievableBonusPcts(rates(), counts({ gold: Number.NaN }))).toEqual([0]);
    expect(achievableBonusPcts(rates({ gold: Number.NaN }), counts({ gold: 2 }))).toEqual([0]);
  });
});
