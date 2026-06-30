import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCardsJson, getApSkillLevel, type Card } from '../../../src/lib/data/fetchCardsJson';

const COLS = ['ap_skill_type', 'ap_skill_req', 'name', 'groupname'];

function row(values: Partial<Record<(typeof COLS)[number], string | null>>): { c: ({ v: string | null } | null)[] } {
  return { c: COLS.map((k) => (k in values ? { v: values[k] ?? null } : { v: null })) };
}

function stubFetch(rows: ReturnType<typeof row>[]): void {
  const payload = {
    version: '1',
    status: 'ok',
    table: { cols: COLS.map((label) => ({ id: label, label, type: 'string' })), rows },
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

/** MIN_EXPECTED_CARDS=100 を満たすため埋め草行を作る */
function padRows(specific: ReturnType<typeof row>[]): ReturnType<typeof row>[] {
  const filler = Array.from({ length: 100 }, () => row({ name: 'ダミー' }));
  return [...specific, ...filler];
}

afterEach(() => vi.unstubAllGlobals());

describe('getApSkillLevel', () => {
  it('指定レベルの count/per/value/rate を取り出す', () => {
    const card = {
      ap_skill_3_count: 10, ap_skill_3_per: 50, ap_skill_3_value: 200, ap_skill_3_rate: 1.5,
    } as unknown as Card;
    expect(getApSkillLevel(card, 3)).toEqual({ count: 10, per: 50, value: 200, rate: 1.5 });
  });

  it('未設定フィールドは undefined', () => {
    expect(getApSkillLevel({} as Card, 1)).toEqual({
      count: undefined, per: undefined, value: undefined, rate: undefined,
    });
  });
});

describe('fetchCardsJson (fetch モック)', () => {
  it('件数が MIN_EXPECTED_CARDS 未満なら throw', async () => {
    stubFetch([row({ name: 'A' })]);
    await expect(fetchCardsJson()).rejects.toThrow(/不足/);
  });

  it('ap_skill_type の表記揺れを正規化する（MISS→GOOD）', async () => {
    stubFetch(padRows([row({ ap_skill_type: 'MISS→GOOD' })]));
    const cards = await fetchCardsJson();
    expect(cards[0].ap_skill_type).toBe('MISS→Good');
  });

  it('スコアアップは発動条件を括弧付きにする', async () => {
    stubFetch(padRows([row({ ap_skill_type: 'スコアアップ', ap_skill_req: 'タイマー' })]));
    const cards = await fetchCardsJson();
    expect(cards[0].ap_skill_type).toBe('スコアアップ（タイマー）');
  });

  it('判定領域を→判定縮小に正規化し、発動条件を括弧付きにする', async () => {
    stubFetch(padRows([row({ ap_skill_type: '判定領域を', ap_skill_req: 'コンボ' })]));
    const cards = await fetchCardsJson();
    expect(cards[0].ap_skill_type).toBe('判定縮小（コンボ）');
  });

  it('groupname が null ならキャラ名からグループを解決する', async () => {
    stubFetch(padRows([row({ name: '七瀬陸' })]));
    const cards = await fetchCardsJson();
    expect(cards[0].groupname).toBe('IDOLiSH7');
  });
});
