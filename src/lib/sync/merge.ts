import type { RowSet } from './rows';

export type MergeVerdict<V> =
  | { kind: 'noop'; key: string; value: V | null }
  | { kind: 'push'; key: string; value: V | null }
  | { kind: 'adopt'; key: string; value: V | null }
  | { kind: 'conflict'; key: string; local: V | null; server: V | null };

/** null（行なし）も含めた同値判定 */
function same<V>(a: V | null, b: V | null, equals: (x: V, y: V) => boolean): boolean {
  if (a === null || b === null) return a === b;
  return equals(a, b);
}

/**
 * ベースライン B / ローカル現在 L / サーバ現在 S の 3 値から行単位の処分を決める。
 *
 * 2 値では「自分が変えた」と「相手が変えた」を区別できないため、
 * ベースラインを基準点に置くのがこの設計の中核（ADR 0064 決定 6）。
 */
export function mergeRow<V>(args: {
  key: string;
  baseline: V | null;
  local: V | null;
  server: V | null;
  equals: (a: V, b: V) => boolean;
}): MergeVerdict<V> {
  const { key, baseline, local, server, equals } = args;
  const localChanged = !same(baseline, local, equals);
  const serverChanged = !same(baseline, server, equals);

  if (!localChanged && !serverChanged) return { kind: 'noop', key, value: local };
  if (localChanged && !serverChanged) return { kind: 'push', key, value: local };
  if (!localChanged && serverChanged) return { kind: 'adopt', key, value: server };
  // 両方変わった。同じ値へ収束していれば競合ではない
  if (same(local, server, equals)) return { kind: 'noop', key, value: local };
  return { kind: 'conflict', key, local, server };
}

export function mergeRowSets<V>(
  baseline: RowSet<V>,
  local: RowSet<V>,
  server: RowSet<V>,
  equals: (a: V, b: V) => boolean,
): MergeVerdict<V>[] {
  const keys = new Set<string>([...baseline.keys(), ...local.keys(), ...server.keys()]);
  return [...keys].map((key) => mergeRow({
    key,
    baseline: baseline.has(key) ? (baseline.get(key) as V) : null,
    local: local.has(key) ? (local.get(key) as V) : null,
    server: server.has(key) ? (server.get(key) as V) : null,
    equals,
  }));
}
