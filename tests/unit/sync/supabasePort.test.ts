import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabasePort } from '../../../src/lib/sync/supabasePort';

/** PostgREST の Max rows を模したフェイク。range で要求された範囲を上限まで返す */
function createFakeSupabaseClient(rows: Record<string, unknown[]>, maxRows: number) {
  const rangeCalls: { table: string; from: number; to: number }[] = [];

  function builder(table: string) {
    const self = {
      select: () => self,
      gt: () => self,
      in: () => self,
      order: () => self,
      range: (from: number, to: number) => {
        rangeCalls.push({ table, from, to });
        const all = rows[table] ?? [];
        const requested = all.slice(from, to + 1);
        return Promise.resolve({ data: requested.slice(0, maxRows), error: null });
      },
    };
    return self;
  }

  const client = {
    from: (table: string) => builder(table),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
  } as unknown as SupabaseClient;

  return { client, rangeCalls };
}

function cardRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: 'user-1', card_id: i + 1, count: 1, rev: i + 1,
    updated_at: '2026-08-31T00:00:00.000Z',
  }));
}

describe('supabasePort.pull', () => {
  it('サーバの行上限を超える行数でも全件取得する', async () => {
    // PostgREST の Max rows 既定は 1000。それを超える行を用意する
    const { client, rangeCalls } = createFakeSupabaseClient(
      { card_counts: cardRows(1200), shared_broach_counts: [], rabbit_notes: [], decks: [] },
      1000,
    );
    const pulled = await createSupabasePort(client).pull(0);

    // 1 往復で打ち切らず、全行が返ること。ここが落ちると
    // 2 台目の端末が数百件の衣装を恒久的に欠く
    expect(pulled.card_counts).toHaveLength(1200);
    // ページングしていること（1 回で済ませていない）
    expect(rangeCalls.filter((c) => c.table === 'card_counts').length).toBeGreaterThan(1);
  });

  it('行数がページ境界にちょうど一致しても終了する', async () => {
    const { client } = createFakeSupabaseClient(
      { card_counts: cardRows(500), shared_broach_counts: [], rabbit_notes: [], decks: [] },
      1000,
    );
    const pulled = await createSupabasePort(client).pull(0);
    expect(pulled.card_counts).toHaveLength(500);
  });

  it('0 件でも 1 往復で終了する', async () => {
    const { client, rangeCalls } = createFakeSupabaseClient(
      { card_counts: [], shared_broach_counts: [], rabbit_notes: [], decks: [] },
      1000,
    );
    const pulled = await createSupabasePort(client).pull(0);
    expect(pulled.card_counts).toHaveLength(0);
    expect(rangeCalls.filter((c) => c.table === 'card_counts')).toHaveLength(1);
  });
});
