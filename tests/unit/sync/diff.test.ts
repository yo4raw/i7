import { describe, it, expect } from 'vitest';
import { diffRowSets, hasChanges } from '../../../src/lib/sync/diff';

const numEquals = (a: number, b: number) => a === b;
type V = { n: number };
const objEquals = (a: V, b: V) => a.n === b.n;

describe('diffRowSets', () => {
  it('ベースラインに無い行を added として返す', () => {
    const diff = diffRowSets(new Map(), new Map([['a', 1]]), numEquals);
    expect(diff).toEqual({ added: [['a', 1]], changed: [], removed: [] });
  });

  it('値が変わった行を changed として返す', () => {
    const diff = diffRowSets(new Map([['a', 1]]), new Map([['a', 2]]), numEquals);
    expect(diff).toEqual({ added: [], changed: [['a', 2]], removed: [] });
  });

  it('現在に無い行を removed として返す', () => {
    const diff = diffRowSets(new Map([['a', 1]]), new Map(), numEquals);
    expect(diff).toEqual({ added: [], changed: [], removed: ['a'] });
  });

  it('値が同じ行は何にも含めない', () => {
    const diff = diffRowSets(new Map([['a', 1]]), new Map([['a', 1]]), numEquals);
    expect(diff).toEqual({ added: [], changed: [], removed: [] });
  });

  it('追加・変更・削除・無変更が混在しても正しく分類する', () => {
    const baseline = new Map([['keep', 1], ['change', 1], ['drop', 1]]);
    const current = new Map([['keep', 1], ['change', 2], ['new', 3]]);
    const diff = diffRowSets(baseline, current, numEquals);
    expect(diff.added).toEqual([['new', 3]]);
    expect(diff.changed).toEqual([['change', 2]]);
    expect(diff.removed).toEqual(['drop']);
  });

  it('equals をオブジェクト比較に差し替えられる', () => {
    const diff = diffRowSets<V>(new Map([['a', { n: 1 }]]), new Map([['a', { n: 1 }]]), objEquals);
    expect(diff.changed).toEqual([]);
  });
});

describe('hasChanges', () => {
  it('3 つとも空なら false', () => {
    expect(hasChanges({ added: [], changed: [], removed: [] })).toBe(false);
  });

  it('いずれかに要素があれば true', () => {
    expect(hasChanges({ added: [['a', 1]], changed: [], removed: [] })).toBe(true);
    expect(hasChanges({ added: [], changed: [['a', 1]], removed: [] })).toBe(true);
    expect(hasChanges({ added: [], changed: [], removed: ['a'] })).toBe(true);
  });
});
