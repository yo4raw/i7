import { describe, it, expect, beforeAll } from 'vitest';
import { buildSpecDemo, DEMO_SCALING_FACTORS, type SpecDemo } from '../../../src/lib/score/specDemo';

describe('specDemo 追加フィールド (ADR 0044)', () => {
  let demo: SpecDemo;
  beforeAll(async () => { demo = await buildSpecDemo(); });

  it('shrinkMaxBonus は期待値より大きい正値', () => {
    expect(demo.shrinkMaxBonus).toBeGreaterThan(demo.expected.shrinkExpected);
  });

  it('scalingPoints[factor=1.0] は expected と一致する', () => {
    const p0 = demo.scalingPoints[0];
    expect(p0.factor).toBe(1.0);
    expect(p0.shrinkExpected).toBe(demo.expected.shrinkExpected);
    expect(p0.scoreUpExpected).toBe(demo.expected.scoreUpExpected);
  });

  it('縮小期待値は倍率に対して単調増加、スコアアップ期待値は不変', () => {
    expect(demo.scalingPoints.map(p => p.factor)).toEqual([...DEMO_SCALING_FACTORS]);
    for (let i = 1; i < demo.scalingPoints.length; i++) {
      expect(demo.scalingPoints[i].shrinkExpected)
        .toBeGreaterThan(demo.scalingPoints[i - 1].shrinkExpected);
      expect(demo.scalingPoints[i].scoreUpExpected)
        .toBe(demo.scalingPoints[0].scoreUpExpected);
    }
  });
});
