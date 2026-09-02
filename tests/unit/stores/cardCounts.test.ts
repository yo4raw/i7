// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCount, setCount, deltaCount, allCounts, totalOwned, reloadFromStorage,
} from '../../../src/lib/stores/cardCounts.svelte';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => {
  localStorage.clear();
  reloadFromStorage(); // モジュール内 state を初期化
});

describe('getCount / setCount', () => {
  it('未設定は 0、設定後は値を返す（数値/文字列キー両対応）', () => {
    expect(getCount(1)).toBe(0);
    setCount(1, 3);
    expect(getCount(1)).toBe(3);
    expect(getCount('1')).toBe(3);
  });

  it('負数は 0 にクランプ、小数は floor', () => {
    setCount(2, -5);
    expect(getCount(2)).toBe(0);
    setCount(2, 3.9);
    expect(getCount(2)).toBe(3);
  });

  it('0 を設定するとマップから削除される', () => {
    setCount(3, 5);
    expect(allCounts()).toHaveProperty('3');
    setCount(3, 0);
    expect(allCounts()).not.toHaveProperty('3');
  });

  it('localStorage に永続化される', () => {
    setCount(4, 7);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CARD_COUNTS)!)['4']).toBe(7);
  });
});

describe('deltaCount', () => {
  it('加減算し、0以下で削除', () => {
    deltaCount(10, 3);
    expect(getCount(10)).toBe(3);
    deltaCount(10, -1);
    expect(getCount(10)).toBe(2);
    deltaCount(10, -5);
    expect(getCount(10)).toBe(0);
    expect(allCounts()).not.toHaveProperty('10');
  });
});

describe('集計系', () => {
  it('totalOwned は値の合計', () => {
    setCount(1, 5);
    setCount(2, 3);
    expect(totalOwned()).toBe(8);
  });
});

describe('reloadFromStorage', () => {
  it('localStorage の最新内容に同期し、消えたキーは削除', () => {
    setCount(1, 5);
    setCount(2, 5);
    localStorage.setItem(STORAGE_KEYS.CARD_COUNTS, JSON.stringify({ '1': 10 }));
    reloadFromStorage();
    expect(getCount(1)).toBe(10);
    expect(getCount(2)).toBe(0);
    expect(allCounts()).toEqual({ '1': 10 });
  });
});
