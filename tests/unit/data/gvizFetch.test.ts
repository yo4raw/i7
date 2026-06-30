import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchSheetRaw, fetchSheetAsJson } from '../../../src/lib/data/gviz';

function gvizText(rows: { c: ({ v: unknown } | null)[] }[], cols = [{ id: '', label: '', type: '' }]): string {
  const payload = { version: '1', status: 'ok', table: { cols, rows } };
  return `google.visualization.Query.setResponse(${JSON.stringify(payload)});`;
}

beforeEach(() => {
  // リトライ待機の setTimeout を即時化
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchSheetRaw (fetch モック)', () => {
  it('正常レスポンスでテーブルを返す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => gvizText([{ c: [{ v: 1 }] }]),
    })));
    const table = await fetchSheetRaw('sid', 1);
    expect(table.rows).toHaveLength(1);
  });

  it('response.ok=false ならリトライ後に throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, statusText: 'Server Error', text: async () => '',
    })));
    const p = fetchSheetRaw('sid', 1, 1);
    const assertion = expect(p).rejects.toThrow(/取得に失敗/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('空データ（rows=0）なら throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK', text: async () => gvizText([]),
    })));
    const p = fetchSheetRaw('sid', 1, 1);
    const assertion = expect(p).rejects.toThrow(/空/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('1 回失敗→2 回目成功でリトライが効く', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'busy', text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => gvizText([{ c: [{ v: 1 }] }]) });
    vi.stubGlobal('fetch', fetchMock);
    const p = fetchSheetRaw('sid', 1, 2);
    await vi.runAllTimersAsync();
    const table = await p;
    expect(table.rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchSheetAsJson (fetch モック)', () => {
  it('cols.label をヘッダにし column_ 列はスキップする', async () => {
    const cols = [{ id: 'a', label: 'name', type: 'string' }, { id: 'b', label: '', type: 'string' }];
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => gvizText([{ c: [{ v: '陸' }, { v: 'skip' }] }], cols),
    })));
    const rows = await fetchSheetAsJson('sid', 1);
    expect(rows[0]).toEqual({ name: '陸' }); // column_1 はスキップ
  });
});
