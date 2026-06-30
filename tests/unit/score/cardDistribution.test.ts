import { describe, it, expect } from 'vitest';
import type { CardSkill } from '../../../src/lib/score/types';
import type { CardStrengthEntry } from '../../../src/lib/score/cardStrength';
import {
  binomialPmf,
  reachProbability,
  cardScorePmf,
  valueToThreshold,
} from '../../../src/lib/score/cardDistribution';
import { allCards } from '../../fixtures';

function skill(partial: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0,
    skillType: 'scoreUp',
    originalType: 'スコアアップ',
    count: 10,
    per: 50,
    value: 1000,
    rate: 0,
    isTimer: false,
    isShrink: false,
    spTime: 0,
    ...partial,
  };
}

function entry(partial: Partial<CardStrengthEntry>): CardStrengthEntry {
  return {
    card: allCards[0],
    attribute: 'Shout',
    appeal: { Shout: 0, Beat: 0, Melody: 0 },
    appealTotal: 0,
    baseScore: 100000,
    skillExpected: 0,
    skillMax: 0,
    totalScore: 100000,
    maxTotalScore: 100000,
    maxActivations: 0,
    maxCoverSec: 0,
    expectedCoverSec: 0,
    skill: null,
    broachScoreBonus: 0,
    appliedBroach: null,
    ...partial,
  };
}

describe('binomialPmf', () => {
  it('総和が 1 になる', () => {
    const pmf = binomialPmf(10, 0.5);
    const sum = pmf.reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(pmf.length).toBe(11);
  });

  it('p=1 は k=n に全質量が集中する', () => {
    const pmf = binomialPmf(4, 1);
    expect(pmf[4]).toBeCloseTo(1, 10);
    expect(pmf[0]).toBeCloseTo(0, 10);
  });

  it('p=0 は k=0 に全質量が集中する', () => {
    const pmf = binomialPmf(4, 0);
    expect(pmf[0]).toBeCloseTo(1, 10);
    expect(pmf[4]).toBeCloseTo(0, 10);
  });

  it('既知値: Binomial(2,0.5) = [0.25, 0.5, 0.25]', () => {
    const pmf = binomialPmf(2, 0.5);
    expect(pmf[0]).toBeCloseTo(0.25, 10);
    expect(pmf[1]).toBeCloseTo(0.5, 10);
    expect(pmf[2]).toBeCloseTo(0.25, 10);
  });
});

describe('reachProbability', () => {
  it('t=0 は必ず 1（土台は確定）', () => {
    const e = entry({ maxActivations: 10, skill: skill({ per: 50 }) });
    expect(reachProbability(e, 0)).toBeCloseTo(1, 10);
  });

  it('右裾の直接和と一致する（n=4, p=0.5, t=0.75 → k>=3）', () => {
    const e = entry({ maxActivations: 4, skill: skill({ per: 50 }) });
    const pmf = binomialPmf(4, 0.5);
    const expected = pmf[3] + pmf[4]; // ceil(0.75*4)=3
    expect(reachProbability(e, 0.75)).toBeCloseTo(expected, 10);
  });

  it('t=1（理論最大）は p^n になる', () => {
    const e = entry({ maxActivations: 5, skill: skill({ per: 80 }) });
    expect(reachProbability(e, 1)).toBeCloseTo(Math.pow(0.8, 5), 10);
  });

  it('スキルなし衣装は t>0 で 0、t=0 で 1', () => {
    const e = entry({ skill: null, maxActivations: 0 });
    expect(reachProbability(e, 0)).toBe(1);
    expect(reachProbability(e, 0.5)).toBe(0);
  });
});

describe('cardScorePmf', () => {
  it('スコアアップ: x = baseScore + k*value、metric=score', () => {
    const e = entry({ baseScore: 100000, maxActivations: 3, skill: skill({ value: 1000, per: 50 }) });
    const r = cardScorePmf(e);
    expect(r.metric).toBe('score');
    expect(r.points.map((p) => p.x)).toEqual([100000, 101000, 102000, 103000]);
    expect(r.points.reduce((s, p) => s + p.prob, 0)).toBeCloseTo(1, 10);
  });

  it('縮小: x = k*value 秒、metric=cover、ベースは 0 秒', () => {
    const e = entry({
      baseScore: 100000,
      maxActivations: 2,
      skill: skill({ isShrink: true, skillType: 'shrink', value: 4, per: 40 }),
    });
    const r = cardScorePmf(e);
    expect(r.metric).toBe('cover');
    expect(r.points.map((p) => p.x)).toEqual([0, 4, 8]);
  });

  it('スキルなし衣装は baseScore の 1 点スパイク', () => {
    const e = entry({ baseScore: 123456, skill: null, maxActivations: 0 });
    const r = cardScorePmf(e);
    expect(r.points).toEqual([{ x: 123456, prob: 1 }]);
  });
});

describe('valueToThreshold', () => {
  it('スコアアップ: baseScore で 0、最大で 1', () => {
    const e = entry({ baseScore: 100000, maxActivations: 4, skill: skill({ value: 1000 }) });
    // span = 4*1000 = 4000, max = 104000
    expect(valueToThreshold(e, 100000)).toBeCloseTo(0, 10);
    expect(valueToThreshold(e, 104000)).toBeCloseTo(1, 10);
    expect(valueToThreshold(e, 102000)).toBeCloseTo(0.5, 10);
  });

  it('範囲外は 0〜1 にクランプ', () => {
    const e = entry({ baseScore: 100000, maxActivations: 4, skill: skill({ value: 1000 }) });
    expect(valueToThreshold(e, 90000)).toBe(0);
    expect(valueToThreshold(e, 999999)).toBe(1);
  });

  it('span=0（スキルなし）は 0', () => {
    const e = entry({ skill: null, maxActivations: 0 });
    expect(valueToThreshold(e, 100000)).toBe(0);
  });
});
