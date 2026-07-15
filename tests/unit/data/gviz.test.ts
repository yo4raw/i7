import { describe, it, expect } from 'vitest';
import { extractCellValue, parseGvizResponse } from '../../../src/lib/data/gviz';

describe('extractCellValue', () => {
  it('null セル / null 値 / undefined は null', () => {
    expect(extractCellValue(null)).toBeNull();
    expect(extractCellValue()).toBeNull();
    expect(extractCellValue({ v: null })).toBeNull();
  });

  it('GViz Date 文字列を YYYY-MM-DD 形式に変換する（月は 0 始まり）', () => {
    // toISOString ベースのため TZ 依存。実装と同一ロジックで期待値を算出して比較する
    const expected = new Date(2024, 0, 15).toISOString().split('T')[0];
    const out = extractCellValue({ v: 'Date(2024,0,15)' });
    expect(out).toBe(expected);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 生文字列のままではないこと（変換が走っていること）
    expect(out).not.toBe('Date(2024,0,15)');
  });

  it('数値・真偽値・通常文字列はそのまま返す', () => {
    expect(extractCellValue({ v: 123 })).toBe(123);
    expect(extractCellValue({ v: true })).toBe(true);
    expect(extractCellValue({ v: 'text' })).toBe('text');
  });
});

describe('parseGvizResponse', () => {
  it('JSONP ラッピングを除去してパースする', () => {
    const payload = { version: '1', status: 'ok', table: { cols: [], rows: [] } };
    const text = `google.visualization.Query.setResponse(${JSON.stringify(payload)});`;
    expect(parseGvizResponse(text)).toEqual(payload);
  });

  it('末尾セミコロンが無くてもパースできる', () => {
    const payload = { version: '1', status: 'ok', table: { cols: [], rows: [] } };
    const text = `google.visualization.Query.setResponse(${JSON.stringify(payload)})`;
    expect(parseGvizResponse(text)).toEqual(payload);
  });

  it('ラッピングにマッチしなければ throw', () => {
    expect(() => parseGvizResponse('not a gviz response')).toThrow();
  });
});
