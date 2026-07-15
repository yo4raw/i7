import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFixedBroachsJson } from '../../../src/lib/data/fetchFixedBroachsJson';

/** col 19 列分の GViz 行を作る（index → 値） */
function row(values: Record<number, string | number | null>): { c: ({ v: string | number | null } | null)[] } {
  const c: ({ v: string | number | null } | null)[] = Array.from({ length: 19 }, () => null);
  for (const [i, v] of Object.entries(values)) c[Number(i)] = { v };
  return { c };
}

function stubFetch(rows: ReturnType<typeof row>[]): void {
  const payload = {
    version: '1',
    status: 'ok',
    // ラベルは空（column_ 扱い）。headerOverrides 側のマッピングを検証する
    table: { cols: Array.from({ length: 19 }, () => ({ id: '', label: '', type: '' })), rows },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => `google.visualization.Query.setResponse(${JSON.stringify(payload)});`,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchFixedBroachsJson (fetch モック)', () => {
  it('headerOverrides に従って列をマッピングし、card_name 有りの行を返す', async () => {
    stubFetch([
      row({ 0: 1, 1: 100, 2: 'カードA', 6: 50, 7: 60, 8: 70, 10: 'Shout' }),
    ]);
    const broachs = await fetchFixedBroachsJson();
    expect(broachs).toHaveLength(1);
    expect(broachs[0]).toMatchObject({
      id: 1, card_id: 100, card_name: 'カードA', shout: 50, beat: 60, melody: 70, attribute: 'Shout',
    });
  });

  it('card_name が null の行は除外する', async () => {
    stubFetch([
      row({ 0: 1, 2: 'あり' }),
      row({ 0: 2 }), // card_name なし
    ]);
    const broachs = await fetchFixedBroachsJson();
    expect(broachs).toHaveLength(1);
    expect(broachs[0].card_name).toBe('あり');
  });
});
