import { describe, it, expect, beforeAll } from 'vitest';
import { calcMaxScoreBreakdown } from '../../../src/lib/score/simulation';
import { buildSpecDemo, type SpecDemo } from '../../../src/lib/score/specDemo';

describe('calcMaxScoreBreakdown', () => {
  let demo: SpecDemo;
  beforeAll(async () => { demo = await buildSpecDemo(); });

  it('total = baseScore + scoreUpMax + shrinkMax', () => {
    const b = calcMaxScoreBreakdown(demo.team, demo.notes, demo.options);
    expect(b.total).toBe(b.baseScore + b.scoreUpMax + b.shrinkMax);
    expect(b.shrinkMax).toBeGreaterThan(0);
    expect(b.scoreUpMax).toBeGreaterThan(0);
  });

  it('calcMaxScore と整合する（badge 16% + broach 加算）', () => {
    const b = calcMaxScoreBreakdown(demo.team, demo.notes, demo.options);
    const badge = demo.options.scoreUpBadgeRate ?? 0;
    const final = Math.floor(b.total * (1 + badge / 100)) + demo.team.broachScoreBonus;
    expect(final).toBe(demo.maxScore);
  });
});
