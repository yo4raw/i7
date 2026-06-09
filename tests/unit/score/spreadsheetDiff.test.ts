import { describe, it, expect } from 'vitest';
import { goldenCases } from '../../fixtures/golden/loadGolden';
import { buildOracleInput } from './helpers/buildOracleInput';
import { runOracle } from '../../oracle/spreadsheetOracle';

describe('スプレッドシート v1.0.6 オラクル — ①ポート忠実性', () => {
  for (const gc of goldenCases) {
    const input = buildOracleInput(gc);
    if (gc.max) {
      it(`${gc.label}: 属性値スコア (max)`, () => {
        expect(runOracle(input, 'max').attr).toBe(gc.max!.attr);
      });
      it(`${gc.label}: スコアアップ(max)`, () => {
        expect(runOracle(input, 'max').scoreUp).toBe(gc.max!.scoreUp);
      });
      it(`${gc.label}: 縮小スキル(max)`, () => {
        expect(runOracle(input, 'max').shrink).toBe(gc.max!.shrink);
      });
    }
    if (gc.expected) {
      it(`${gc.label}: 属性値スコア (expected)`, () => {
        expect(runOracle(input, 'expected').attr).toBe(gc.expected!.attr);
      });
      it(`${gc.label}: スコアアップ(expected)`, () => {
        expect(runOracle(input, 'expected').scoreUp).toBe(gc.expected!.scoreUp);
      });
      it(`${gc.label}: 縮小スキル(expected)`, () => {
        expect(runOracle(input, 'expected').shrink).toBe(gc.expected!.shrink);
      });
    }
  }
});
