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

/**
 * 公開 8 シート分の抽出件数（scripts/extract-point-calc-golden.mjs 実行結果を固定）。
 * スプレッドシート側の列構成が変わって extractSheet が列を静かに落としても、
 * 総数だけでなくシート単位の件数を固定しておくことで検知できる。
 */
const EXPECTED_SHEET_COUNTS: Record<string, number> = {
  'バディナナ用': 737,
  '吉兆用': 737,
  "La'Stiara②用": 677,
  "La'Stiara用": 492,
  'ISL②用': 485,
  'Sugao①用': 462,
  'Sugao②用': 462,
  'IDOL STAR LIVE用': 371,
};

describe('ゴールデン: 参照スプレッドシートの獲得pt表', () => {
  it('公開8シートの合計 4,423 セルを検証対象にしている', () => {
    expect(cells.length).toBe(4423);
  });

  it('シート単位の抽出件数が想定どおりである（列検出の静かな抜け漏れを検知する）', () => {
    const bySheet = new Map<string, number>();
    for (const c of cells) bySheet.set(c.sheet, (bySheet.get(c.sheet) ?? 0) + 1);
    expect(Object.fromEntries(bySheet)).toEqual(EXPECTED_SHEET_COUNTS);
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
