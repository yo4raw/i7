import { describe, it, expect } from 'vitest';
import { solve } from '../../../src/lib/pointCalc/solver';
import { buildCandidates } from '../../../src/lib/pointCalc/candidates';
import type { Candidate } from '../../../src/lib/pointCalc/candidates';

/** テスト用に pt 値だけを持つ候補を作る */
const fake = (...points: number[]): Candidate[] =>
  points.toSorted((a, b) => a - b).map(point => ({
    point,
    specs: [{ stars: 1, difficulty: 'EASY', playMode: '放置', bonusPct: 0, unit: 'weak', multiplier: 1 }],
  }));

describe('solve: 基本', () => {
  it('差異が候補ちょうどなら 1 行 1 回で解ける', () => {
    const [best] = solve({ diff: 100, candidates: fake(100) });
    expect(best.lines).toEqual([expect.objectContaining({ point: 100, count: 1 })]);
    expect(best.totalCount).toBe(1);
    expect(best.remainder).toBe(0);
  });

  it('同じ値を複数回使う場合は 1 行にまとめる', () => {
    const [best] = solve({ diff: 300, candidates: fake(100) });
    expect(best.lines).toHaveLength(1);
    expect(best.lines[0]).toMatchObject({ point: 100, count: 3 });
    expect(best.remainder).toBe(0);
  });

  it('複数の値を組み合わせてぴったりにする', () => {
    const [best] = solve({ diff: 130, candidates: fake(100, 30) });
    expect(best.remainder).toBe(0);
    expect(best.totalCount).toBe(2);
    expect(best.lines.map(l => l.point).toSorted((a, b) => a - b)).toEqual([30, 100]);
  });

  it('内訳の合計 + remainder が常に差異と一致する', () => {
    const results = solve({ diff: 7777, candidates: fake(79, 349, 1370, 2228) });
    for (const r of results) {
      const sum = r.lines.reduce((n, l) => n + l.point * l.count, 0);
      expect(sum).toBe(r.totalPoint);
      expect(sum + r.remainder).toBe(7777);
    }
  });

  it('残差の小さい順、同じならライブ回数の少ない順に並ぶ', () => {
    const results = solve({ diff: 7777, candidates: fake(79, 349, 1370, 2228) });
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const cur = results[i];
      expect(Math.abs(cur.remainder)).toBeGreaterThanOrEqual(Math.abs(prev.remainder));
      if (Math.abs(cur.remainder) === Math.abs(prev.remainder)) {
        expect(cur.totalCount).toBeGreaterThanOrEqual(prev.totalCount);
      }
    }
  });
});

describe('solve: 到達不能ケース', () => {
  it('ぴったり作れないときは残差付きの近似解を返す（空配列を返さない）', () => {
    const results = solve({ diff: 7, candidates: fake(100) });
    expect(results.length).toBeGreaterThan(0);
    const [best] = results;
    expect(best.remainder).not.toBe(0);
    // 100pt を 1 回叩いて 93pt 超過する解が出る
    expect(best.lines).toEqual([expect.objectContaining({ point: 100, count: 1 })]);
    expect(best.remainder).toBe(-93);
  });

  it('不足側と超過側の両方を候補に出す', () => {
    const results = solve({ diff: 253, candidates: fake(100) });
    const remainders = results.map(r => r.remainder).toSorted((a, b) => a - b);
    expect(remainders).toContain(53);  // 100 × 2 で 53pt 不足
    expect(remainders).toContain(-47); // 100 × 3 で 47pt 超過
  });

  it('近似解でも 内訳合計 + remainder = 差異 を満たす', () => {
    for (const r of solve({ diff: 253, candidates: fake(100) })) {
      const sum = r.lines.reduce((n, l) => n + l.point * l.count, 0);
      expect(sum + r.remainder).toBe(253);
    }
  });

  it('空の内訳（0 回で残り全部）は解として返さない', () => {
    for (const r of solve({ diff: 7, candidates: fake(100) })) {
      expect(r.lines.length).toBeGreaterThan(0);
      expect(r.totalCount).toBeGreaterThan(0);
    }
  });
});

describe('solve: 入力の境界', () => {
  it('候補が空なら空配列', () => {
    expect(solve({ diff: 100, candidates: [] })).toEqual([]);
  });

  it('差異が 0 なら空配列', () => {
    expect(solve({ diff: 0, candidates: fake(100) })).toEqual([]);
  });

  it('差異が負なら空配列', () => {
    expect(solve({ diff: -5, candidates: fake(100) })).toEqual([]);
  });

  it('mainPoint を明示すると必ずその値を主に使う', () => {
    const [best] = solve({ diff: 10000, candidates: fake(100, 5000), mainPoint: 100 });
    expect(best.lines.some(l => l.point === 100 && l.count >= 50)).toBe(true);
  });

  it('mainPoint に候補外の値を渡しても落ちない（最大値へフォールバック）', () => {
    const results = solve({ diff: 10000, candidates: fake(100, 5000), mainPoint: 12345 });
    expect(results.length).toBeGreaterThan(0);
  });

  it('maxResults で件数を絞れる', () => {
    expect(solve({ diff: 7777, candidates: fake(79, 349, 1370), maxResults: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('差異がメイン pt より小さくても解ける', () => {
    const [best] = solve({ diff: 79, candidates: fake(79, 18075) });
    expect(best.remainder).toBe(0);
  });
});

describe('solve: 実データ相当', () => {
  it('差異 7,777,777 を PC 抜き・特効 0/150/300% でぴったり解ける', () => {
    const candidates = buildCandidates({
      bonusPcts: [0, 150, 300],
      playModes: ['放置', 'オート', 'FC'],
      units: ['max', 'ssr1', 'weak'],
      multipliers: [1, 2, 3],
    });
    const results = solve({ diff: 7_777_777, candidates });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].remainder).toBe(0);
    // 最大 pt は ★5 EXPERT FC 300% 3倍 = 18,075。430 回強で届く
    expect(results[0].totalCount).toBeLessThan(500);
  });

  it('特効%を全達成段階に広げても 3 秒以内に返る', () => {
    const bonusPcts = new Set<number>();
    for (let a = 0; a <= 6; a++) {
      for (let b = 0; b <= 6 - a; b++) {
        for (let c = 0; c <= 6 - a - b; c++) bonusPcts.add(a * 50 + b * 20 + c * 5);
      }
    }
    const candidates = buildCandidates({
      bonusPcts: [...bonusPcts].filter(p => p <= 300),
      playModes: ['放置', 'オート', 'FC'],
      units: ['max', 'ssr1', 'weak'],
      multipliers: [1, 2, 3],
    });
    const start = performance.now();
    const results = solve({ diff: 7_777_777, candidates });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(results[0].remainder).toBe(0);
  });
});
