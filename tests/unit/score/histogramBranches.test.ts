import { describe, it, expect } from 'vitest';
import { renderHistogramSvg } from '../../../src/lib/score/histogram';

describe('renderHistogramSvg: ビン境界クランプ', () => {
  it('minScore を下回るスコアは最初のビンにクランプされる (L33)', () => {
    // 範囲 [100, 200] に対し 50 (下限割れ) と 250 (上限超え) を混ぜる。
    // idx<0 / idx>=BIN_COUNT のクランプ両方を通す。
    const scores = [50, 120, 180, 250];
    const svg = renderHistogramSvg(scores, 100, 200, 150);
    expect(svg).toContain('<svg');
    // 全 4 件がいずれかのビンに入る (合計 4 回ぶんの度数が描かれる)
    const totalCounts = [...svg.matchAll(/: (\d+)回/g)].reduce((s, m) => s + Number(m[1]), 0);
    expect(totalCounts).toBe(scores.length);
  });
});
