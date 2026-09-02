// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearBaseline, commitBaselineRow, loadBaselineRowSet,
} from '../../../src/lib/sync/baseline';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('loadBaselineRowSet', () => {
  it('未保存なら空の行集合', () => {
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('壊れた JSON でも空の行集合を返す', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_BASELINE, '{壊れている');
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('バケットが配列でも空の行集合を返す (偽のキーを混入させない)', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_BASELINE, JSON.stringify({ card_counts: [1, 2, 3] }));
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('保存値が配列でも空の行集合を返す', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_BASELINE, JSON.stringify([1, 2, 3]));
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });
});

describe('commitBaselineRow', () => {
  it('1 行だけ追加できる', () => {
    expect(commitBaselineRow('card_counts', '5', 2)).toBe(true);
    expect([...loadBaselineRowSet<number>('card_counts')]).toEqual([['5', 2]]);
  });

  it('null を渡すとその行を削除する', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('card_counts', '5', null);
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('同じ kind の他の行に影響しない', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('card_counts', '6', 3);
    commitBaselineRow('card_counts', '5', null);
    expect([...loadBaselineRowSet<number>('card_counts')]).toEqual([['6', 3]]);
  });

  it('他の kind に影響しない', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('decks', 'd1', { name: 'A' });
    expect(loadBaselineRowSet('card_counts').size).toBe(1);
    expect(loadBaselineRowSet('decks').size).toBe(1);
  });

  it('保存に失敗したら false を返す (呼び出し側が同期を無効化できるように)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(commitBaselineRow('card_counts', '5', 2)).toBe(false);
  });
});

describe('clearBaseline', () => {
  it('全 kind を空にする', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('decks', 'd1', { name: 'A' });
    expect(clearBaseline()).toBe(true);
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
    expect(loadBaselineRowSet('decks').size).toBe(0);
  });

  it('保存に失敗したら false を返す', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(clearBaseline()).toBe(false);
  });
});
