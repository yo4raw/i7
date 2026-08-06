import { describe, it, expect } from 'vitest';
import { buildCandidates } from '../../../src/lib/pointCalc/candidates';
import { livePoint } from '../../../src/lib/pointCalc/engine';

const base = { bonusPcts: [0], playModes: ['FC'] as const, units: ['max'] as const, multipliers: [1] as const };

describe('buildCandidates', () => {
  it('★5 × 難易度4 = 20 通りを展開する', () => {
    const c = buildCandidates({ ...base, playModes: ['FC'], units: ['max'], multipliers: [1] });
    const specCount = c.reduce((n, x) => n + x.specs.length, 0);
    expect(specCount).toBe(20);
  });

  it('point 昇順に並ぶ', () => {
    const c = buildCandidates({ bonusPcts: [0, 100], playModes: ['FC', '放置'], units: ['max'], multipliers: [1, 2] });
    for (let i = 1; i < c.length; i++) expect(c[i].point).toBeGreaterThan(c[i - 1].point);
  });

  it('同じ pt になる条件は 1 件に集約され specs に全手段が入る', () => {
    // ★1〜★5 EASY のオートは★倍率が掛からないため全て同じ pt になる
    const c = buildCandidates({ bonusPcts: [0], playModes: ['オート'], units: ['max'], multipliers: [1] });
    const easy = c.find(x => x.specs.some(s => s.difficulty === 'EASY'));
    expect(easy?.specs.filter(s => s.difficulty === 'EASY')).toHaveLength(5);
  });

  it('弱編成は放置とのみ組み合わせる', () => {
    const c = buildCandidates({ bonusPcts: [0], playModes: ['放置', 'FC', 'オート'], units: ['weak'], multipliers: [1] });
    const modes = new Set(c.flatMap(x => x.specs).map(s => s.playMode));
    expect([...modes]).toEqual(['放置']);
  });

  it('MAX編成は全プレイ方法と組み合わせる', () => {
    const c = buildCandidates({ bonusPcts: [0], playModes: ['放置', 'FC'], units: ['max'], multipliers: [1] });
    const modes = new Set(c.flatMap(x => x.specs).map(s => s.playMode));
    expect([...modes].toSorted()).toEqual(['FC', '放置']);
  });

  it('point は livePoint と一致する', () => {
    const c = buildCandidates({ bonusPcts: [0, 150], playModes: ['FC'], units: ['max'], multipliers: [1, 3] });
    for (const cand of c) {
      for (const spec of cand.specs) expect(livePoint(spec)).toBe(cand.point);
    }
  });

  it('プレイ方法が空なら候補も空', () => {
    expect(buildCandidates({ ...base, playModes: [] })).toEqual([]);
  });

  it('特効%が空なら候補も空', () => {
    expect(buildCandidates({ ...base, bonusPcts: [] })).toEqual([]);
  });

  it('弱編成のみ × FC のみ なら候補は空（組み合わせが成立しない）', () => {
    expect(buildCandidates({ bonusPcts: [0], playModes: ['FC'], units: ['weak'], multipliers: [1] })).toEqual([]);
  });
});
