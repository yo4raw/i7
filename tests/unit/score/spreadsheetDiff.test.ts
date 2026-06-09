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
    }
    if (gc.expected) {
      it(`${gc.label}: 属性値スコア (expected)`, () => {
        expect(runOracle(input, 'expected').attr).toBe(gc.expected!.attr);
      });
    }
  }
});
