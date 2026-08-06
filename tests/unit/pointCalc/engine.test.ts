import { describe, it, expect } from 'vitest';
import { gradePoint, livePoint } from '../../../src/lib/pointCalc/engine';
import type { LiveSpec } from '../../../src/lib/pointCalc/types';

const spec = (o: Partial<LiveSpec> = {}): LiveSpec => ({
  stars: 1, difficulty: 'EASY', playMode: 'FC', bonusPct: 0, unit: 'max', multiplier: 1, ...o,
});

describe('gradePoint', () => {
  it('FC は 基礎点 × ★倍率 の切り捨て', () => {
    expect(gradePoint('FC', 1, 'EASY')).toBe(660);   // 550 × 1.20
    expect(gradePoint('FC', 2, 'EASY')).toBe(676);   // 550 × 1.23 = 676.5 → 676
    expect(gradePoint('FC', 5, 'EXPERT')).toBe(1300); // 1000 × 1.30
  });

  it('PC は FC と同じグレードpt', () => {
    expect(gradePoint('PC', 3, 'HARD')).toBe(gradePoint('FC', 3, 'HARD'));
  });

  it('放置 は 基礎点 × ★倍率 × 0.12 の切り捨て', () => {
    expect(gradePoint('放置', 1, 'EASY')).toBe(79);  // 550 × 1.20 × 0.12 = 79.2 → 79
    expect(gradePoint('放置', 5, 'EASY')).toBe(85);  // 550 × 1.30 × 0.12 = 85.8 → 85
    expect(gradePoint('放置', 2, 'NORMAL')).toBe(95); // 650 × 1.23 × 0.12 = 95.94 → 95
  });

  it('オート は基礎点そのもの（★倍率が掛からない）', () => {
    expect(gradePoint('オート', 1, 'EASY')).toBe(550);
    expect(gradePoint('オート', 5, 'EASY')).toBe(550);
    expect(gradePoint('オート', 3, 'EXPERT')).toBe(1000);
  });
});

describe('livePoint', () => {
  it('スプレッドシート バディナナ用 E12（★1 EASY 放置 0% MAX編成）= 349', () => {
    expect(livePoint(spec({ playMode: '放置' }))).toBe(349);
  });

  it('スプレッドシート バディナナ用 F12（★1 EASY FC 0% MAX編成）= 1370', () => {
    expect(livePoint(spec())).toBe(1370);
  });

  it('スプレッドシート バディナナ用 G12（★1 EASY オート 0% MAX編成）= 1120', () => {
    expect(livePoint(spec({ playMode: 'オート' }))).toBe(1120);
  });

  it('スプレッドシート バディナナ用 AP16（★2 EASY FC 300% MAX編成）= 3414', () => {
    expect(livePoint(spec({ stars: 2, bonusPct: 300 }))).toBe(3414);
  });

  it('浮動小数点だとずれる 130% ケース: ★1 EASY FC 130% = 2228', () => {
    // 660 * (1 + 130/100) を浮動小数点で計算すると 1517.9999... → floor 1517 になり 1pt ずれる
    expect(livePoint(spec({ bonusPct: 130 }))).toBe(2228);
  });

  it('弱編成列 C12（★1 EASY 放置 0% SR以下Lv1）= 79', () => {
    expect(livePoint(spec({ playMode: '放置', unit: 'weak' }))).toBe(79);
  });

  it('弱編成列 D12（★1 EASY 放置 0% SSR1枚Lv1）= 89', () => {
    expect(livePoint(spec({ playMode: '放置', unit: 'ssr1' }))).toBe(89);
  });

  it('PC は FC + 難易度別の差分（★1 EASY 180%: FC 2558 / PC 2583）', () => {
    expect(livePoint(spec({ bonusPct: 180 }))).toBe(2558);
    expect(livePoint(spec({ playMode: 'PC', bonusPct: 180 }))).toBe(2583);
  });

  it('倍率ライブは 1 回分の pt を整数倍する', () => {
    expect(livePoint(spec({ multiplier: 2 }))).toBe(2740);
    expect(livePoint(spec({ multiplier: 3 }))).toBe(4110);
  });
});
