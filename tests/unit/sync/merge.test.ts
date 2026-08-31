import { describe, it, expect } from 'vitest';
import { mergeRow, mergeRowSets } from '../../../src/lib/sync/merge';

const eq = (a: number, b: number) => a === b;
const row = (baseline: number | null, local: number | null, server: number | null) =>
  mergeRow({ key: 'k', baseline, local, server, equals: eq });

describe('mergeRow', () => {
  it('ローカルもサーバもベースラインと同じなら noop', () => {
    expect(row(1, 1, 1)).toEqual({ kind: 'noop', key: 'k', value: 1 });
  });

  it('ローカルだけ変わっていれば push', () => {
    expect(row(1, 2, 1)).toEqual({ kind: 'push', key: 'k', value: 2 });
  });

  it('サーバだけ変わっていれば adopt', () => {
    expect(row(1, 1, 2)).toEqual({ kind: 'adopt', key: 'k', value: 2 });
  });

  it('両方が別々に変わっていれば conflict', () => {
    expect(row(1, 2, 3)).toEqual({ kind: 'conflict', key: 'k', local: 2, server: 3 });
  });

  it('両方が同じ値に変わっていれば収束済みとして noop', () => {
    expect(row(1, 2, 2)).toEqual({ kind: 'noop', key: 'k', value: 2 });
  });

  it('ベースラインが無くローカルのみ値があれば push (初回の新規行)', () => {
    expect(row(null, 5, null)).toEqual({ kind: 'push', key: 'k', value: 5 });
  });

  it('ベースラインが無くサーバのみ値があれば adopt', () => {
    expect(row(null, null, 5)).toEqual({ kind: 'adopt', key: 'k', value: 5 });
  });

  it('ベースラインが無く両方に別の値があれば conflict (初回リンク)', () => {
    expect(row(null, 5, 6)).toEqual({ kind: 'conflict', key: 'k', local: 5, server: 6 });
  });

  it('ローカルで削除されサーバは変化なしなら push(null)', () => {
    expect(row(1, null, 1)).toEqual({ kind: 'push', key: 'k', value: null });
  });

  it('サーバで削除されローカルは変化なしなら adopt(null)', () => {
    expect(row(1, 1, null)).toEqual({ kind: 'adopt', key: 'k', value: null });
  });

  it('両方で削除されていれば noop', () => {
    expect(row(1, null, null)).toEqual({ kind: 'noop', key: 'k', value: null });
  });
});

describe('mergeRowSets', () => {
  it('3 つの行集合に現れる全キーを対象にする', () => {
    const verdicts = mergeRowSets(
      new Map([['b', 1]]),
      new Map([['l', 1]]),
      new Map([['s', 1]]),
      eq,
    );
    expect(verdicts.map((v) => v.key).toSorted()).toEqual(['b', 'l', 's']);
  });

  it('キーごとに独立に判定する (競合が他のキーの同期を止めない)', () => {
    const verdicts = mergeRowSets(
      new Map([['a', 1], ['b', 1]]),
      new Map([['a', 2], ['b', 9]]),
      new Map([['a', 1], ['b', 8]]),
      eq,
    );
    expect(verdicts.find((v) => v.key === 'a')).toEqual({ kind: 'push', key: 'a', value: 2 });
    expect(verdicts.find((v) => v.key === 'b')).toEqual({ kind: 'conflict', key: 'b', local: 9, server: 8 });
  });

  it('noop だけの場合も全キーぶん返す', () => {
    const same = new Map([['a', 1]]);
    expect(mergeRowSets(same, same, same, eq)).toEqual([{ kind: 'noop', key: 'a', value: 1 }]);
  });
});
