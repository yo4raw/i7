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
  /**
   * サーバの 1 回のレスポンスが返す最大行数（PostgREST の Max rows 相当）。
   *
   * pull は rev 昇順に並べたうえでこの件数ごとに「ページ」を切り、ページが尽きるまで
   * 内部でループして全件を返す（実クライアントの order + range ページングと同じ形）。
   * 1 ページぶんだけ返して止めてしまう実装に戻すとこのテストが落ちる。
   */
  maxRowsPerRequest?: number;
};

/**
 * Postgres が timestamptz を JSON へ描画する書式に寄せる。
 *
 * クライアントが送る `2026-08-31T00:00:00.000Z` は
 * `2026-08-31T00:00:00+00:00` として返ってくる。フェイクがクライアントの文字列を
 * そのまま返すと、生文字列比較に依存した実装（永久に再 push される）を
 * テストで検出できない。
 */
function pgTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/u, '+00:00');
}

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

  /**
   * サーバの 1 回のレスポンス上限（PostgREST の Max rows 相当）を模す。
   *
   * rev 昇順に並んだ行をページ単位で切り出し、ページが尽きるまで繋げて返す。
   * 実クライアント (`supabasePort.ts`) の order + range ページングと同じ形にすることで、
   * 「ページングを実装していれば 1 回の pull で全件そろう」ことをここでも検証できる。
   */
  function paginate<T>(rows: T[]): T[] {
    const cap = options.maxRowsPerRequest;
    if (cap === undefined) return rows;
    const out: T[] = [];
    for (let from = 0; from < rows.length; from += cap) out.push(...rows.slice(from, from + cap));
    return out;
  }

  const port: SyncPort = {
    async getUserId() {
      return userId;
    },

    async pull(cursorRev) {
      if (options.failPull) throw new Error('network unreachable');
      const pulled: PulledRows = {
        card_counts: paginate(
          [...cardCounts].filter(([, v]) => v.rev > cursorRev)
            .toSorted(([, a], [, b]) => a.rev - b.rev)
            .map(([card_id, v]) => ({
              user_id: 'user-1', card_id, count: v.count, rev: v.rev,
              updated_at: '2026-08-31T00:00:00.000Z',
            })),
        ),
        shared_broach_counts: paginate(
          [...broachCounts].filter(([, v]) => v.rev > cursorRev)
            .toSorted(([, a], [, b]) => a.rev - b.rev)
            .map(([broach_id, v]) => ({
              user_id: 'user-1', broach_id, count: v.count, rev: v.rev,
              updated_at: '2026-08-31T00:00:00.000Z',
            })),
        ),
        rabbit_notes: paginate(
          [...rabbitNotes].filter(([, v]) => v.rev > cursorRev)
            .toSorted(([, a], [, b]) => a.rev - b.rev)
            .map(([character, v]) => ({
              user_id: 'user-1', character, shout: v.shout, beat: v.beat, melody: v.melody,
              rev: v.rev, updated_at: '2026-08-31T00:00:00.000Z',
            })),
        ),
        decks: paginate(
          [...decks].filter(([, v]) => v.rev > cursorRev)
            .toSorted(([, a], [, b]) => a.rev - b.rev)
            .map(([id, v]) => ({
              user_id: 'user-1', id, name: v.name, song_id: v.song_id,
              created_at: v.created_at, updated_at: v.updated_at, deleted_at: v.deleted_at, rev: v.rev,
            })),
        ),
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
      if (outcome.ok) {
        const existing = decks.get(key);
        decks.set(key, {
          ...deck,
          // 実 RPC の on conflict は created_at を更新しない。既存行があれば保持する
          created_at: existing?.created_at ?? pgTimestamp(deck.created_at),
          // updated_at はサーバ側が採番する
          updated_at: pgTimestamp(new Date().toISOString()),
          deleted_at: deck.deleted_at === null ? null : pgTimestamp(deck.deleted_at),
          rev: outcome.rev,
        });
      }
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
