// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_BROACH_COUNT, getBroachCount, setBroachCount, deltaBroachCount,
  allBroachCounts, totalOwnedBroachs, reloadBroachCountsFromStorage,
} from '../../../src/lib/stores/broachCounts.svelte';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => {
  localStorage.clear();
  reloadBroachCountsFromStorage();
});

describe('setBroachCount', () => {
  it('未設定は 0、設定後は値を返す', () => {
    expect(getBroachCount(1)).toBe(0);
    setBroachCount(1, 5);
    expect(getBroachCount(1)).toBe(5);
  });

  it('MAX_BROACH_COUNT(=10) でクランプ、負数は 0、小数は floor', () => {
    expect(MAX_BROACH_COUNT).toBe(10);
    setBroachCount(2, 15);
    expect(getBroachCount(2)).toBe(10);
    setBroachCount(2, -3);
    expect(getBroachCount(2)).toBe(0);
    setBroachCount(2, 4.8);
    expect(getBroachCount(2)).toBe(4);
  });

  it('0 で削除し、localStorage に永続化', () => {
    setBroachCount(3, 5);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SHARED_BROACH_COUNTS)!)['3']).toBe(5);
    setBroachCount(3, 0);
    expect(allBroachCounts()).not.toHaveProperty('3');
  });
});

describe('deltaBroachCount / 集計 / reload', () => {
  it('加算は上限でクランプ', () => {
    setBroachCount(1, 8);
    deltaBroachCount(1, 5);
    expect(getBroachCount(1)).toBe(10);
  });

  it('totalOwnedBroachs は合計', () => {
    setBroachCount(1, 3);
    setBroachCount(2, 4);
    expect(totalOwnedBroachs()).toBe(7);
  });

  it('reload で最新に同期し消えたキーを削除', () => {
    setBroachCount(1, 5);
    setBroachCount(2, 5);
    localStorage.setItem(STORAGE_KEYS.SHARED_BROACH_COUNTS, JSON.stringify({ '1': 9 }));
    reloadBroachCountsFromStorage();
    expect(getBroachCount(1)).toBe(9);
    expect(getBroachCount(2)).toBe(0);
  });
});
