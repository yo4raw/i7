import { describe, it, expect } from 'vitest';
import { donutChartSvg, attrDonutSvg } from '../../src/lib/donutChart';
import { ATTR_HEX } from '../../src/lib/constants';

describe('donutChartSvg', () => {
  it('全セグメントが 0 ならプレースホルダー "-" を返す', () => {
    const html = donutChartSvg([
      { value: 0, color: '#ef4444' },
      { value: 0, color: '#22c55e' },
    ]);
    expect(html).toBe('<span class="text-gray-400 text-xs">-</span>');
  });

  it('単一セグメントで SVG を生成', () => {
    const html = donutChartSvg([{ value: 100, color: '#ef4444' }]);
    expect(html).toContain('<svg viewBox="0 0 36 36"');
    expect(html).toContain('stroke="#ef4444"');
    expect(html).toContain('stroke-dasharray=');
  });

  it('複数セグメントで各色の circle を生成', () => {
    const html = donutChartSvg([
      { value: 50, color: '#ef4444' },
      { value: 30, color: '#22c55e' },
      { value: 20, color: '#3b82f6' },
    ]);
    expect(html).toContain('stroke="#ef4444"');
    expect(html).toContain('stroke="#22c55e"');
    expect(html).toContain('stroke="#3b82f6"');
    // 背景 circle + 3 セグメント = 4 個
    expect(html.match(/<circle /g)).toHaveLength(4);
  });

  it('デフォルトオプション (sizeClass / strokeWidth) を適用', () => {
    const html = donutChartSvg([{ value: 10, color: '#ef4444' }]);
    expect(html).toContain('class="size-10"');
    expect(html).toContain('stroke-width="5"');
  });

  it('カスタム sizeClass / strokeWidth を適用', () => {
    const html = donutChartSvg([{ value: 10, color: '#ef4444' }], {
      sizeClass: 'w-20 h-20',
      strokeWidth: 2,
    });
    expect(html).toContain('class="w-20 h-20"');
    expect(html).toContain('stroke-width="2"');
  });

  it('showTitle=false なら title 属性なし', () => {
    const html = donutChartSvg([{ value: 10, color: '#ef4444', label: 'S' }]);
    expect(html).not.toContain('title=');
  });

  it('showTitle=true でセグメントのラベルとパーセントを title に出す', () => {
    const html = donutChartSvg(
      [
        { value: 50, color: '#ef4444', label: 'S' },
        { value: 50, color: '#22c55e', label: 'B' },
      ],
      { showTitle: true },
    );
    expect(html).toContain('title="S:50% B:50%"');
  });

  it('label 未指定でも showTitle で出力できる', () => {
    const html = donutChartSvg(
      [
        { value: 60, color: '#ef4444' },
        { value: 40, color: '#22c55e' },
      ],
      { showTitle: true },
    );
    expect(html).toContain(':60%');
    expect(html).toContain(':40%');
  });

  it('centerText 未指定なら text 要素なし', () => {
    const html = donutChartSvg([{ value: 10, color: '#ef4444' }]);
    expect(html).not.toContain('<text');
  });

  it('centerText 指定で上段ラベル・下段値の 2 行を生成', () => {
    const html = donutChartSvg([{ value: 10, color: '#ef4444' }], {
      centerText: { label: '合計', value: '100' },
    });
    expect(html).toContain('合計</text>');
    expect(html).toContain('100</text>');
  });
});

describe('attrDonutSvg', () => {
  it('S/B/M の 3 属性で属性色の circle を生成し title も付く', () => {
    const html = attrDonutSvg(60, 30, 10);
    expect(html).toContain(`stroke="${ATTR_HEX.Shout}"`);
    expect(html).toContain(`stroke="${ATTR_HEX.Beat}"`);
    expect(html).toContain(`stroke="${ATTR_HEX.Melody}"`);
    expect(html).toContain('title="S:60% B:30% M:10%"');
  });

  it('追加オプションで showTitle を上書きできる', () => {
    const html = attrDonutSvg(60, 30, 10, { showTitle: false });
    expect(html).not.toContain('title=');
  });

  it('全 0 ならプレースホルダー', () => {
    expect(attrDonutSvg(0, 0, 0)).toContain('-</span>');
  });
});
