// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLevels, setLevel, sortedLevels, reloadSkillLevelsFromStorage,
} from '../../../src/lib/stores/cardSkillLevels.svelte';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => {
  localStorage.clear();
  reloadSkillLevelsFromStorage();
});

describe('getLevels', () => {
  it('未保存は count 個の 5 を返す', () => {
    expect(getLevels(1, 0)).toEqual([]);
    expect(getLevels(1, 2)).toEqual([5, 5]);
  });

  it('保存済みより count が多ければ 5 で埋め、少なければ切り詰める', () => {
    setLevel(1, 0, 3);
    setLevel(1, 1, 2);
    expect(getLevels(1, 3)).toEqual([3, 2, 5]);
    expect(getLevels(1, 1)).toEqual([3]);
    expect(getLevels('1', 2)).toEqual([3, 2]);
  });
});

describe('setLevel', () => {
  it('index 枚目だけ更新し localStorage に永続化する', () => {
    setLevel(7, 1, 4);
    expect(getLevels(7, 2)).toEqual([5, 4]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CARD_SKILL_LEVELS)!)).toEqual({ '7': [5, 4] });
  });

  it('全て 5 に戻るとキーごと削除する', () => {
    setLevel(7, 0, 3);
    setLevel(7, 0, 5);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CARD_SKILL_LEVELS)!)).toEqual({});
  });

  it('範囲外の Lv は無視する', () => {
    setLevel(7, 0, 9 as never);
    setLevel(7, 0, 0 as never);
    expect(getLevels(7, 1)).toEqual([5]);
  });
});

describe('sortedLevels / reload', () => {
  it('降順に並べて返す', () => {
    setLevel(3, 0, 2);
    setLevel(3, 2, 4);
    expect(sortedLevels(3, 3)).toEqual([5, 4, 2]);
  });

  it('reload で localStorage の最新内容に同期し、消えたキーを落とす', () => {
    setLevel(1, 0, 1);
    setLevel(2, 0, 1);
    localStorage.setItem(STORAGE_KEYS.CARD_SKILL_LEVELS, JSON.stringify({ '1': [2] }));
    reloadSkillLevelsFromStorage();
    expect(getLevels(1, 1)).toEqual([2]);
    expect(getLevels(2, 1)).toEqual([5]);
  });
});
