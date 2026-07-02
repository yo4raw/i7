import { describe, it, expect } from 'vitest';
import { Sfc32 } from '../../../src/lib/score/rng';

/** 16 bin の χ² 統計量 (df=15, 5% 臨界値 25.0) */
function chiSquared16(rng: Sfc32, samples: number): number {
  const bins = new Array<number>(16).fill(0);
  for (let i = 0; i < samples; i++) bins[Math.floor(rng.next() * 16)]++;
  const exp = samples / 16;
  return bins.reduce((acc, o) => acc + ((o - exp) ** 2) / exp, 0);
}

describe('Sfc32 (ADR 0038)', () => {
  it('χ² 一様性: 複数シードで 5% 臨界値 25.0 を下回る', () => {
    // 決定論的 (シード固定) なので flaky にはならない
    for (const seed of [1, 42, 12345, 999983]) {
      expect(chiSquared16(new Sfc32(seed), 100_000)).toBeLessThan(25.0);
    }
  });

  it('seed=0 でも初期出力が縮退しない', () => {
    const rng = new Sfc32(0);
    const a = rng.next();
    const b = rng.next();
    expect(a).not.toBe(b);
  });

  it('シード再現性: 同一シードは同一列を返す', () => {
    const a = new Sfc32(42);
    const b = new Sfc32(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('全出力が [0,1) に収まる', () => {
    const rng = new Sfc32(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
