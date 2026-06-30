import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fetchEventsCsv } from '../../../src/lib/data/fetchEventsCsv';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const setCsv = (csv: string) => vi.mocked(readFile).mockResolvedValue(csv as never);

beforeEach(() => vi.mocked(readFile).mockReset());

const HEADER =
  'ID,eventname,eventtype,start_date,end_date,special3_member,comment,special1_rID,special1_effect,special1_param_up';

describe('fetchEventsCsv', () => {
  it('ヘッダのみ（行数<2）なら空配列', async () => {
    setCsv(HEADER);
    expect(await fetchEventsCsv()).toEqual([]);
  });

  it('BOM除去・引用符内カンマ・ID/effectのパースを行う', async () => {
    const csv =
      '﻿' + HEADER + '\n' +
      '1,テストイベント,ハイスコア,2026-06-01,2026-06-08,,"a, b","10, 20, -5, abc","param, score, ",50\n';
    setCsv(csv);
    const events = await fetchEventsCsv();
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.id).toBe(1);
    expect(e.eventname).toBe('テストイベント');
    expect(e.comment).toBe('a, b'); // 引用符内カンマを保持
    expect(e.gold.cardIds).toEqual([10, 20]); // 負数・非数値は除外
    expect(e.gold.effect).toEqual(['param', 'score']); // 末尾空要素は除外
    expect(e.gold.param_up).toBe(50);
  });

  it('id<=0 / eventname 空 / 日付欠落の行を除外する', async () => {
    const csv =
      HEADER + '\n' +
      '0,無効,type,2026-06-01,2026-06-08,,,,,\n' +    // id=0
      '2,,type,2026-06-01,2026-06-08,,,,,\n' +         // eventname 空
      '3,有効,type,2026-06-01,2026-06-08,,,,,\n';      // 有効
    setCsv(csv);
    const events = await fetchEventsCsv();
    expect(events.map((e) => e.id)).toEqual([3]);
  });

  it('引用符のエスケープ("")を1つの引用符に戻す', async () => {
    const csv =
      HEADER + '\n' +
      '4,"He said ""hi""",type,2026-06-01,2026-06-08,,,,,\n';
    setCsv(csv);
    const events = await fetchEventsCsv();
    expect(events[0].eventname).toBe('He said "hi"');
  });
});
