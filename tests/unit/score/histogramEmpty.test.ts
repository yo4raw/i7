import { describe, it, expect } from 'vitest';
import { renderHistogramSvg } from '../../../src/lib/score/histogram';

describe('renderHistogramSvg (空・退化ケース)', () => {
  it('scores が空配列なら「データなし」を返す', () => {
    expect(renderHistogramSvg([], 0, 100, 50)).toContain('データなし');
  });

  it('maxScore <= minScore なら「データなし」を返す', () => {
    expect(renderHistogramSvg([10, 20], 100, 100, 50)).toContain('データなし');
  });

  it('有効なスコア分布なら SVG を生成する', () => {
    const scores = Array.from({ length: 50 }, (_, i) => i * 2);
    const svg = renderHistogramSvg(scores, 0, 100, 50);
    expect(svg).toContain('<svg');
  });
});
