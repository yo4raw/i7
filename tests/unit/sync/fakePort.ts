/* oxlint-disable require-await -- SyncPort が Promise 返却を要求するため async にしているが、
   インメモリのフェイクには await するものが無い */
import type { PulledRows, PushResult, SyncPort } from '../../../src/lib/sync/port';
import type { SyncedDeck } from '../../../src/lib/sync/projection/decks';
import type { RabbitNoteValue } from '../../../src/lib/sync/projection/rabbitNotes';

type FakeOptions = {
  userId?: string | null;
  /** pull を失敗させる（オフラインの再現） */
  failPull?: boolean;
  /** このキーの push だけを失敗させる（部分失敗の再現） */
  failPushKeys?: Set<string>;
};

export function createFakePort(options: FakeOptions = {}) {
  const userId = options.userId === undefined ? 'user-1' : options.userId;
  let rev = 0;
  const cardCounts = new Map<number, { count: number; rev: number }>();
  const broachCounts = new Map<number, { count: number; rev: number }>();
  const rabbitNotes = new Map<string, RabbitNoteValue & { rev: number }>();
  const decks = new Map<string, SyncedDeck & { rev: number }>();

  function bump(): number {
    rev += 1;
    return rev;
  }

  function result(key: string, nextRev: number): PushResult {
    return options.failPushKeys?.has(key)
      ? { ok: false, error: 'forced failure' }
      : { ok: true, rev: nextRev };
  }

  const port: SyncPort = {
    async getUserId() {
      return userId;
    },

    async pull(cursorRev) {
      if (options.failPull) throw new Error('network unreachable');
      const pulled: PulledRows = {
        card_counts: [...cardCounts].filter(([, v]) => v.rev > cursorRev).map(([card_id, v]) => ({
          user_id: 'user-1', card_id, count: v.count, rev: v.rev,
          updated_at: '2026-08-31T00:00:00.000Z',
        })),
        shared_broach_counts: [...broachCounts].filter(([, v]) => v.rev > cursorRev).map(([broach_id, v]) => ({
          user_id: 'user-1', broach_id, count: v.count, rev: v.rev,
          updated_at: '2026-08-31T00:00:00.000Z',
        })),
        rabbit_notes: [...rabbitNotes].filter(([, v]) => v.rev > cursorRev).map(([character, v]) => ({
          user_id: 'user-1', character, shout: v.shout, beat: v.beat, melody: v.melody,
          rev: v.rev, updated_at: '2026-08-31T00:00:00.000Z',
        })),
        decks: [...decks].filter(([, v]) => v.rev > cursorRev).map(([id, v]) => ({
          user_id: 'user-1', id, name: v.name, song_id: v.song_id,
          created_at: v.created_at, updated_at: v.updated_at, deleted_at: v.deleted_at, rev: v.rev,
        })),
        deck_slots: [],
      };
      for (const [id, deck] of decks) {
        if (deck.rev <= cursorRev) continue;
        for (const slot of deck.slots) {
          pulled.deck_slots.push({ user_id: 'user-1', deck_id: id, ...slot });
        }
      }
      return pulled;
    },

    async pushCounts(table, rows) {
      const store = table === 'card_counts' ? cardCounts : broachCounts;
      const out = new Map<string, PushResult>();
      for (const row of rows) {
        const outcome = result(row.key, bump());
        if (outcome.ok) store.set(Number(row.key), { count: row.count, rev: outcome.rev });
        out.set(row.key, outcome);
      }
      return out;
    },

    async pushRabbitNotes(rows) {
      const out = new Map<string, PushResult>();
      for (const row of rows) {
        const outcome = result(row.key, bump());
        if (outcome.ok) rabbitNotes.set(row.key, { ...row.value, rev: outcome.rev });
        out.set(row.key, outcome);
      }
      return out;
    },

    async pushDeck(key, deck) {
      const outcome = result(key, bump());
      if (outcome.ok) decks.set(key, { ...deck, rev: outcome.rev });
      return outcome;
    },

    async deleteAll() {
      cardCounts.clear();
      broachCounts.clear();
      rabbitNotes.clear();
      decks.clear();
    },
  };

  /** テストからサーバ状態を直接仕込む（別端末の書き込みの再現） */
  function seedCardCount(cardId: number, count: number): void {
    cardCounts.set(cardId, { count, rev: bump() });
  }

  function seedBroachCount(broachId: number, count: number): void {
    broachCounts.set(broachId, { count, rev: bump() });
  }

  function seedRabbitNote(character: string, value: RabbitNoteValue): void {
    rabbitNotes.set(character, { ...value, rev: bump() });
  }

  return {
    port, seedCardCount, seedBroachCount, seedRabbitNote,
    state: { cardCounts, broachCounts, rabbitNotes, decks },
  };
}
