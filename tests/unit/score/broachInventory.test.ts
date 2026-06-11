import { describe, it, expect } from 'vitest';
import { countUsedBroachs, broachViolations } from '../../../src/lib/score/broachInventory';

describe('broachInventory (共通ブローチ在庫突合)', () => {
  it('countUsedBroachs: slot 0-4 のみ数え、フレンド枠(5)は無視する', () => {
    const shared = [[1], [1, 2], [], [], [3], [1, 1]];
    const used = countUsedBroachs(shared);
    expect(used.get(1)).toBe(2);
    expect(used.get(2)).toBe(1);
    expect(used.get(3)).toBe(1);
  });

  it('countUsedBroachs: excludeSlot/excludeIdx で対象セレクト自身を除外できる', () => {
    const shared = [[1], [1, 2], [], [], [], []];
    const used = countUsedBroachs(shared, 1, 0);
    expect(used.get(1)).toBe(1);
  });

  it('countUsedBroachs: 0 (未選択) は数えない', () => {
    const used = countUsedBroachs([[0, 1], [], [], [], [], []]);
    expect(used.get(1)).toBe(1);
    expect(used.has(0)).toBe(false);
  });

  it('countUsedBroachs: 配列が欠けたスロットを許容する', () => {
    const used = countUsedBroachs([[1]]);
    expect(used.get(1)).toBe(1);
  });

  it('broachViolations: 所持数超過の broachId を返す', () => {
    const shared = [[1, 1], [1], [], [2], [], []];
    expect(broachViolations(shared, { '1': 2, '2': 1 })).toEqual([1]);
    expect(broachViolations(shared, { '1': 3, '2': 1 })).toEqual([]);
  });

  it('broachViolations: 未登録 (counts 空) で装備があれば全て違反になる', () => {
    expect(broachViolations([[1], [], [], [], [], []], {})).toEqual([1]);
  });

  it('broachViolations: フレンド枠の装備は違反にならない', () => {
    expect(broachViolations([[], [], [], [], [], [1, 1]], {})).toEqual([]);
  });
});
