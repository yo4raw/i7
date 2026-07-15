import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fetchEventsCsv, formatEffectSummary, type EventSpecialTier } from '../../../src/lib/data/fetchEventsCsv';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const setCsv = (csv: string) => vi.mocked(readFile).mockResolvedValue(csv as never);

beforeEach(() => vi.mocked(readFile).mockReset());

const HEADER =
  'ID,eventname,eventtype,start_date,end_date,special3_member,comment,special1_rID,special1_effect,special1_param_up';

const baseTier = (): EventSpecialTier => ({
  cardIds: [], costumeIds: [], effect: [],
  param_up: 0, item_up: 0, bpt_up: 0, ept_up: 0, gpt_up: 0, score_up: 0,
});

describe('fetchEventsCsv: CR・単一列フィルタ・非数値・短い行', () => {
  it('CRLF 改行 (\\r) を読み飛ばして正常にパースする (L60)', () => {
    const csv =
      HEADER + '\r\n' +
      '1,テストイベント,type,2026-06-01,2026-06-08,,,,,\r\n';
    setCsv(csv);
    return fetchEventsCsv().then((events) => {
      expect(events).toHaveLength(1);
      expect(events[0].eventname).toBe('テストイベント');
    });
  });

  it('単一列だけの空でない行は残し、空一列の行は除外する (L71)', async () => {
    // ヘッダ後に「カンマを含まない 1 セルだけの行」(= length===1) を混ぜる。
    // 'x' は r[0]!=='' なので残るが id 解決できず最終フィルタで落ちる → events は有効行のみ。
    const csv =
      HEADER + '\n' +
      'x\n' + // length===1, r[0]='x' (!=='') → parseCsv の filter を通過
      '2,有効,type,2026-06-01,2026-06-08,,,,,\n';
    setCsv(csv);
    const events = await fetchEventsCsv();
    expect(events.map((e) => e.id)).toEqual([2]);
  });

  it('param_up が非数値なら toNum で 0 になる (L92)', async () => {
    const csv =
      HEADER + '\n' +
      '3,有効,type,2026-06-01,2026-06-08,,,"10","param","abc"\n'; // param_up='abc'
    setCsv(csv);
    const events = await fetchEventsCsv();
    expect(events[0].gold.param_up).toBe(0);
  });

  it('ヘッダより列数が少ない行は各フィールドが既定値にフォールバックする (L127-133)', async () => {
    // 末尾フィールド (comment 等) を欠いた短い行: r[iComment] 等が undefined → ?? '' / ?? 0
    const csv =
      HEADER + '\n' +
      '4,イベント4,type,2026-06-01,2026-06-08\n'; // special3_member 以降を省略 (短い行)
    setCsv(csv);
    const events = await fetchEventsCsv();
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.id).toBe(4);
    expect(e.special3_member).toBe(''); // 欠落 → ?? '' で空文字
    expect(e.comment).toBe('');         // 欠落 → ?? ''
    expect(e.gold.cardIds).toEqual([]); // special1_rID 欠落 → 空配列
  });
});

describe('formatEffectSummary', () => {
  it('effect に含まれ値 > 0 の項目だけを日本語ラベルで連結する', () => {
    const tier = { ...baseTier(), effect: ['param', 'score'], param_up: 50, score_up: 30, item_up: 10 };
    // item は effect に無いので除外、param/score のみ
    expect(formatEffectSummary(tier)).toBe('パラメータ +50% / スコア +30%');
  });

  it('該当なしなら空文字', () => {
    expect(formatEffectSummary(baseTier())).toBe('');
  });
});
