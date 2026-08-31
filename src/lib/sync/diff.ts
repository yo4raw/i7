import type { RowSet } from './rows';

export type Diff<V> = {
  added: [string, V][];
  changed: [string, V][];
  removed: string[];
};

/**
 * ベースラインと現在の行集合を比較する。
 *
 * ベースラインは「最後にサーバと一致していると確認できた行集合」なので、
 * この差分がそのまま「未同期のローカル変更」を表す。これにより dirty フラグが不要になり、
 * push が失敗しても次回に同じ差分が再検出される（同期がべき等になる）。
 */
export function diffRowSets<V>(
  baseline: RowSet<V>,
  current: RowSet<V>,
  equals: (a: V, b: V) => boolean,
): Diff<V> {
  const added: [string, V][] = [];
  const changed: [string, V][] = [];
  const removed: string[] = [];

  for (const [key, value] of current) {
    if (!baseline.has(key)) {
      added.push([key, value]);
    } else if (!equals(baseline.get(key) as V, value)) {
      changed.push([key, value]);
    }
  }
  for (const key of baseline.keys()) {
    if (!current.has(key)) removed.push(key);
  }

  return { added, changed, removed };
}

export function hasChanges<V>(diff: Diff<V>): boolean {
  return diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;
}
