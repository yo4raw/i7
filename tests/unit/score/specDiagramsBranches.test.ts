import { describe, it, expect } from 'vitest';
import {
  shrinkTimelineSvg,
  coverageDiagramSvg,
  type Activation,
} from '../../../src/lib/score/specDiagrams';

function isValidSvg(s: string): boolean {
  return /^<svg[\s\S]*<\/svg>\s*$/.test(s.trim());
}

describe('shrinkTimelineSvg: 省略可能フィールドの既定値 (L259, L260, L278, L306)', () => {
  it('excludeHead / activations を省略しても描画できる (L259 ?? 0, L260 ?? [])', () => {
    const svg = shrinkTimelineSvg({
      count: 20, per: 40, value: 4,
      notesCount: 400, songDuration: 100,
      // excludeHead 未指定 → ?? 0、activations 未指定 → ?? []
    });
    expect(isValidSvg(svg)).toBe(true);
    expect(svg).not.toContain('先頭除外'); // excludeHead=0 なので除外矩形なし
  });

  it('activation の cardIndex を省略するとレーン 0 として扱う (L278, L306)', () => {
    // cardIndex を持たない発動 1 件 + 不発 1 件を渡す
    const acts: Activation[] = [
      { start: 40, end: 60, fired: true },   // cardIndex 省略 → ?? 0
      { start: 80, end: 80, fired: false },  // cardIndex 省略 + 不発
    ];
    const svg = shrinkTimelineSvg({
      count: 20, per: 40, value: 4,
      notesCount: 400, songDuration: 100, excludeHead: 0,
      activations: acts,
    });
    expect(isValidSvg(svg)).toBe(true);
    // 発動コイン (緑) と不発コイン (mute) の両方が出る
    expect(svg).toContain('#22c55e');                 // 発動
    expect(svg).toContain('var(--chart-mute-fill)');  // 不発 (L281 の !a.fired 側)
    expect(svg).toContain('衣装1: 発動');
    expect(svg).toContain('衣装1: 不発');
  });
});

describe('coverageDiagramSvg: songDuration を完全に超えたセグメント (L454)', () => {
  it('開始時点で 100% を超えるセグメントは実効塗りが空になる (x2Cap <= x1)', () => {
    // 1 本目で既に songDuration を使い切り、2 本目はキャップ後 (cursor >= songDuration) から始まる。
    const svg = coverageDiagramSvg({
      songDuration: 50,
      segments: [
        { label: 'A', seconds: 60, color: '#f59e0b' }, // 既に songDuration 超過
        { label: 'B', seconds: 30, color: '#f97316' }, // x1(cursor=60) > x2Cap(=50) → 実効塗り空 (L454 else)
      ],
    });
    expect(isValidSvg(svg)).toBe(true);
    // 2 本目は超過部 (opacity 0.3 の破線) のみが出る
    expect(svg).toContain('opacity="0.3"');
    expect(svg).toContain('100.0%'); // キャップ後カバー率
  });
});
