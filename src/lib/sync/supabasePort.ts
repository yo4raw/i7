/* v8 ignore start -- PostgREST への実接続のみ。判定ロジックは syncEngine 側でテストしている */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncedDeck } from './projection/decks';
import type { CountTable, PulledRows, PushResult, SyncPort } from './port';

const ID_COLUMN: Record<CountTable, 'card_id' | 'broach_id'> = {
  card_counts: 'card_id',
  shared_broach_counts: 'broach_id',
};

function allFailed(keys: readonly string[], error: string): Map<string, PushResult> {
  return new Map(keys.map((key) => [key, { ok: false, error }]));
}

export function createSupabasePort(client: SupabaseClient): SyncPort {
  async function currentUserId(): Promise<string | null> {
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  }

  return {
    getUserId: currentUserId,

    async pull(cursorRev) {
      const [cards, broachs, notes, decks] = await Promise.all([
        client.from('card_counts').select('*').gt('rev', cursorRev),
        client.from('shared_broach_counts').select('*').gt('rev', cursorRev),
        client.from('rabbit_notes').select('*').gt('rev', cursorRev),
        client.from('decks').select('*').gt('rev', cursorRev),
      ]);
      for (const result of [cards, broachs, notes, decks]) {
        if (result.error) throw new Error(result.error.message);
      }

      const deckRows = (decks.data ?? []) as PulledRows['decks'];
      let slotRows: PulledRows['deck_slots'] = [];
      if (deckRows.length > 0) {
        const slots = await client.from('deck_slots').select('*')
          .in('deck_id', deckRows.map((deck) => deck.id));
        if (slots.error) throw new Error(slots.error.message);
        slotRows = (slots.data ?? []) as PulledRows['deck_slots'];
      }

      return {
        card_counts: (cards.data ?? []) as PulledRows['card_counts'],
        shared_broach_counts: (broachs.data ?? []) as PulledRows['shared_broach_counts'],
        rabbit_notes: (notes.data ?? []) as PulledRows['rabbit_notes'],
        decks: deckRows,
        deck_slots: slotRows,
      };
    },

    async pushCounts(table, rows) {
      if (rows.length === 0) return new Map();
      const keys = rows.map((row) => row.key);
      const userId = await currentUserId();
      if (userId === null) return allFailed(keys, 'not authenticated');

      const idColumn = ID_COLUMN[table];
      const payload = rows.map((row) => ({
        user_id: userId,
        [idColumn]: Number(row.key),
        count: row.count,
      }));

      const { data, error } = await client.from(table)
        .upsert(payload, { onConflict: `user_id,${idColumn}` })
        .select(`${idColumn}, rev`);
      if (error) return allFailed(keys, error.message);

      const out = new Map<string, PushResult>();
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        out.set(String(row[idColumn]), { ok: true, rev: Number(row.rev) });
      }
      // 返ってこなかった行はベースラインを進めない
      for (const key of keys) {
        if (!out.has(key)) out.set(key, { ok: false, error: 'not returned by server' });
      }
      return out;
    },

    async pushRabbitNotes(rows) {
      if (rows.length === 0) return new Map();
      const keys = rows.map((row) => row.key);
      const userId = await currentUserId();
      if (userId === null) return allFailed(keys, 'not authenticated');

      const payload = rows.map(({ key, value }) => ({
        user_id: userId, character: key,
        shout: value.shout, beat: value.beat, melody: value.melody,
      }));

      const { data, error } = await client.from('rabbit_notes')
        .upsert(payload, { onConflict: 'user_id,character' })
        .select('character, rev');
      if (error) return allFailed(keys, error.message);

      const out = new Map<string, PushResult>();
      for (const row of (data ?? []) as { character: string; rev: number }[]) {
        out.set(row.character, { ok: true, rev: Number(row.rev) });
      }
      for (const key of keys) {
        if (!out.has(key)) out.set(key, { ok: false, error: 'not returned by server' });
      }
      return out;
    },

    async pushDeck(key, deck: SyncedDeck) {
      const { data, error } = await client.rpc('upsert_deck', {
        payload: {
          id: key,
          name: deck.name,
          song_id: deck.song_id,
          created_at: deck.created_at,
          deleted_at: deck.deleted_at,
          slots: deck.slots,
        },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, rev: Number(data) };
    },

    async deleteAll() {
      const { error } = await client.rpc('delete_all_sync_data');
      if (error) throw new Error(error.message);
    },
  };
}
/* v8 ignore stop */
