import { describe, it, expect } from 'vitest';
import golden from '../../fixtures/point-calc-golden.json';
import { livePoint } from '../../../src/lib/pointCalc/engine';
import type { LiveSpec } from '../../../src/lib/pointCalc/types';

interface GoldenCell extends LiveSpec {
  sheet: string;
  cell: string;
  expected: number;
}
interface KnownError extends LiveSpec {
  sheet: string;
  cell: string;
  value: number;
  reason: string;
}

const cells = golden.cells as unknown as GoldenCell[];
const knownErrors = golden.knownSheetErrors as unknown as KnownError[];

const toSpec = (c: LiveSpec): LiveSpec => ({
  stars: c.stars, difficulty: c.difficulty, playMode: c.playMode,
  bonusPct: c.bonusPct, unit: c.unit, multiplier: c.multiplier,
});

describe('ゴールデン: 参照スプレッドシートの獲得pt表', () => {
  it('4000 セル以上を検証対象にしている（フィクスチャが空でないことの保険）', () => {
    expect(cells.length).toBeGreaterThan(4000);
  });

  it('全セルが livePoint と一致する', () => {
    const mismatches = cells
      .filter(c => livePoint(toSpec(c)) !== c.expected)
      .map(c => `${c.sheet}!${c.cell} ★${c.stars} ${c.difficulty} ${c.playMode} ${c.bonusPct}% ${c.unit}: 期待 ${c.expected} / 実際 ${livePoint(toSpec(c))}`);
    expect(mismatches).toEqual([]);
  });
});

describe('ゴールデン: スプレッドシート側の既知の入力ミス', () => {
  it('26 件を除外している', () => {
    expect(knownErrors).toHaveLength(26);
  });

  it('すべて理由が書かれている', () => {
    for (const e of knownErrors) {
      expect(e.reason.length, `${e.sheet}!${e.cell} に理由がない`).toBeGreaterThan(10);
    }
  });

  it('除外セルではツールの出力がシートの値と一致しない（除外が意図的であることの固定）', () => {
    for (const e of knownErrors) {
      expect(livePoint(toSpec(e)), `${e.sheet}!${e.cell} がシート値と一致してしまった。除外が不要になった可能性がある`).not.toBe(e.value);
    }
  });
});
