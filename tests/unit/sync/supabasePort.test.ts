import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabasePort } from '../../../src/lib/sync/supabasePort';

/** PostgREST の Max rows を模したフェイク。range で要求された範囲を上限まで返す */
function createFakeSupabaseClient(rows: Record<string, unknown[]>, maxRows: number) {
  const rangeCalls: { table: string; from: number; to: number }[] = [];
  const orderCalls: { table: string; column: string; ascending: boolean }[] = [];

  function builder(table: string) {
    const self = {
      select: () => self,
      gt: () => self,
      in: () => self,
      order: (column: string, opts?: { ascending?: boolean }) => {
        orderCalls.push({ table, column, ascending: opts?.ascending ?? true });
        return self;
      },
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

  return { client, rangeCalls, orderCalls };
}

function cardRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: 'user-1', card_id: i + 1, count: 1, rev: i + 1,
    updated_at: '2026-08-31T00:00:00.000Z',
  }));
}

function deckRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: 'user-1',
    id: `deck-${i}`,
    name: `デッキ${i}`,
    song_id: null,
    created_at: '2026-08-31T00:00:00.000Z',
    updated_at: '2026-08-31T00:00:00.000Z',
    deleted_at: null,
    rev: i + 1,
  }));
}

/** 各デッキ 6 スロット分（slot_index 0-5）を生成する */
function deckSlotRows(deckIds: readonly string[]) {
  return deckIds.flatMap((deckId) => Array.from({ length: 6 }, (_, slotIndex) => ({
    user_id: 'user-1',
    deck_id: deckId,
    slot_index: slotIndex,
    card_id: null,
    trained: false,
    skill_level: null,
    bonus_tier: null,
    shared_broach_ids: [],
  })));
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

  it('deck_slots がページ境界を超えても全件取得する', async () => {
    // 200 デッキ × 6 スロット = 1200 行。PAGE_SIZE (500) を跨ぐ
    const decks = deckRows(200);
    const slots = deckSlotRows(decks.map((deck) => deck.id));
    const { client, rangeCalls } = createFakeSupabaseClient(
      {
        card_counts: [], shared_broach_counts: [], rabbit_notes: [],
        decks, deck_slots: slots,
      },
      1000,
    );
    const pulled = await createSupabasePort(client).pull(0);

    expect(pulled.deck_slots).toHaveLength(1200);
    expect(rangeCalls.filter((c) => c.table === 'deck_slots').length).toBeGreaterThan(1);
  });

  it('deck_slots は deck_id と slot_index の両方で全順序に並べる', async () => {
    // slot_index (0-5) 単独では順序が一意に決まらず、range() によるページングが
    // 不安定になる。deck_id も含めた全順序で並べていることを確認する。
    // ここが未対応だと range() をまたいで行が飛び、そのデッキは
    // 「スロットが空のデッキ」として届いてしまう。
    const decks = deckRows(10);
    const slots = deckSlotRows(decks.map((deck) => deck.id));
    const { client, orderCalls } = createFakeSupabaseClient(
      {
        card_counts: [], shared_broach_counts: [], rabbit_notes: [],
        decks, deck_slots: slots,
      },
      1000,
    );
    await createSupabasePort(client).pull(0);

    const deckSlotOrders = orderCalls.filter((c) => c.table === 'deck_slots');
    expect(deckSlotOrders.map((c) => c.column)).toEqual(['deck_id', 'slot_index']);
    expect(deckSlotOrders.every((c) => c.ascending)).toBe(true);
  });

  it('取得したデッキはすべて自身の 6 スロットを伴って返る', async () => {
    // ページングを跨いでも、各デッキの 6 スロットが欠けずに揃っていること
    const decks = deckRows(200);
    const slots = deckSlotRows(decks.map((deck) => deck.id));
    const { client } = createFakeSupabaseClient(
      {
        card_counts: [], shared_broach_counts: [], rabbit_notes: [],
        decks, deck_slots: slots,
      },
      1000,
    );
    const pulled = await createSupabasePort(client).pull(0);

    const slotIndexesByDeck = new Map<string, number[]>();
    for (const slot of pulled.deck_slots) {
      const list = slotIndexesByDeck.get(slot.deck_id) ?? [];
      list.push(slot.slot_index);
      slotIndexesByDeck.set(slot.deck_id, list);
    }

    for (const deck of pulled.decks) {
      const indexes = (slotIndexesByDeck.get(deck.id) ?? []).toSorted((a, b) => a - b);
      expect(indexes).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});
