import { describe, it, expect } from 'vitest';
import { formatCount, interpolateCount, parseCountTarget } from '../../../src/lib/motion/countUp';

describe('formatCount', () => {
  it('四捨五入して ja-JP のカンマ区切りにする', () => {
    expect(formatCount(2689)).toBe('2,689');
    expect(formatCount(1234.7)).toBe('1,235');
    expect(formatCount(1234.2)).toBe('1,234');
  });

  it('1000 未満はカンマを付けない', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999.4)).toBe('999');
  });
});

describe('interpolateCount', () => {
  it('進捗 0 / 0.5 / 1 で from・中間・to を返す', () => {
    expect(interpolateCount(0, 2689, 0)).toBe(0);
    expect(interpolateCount(0, 2689, 0.5)).toBe(1344.5);
    expect(interpolateCount(0, 2689, 1)).toBe(2689);
  });

  it('進捗は 0..1 にクランプされる', () => {
    expect(interpolateCount(0, 100, -0.5)).toBe(0);
    expect(interpolateCount(0, 100, 1.5)).toBe(100);
  });

  it('from が 0 以外でも補間できる', () => {
    expect(interpolateCount(100, 200, 0.25)).toBe(125);
  });
});

describe('parseCountTarget', () => {
  it('数値文字列をパースする', () => {
    expect(parseCountTarget('2689')).toBe(2689);
    expect(parseCountTarget('0')).toBe(0);
  });

  it('null・空文字・非数値・非有限は null を返す', () => {
    expect(parseCountTarget(null)).toBeNull();
    expect(parseCountTarget('')).toBeNull();
    expect(parseCountTarget('abc')).toBeNull();
    expect(parseCountTarget('Infinity')).toBeNull();
  });
});
