import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractCellValue, fetchSheetAsJson } from '../../../src/lib/data/gviz';

afterEach(() => vi.unstubAllGlobals());

describe('extractCellValue: v が undefined (キー欠落) なら null (L34)', () => {
  it('v プロパティを持たないセルは null', () => {
    // { v: null } は既存テスト済み。ここは「v キー自体が無い」= undefined 経路を通す。
    expect(extractCellValue({} as never)).toBeNull();
  });
});

describe('fetchSheetAsJson: row.c が無い行のフォールバック (L107)', () => {
  it('c を持たない行はセル値が null になる', () => {
    const cols = [{ id: 'a', label: 'name', type: 'string' }];
    const payload = {
      version: '1', status: 'ok',
      table: { cols, rows: [{ c: [{ v: 'あり' }] }, {}] }, // 2 行目は c なし → row.c ? ... : null
    };
    vi.stubGlobal('fetch', vi.fn(() => ({
      ok: true, status: 200, statusText: 'OK',
      text: () => Promise.resolve(`google.visualization.Query.setResponse(${JSON.stringify(payload)});`),
    })));
    return fetchSheetAsJson('sid', 1).then((rows) => {
      expect(rows[0]).toEqual({ name: 'あり' });
      expect(rows[1]).toEqual({ name: null }); // c なし → null フォールバック
    });
  });
});
