import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncedDeck } from './projection/decks';
import type { CountTable, PulledRows, PushResult, SyncPort } from './port';

const ID_COLUMN: Record<CountTable, 'card_id' | 'broach_id'> = {
  card_counts: 'card_id',
  shared_broach_counts: 'broach_id',
};

/* v8 ignore start -- PostgREST への実接続のみ。判定ロジックは syncEngine 側でテストしている */
function allFailed(keys: readonly string[], error: string): Map<string, PushResult> {
  return new Map(keys.map((key) => [key, { ok: false, error }]));
}
/* v8 ignore stop */

/** PostgREST の Max rows（Supabase 既定 1000）より小さく取る */
const PAGE_SIZE = 500;

/**
 * rev 昇順でページングしながら全行を取る。
 *
 * order を付けないと PostgREST が Max rows で任意の行を静かに切り捨て、
 * カーソルが返却分の最大 rev まで進むため、落ちた行が二度と取得されなくなる。
 */
async function fetchAllByRev<T>(
  client: SupabaseClient,
  table: string,
  cursorRev: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .gt('rev', cursorRev)
      .order('rev', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

/**
 * deck_slots は自身の rev を持たない（親デッキの rev を使う）ため、対象デッキ ID で
 * 絞り込んで全件取る。デッキ数が多いときに Max rows で切り捨てられないよう
 * 同じくページングする。
 */
async function fetchAllDeckSlots(
  client: SupabaseClient,
  deckIds: readonly string[],
): Promise<PulledRows['deck_slots']> {
  const out: PulledRows['deck_slots'] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('deck_slots')
      .select('*')
      .in('deck_id', deckIds)
      .order('slot_index', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as PulledRows['deck_slots'];
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

export function createSupabasePort(client: SupabaseClient): SyncPort {
  /* v8 ignore start -- PostgREST への実接続のみ。判定ロジックは syncEngine 側でテストしている */
  async function currentUserId(): Promise<string | null> {
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  }
  /* v8 ignore stop */

  return {
    getUserId: currentUserId,

    async pull(cursorRev) {
      const [cards, broachs, notes, deckRows] = await Promise.all([
        fetchAllByRev<PulledRows['card_counts'][number]>(client, 'card_counts', cursorRev),
        fetchAllByRev<PulledRows['shared_broach_counts'][number]>(
          client, 'shared_broach_counts', cursorRev,
        ),
        fetchAllByRev<PulledRows['rabbit_notes'][number]>(client, 'rabbit_notes', cursorRev),
        fetchAllByRev<PulledRows['decks'][number]>(client, 'decks', cursorRev),
      ]);

      let slotRows: PulledRows['deck_slots'] = [];
      if (deckRows.length > 0) {
        slotRows = await fetchAllDeckSlots(client, deckRows.map((deck) => deck.id));
      }

      return {
        card_counts: cards,
        shared_broach_counts: broachs,
        rabbit_notes: notes,
        decks: deckRows,
        deck_slots: slotRows,
      };
    },

    /* v8 ignore start -- PostgREST への実接続のみ。判定ロジックは syncEngine 側でテストしている */
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
    /* v8 ignore stop */
  };
}
