import type { DeckRow, DeckSlotRow, RowSet } from '../rows';

/** スロット数。0=センター / 1-4=メンバー / 5=フレンド */
export const SLOT_COUNT = 6;

/**
 * localStorage の保存デッキ。
 * `src/components/ScoreCalc.svelte` / `DeckList.svelte` の型と同じ形をここで固定する。
 * ID は Date.now().toString(36) で UUID ではない。
 */
export type SavedDeck = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: {
    songId: number | null;
    deckIds: (number | null)[];
    bonusTiers: string[];
    trained: boolean[];
    sharedBroachs: number[][];
    skillLevels: number[];
  };
};

export type SyncedDeckSlot = {
  slot_index: number;
  card_id: number | null;
  trained: boolean;
  skill_level: number | null;
  bonus_tier: string | null;
  shared_broach_ids: number[];
};

export type SyncedDeck = {
  name: string;
  song_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  slots: SyncedDeckSlot[];
};

function nullableInt(value: unknown): number | null {
  // null / undefined を先に弾くこと。Number(null) は 0 になるため、
  // 空スロット (deckIds の null) が衣装 ID 0 として同期されてしまう
  if (value === null || value === undefined) return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : null;
}

function emptySlot(slotIndex: number): SyncedDeckSlot {
  return {
    slot_index: slotIndex, card_id: null, trained: false,
    skill_level: null, bonus_tier: null, shared_broach_ids: [],
  };
}

export function savedDecksToRowSet(decks: readonly SavedDeck[]): RowSet<SyncedDeck> {
  const out: RowSet<SyncedDeck> = new Map();
  for (const deck of decks) {
    const state = deck.state;
    const slots = Array.from({ length: SLOT_COUNT }, (_, slotIndex) => ({
      slot_index: slotIndex,
      card_id: nullableInt(state.deckIds?.[slotIndex]),
      trained: state.trained?.[slotIndex] === true,
      skill_level: nullableInt(state.skillLevels?.[slotIndex]),
      bonus_tier: state.bonusTiers?.[slotIndex] || null,
      shared_broach_ids: [...(state.sharedBroachs?.[slotIndex] ?? [])],
    }));
    out.set(deck.id, {
      name: deck.name,
      song_id: nullableInt(state.songId),
      created_at: new Date(deck.createdAt).toISOString(),
      updated_at: new Date(deck.updatedAt).toISOString(),
      deleted_at: null,
      slots,
    });
  }
  return out;
}

export function rowSetToSavedDecks(rows: RowSet<SyncedDeck>): SavedDeck[] {
  const out: SavedDeck[] = [];
  for (const [id, value] of rows) {
    if (value.deleted_at !== null) continue;   // tombstone は復元しない
    out.push({
      id,
      name: value.name,
      createdAt: Date.parse(value.created_at),
      updatedAt: Date.parse(value.updated_at),
      state: {
        songId: value.song_id,
        deckIds: value.slots.map((s) => s.card_id),
        bonusTiers: value.slots.map((s) => s.bonus_tier ?? ''),
        trained: value.slots.map((s) => s.trained),
        sharedBroachs: value.slots.map((s) => [...s.shared_broach_ids]),
        skillLevels: value.slots.map((s) => s.skill_level ?? 0),
      },
    });
  }
  // 既存の保存順（作成順に push される）を保つ
  return out.toSorted((a, b) => a.createdAt - b.createdAt);
}

export function deckRowsToRowSet(
  deckRows: readonly DeckRow[],
  slotRows: readonly DeckSlotRow[],
): RowSet<SyncedDeck> {
  const slotsByDeck = new Map<string, SyncedDeckSlot[]>();
  for (const row of slotRows) {
    const slots = slotsByDeck.get(row.deck_id)
      ?? Array.from({ length: SLOT_COUNT }, (_, i) => emptySlot(i));
    /* v8 ignore next -- deck_slots_slot_range の CHECK 制約により実データでは到達しない */
    if (row.slot_index >= 0 && row.slot_index < SLOT_COUNT) {
      slots[row.slot_index] = {
        slot_index: row.slot_index,
        card_id: row.card_id,
        trained: row.trained,
        skill_level: row.skill_level,
        bonus_tier: row.bonus_tier,
        shared_broach_ids: [...row.shared_broach_ids],
      };
    }
    slotsByDeck.set(row.deck_id, slots);
  }

  const out: RowSet<SyncedDeck> = new Map();
  for (const row of deckRows) {
    out.set(row.id, {
      name: row.name,
      song_id: row.song_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      slots: slotsByDeck.get(row.id) ?? Array.from({ length: SLOT_COUNT }, (_, i) => emptySlot(i)),
    });
  }
  return out;
}

function slotEquals(a: SyncedDeckSlot, b: SyncedDeckSlot): boolean {
  return a.slot_index === b.slot_index
    && a.card_id === b.card_id
    && a.trained === b.trained
    && a.skill_level === b.skill_level
    && a.bonus_tier === b.bonus_tier
    && a.shared_broach_ids.length === b.shared_broach_ids.length
    && a.shared_broach_ids.every((id, i) => id === b.shared_broach_ids[i]);
}

/**
 * updated_at はサーバが採番する値であり「内容」ではないので比較から除く。
 * ここに含めると、サーバから取り込んだ直後に必ず差分ありと判定されてしまう。
 *
 * created_at は**生文字列で比較してはならない**。クライアントは
 * `new Date(ms).toISOString()`（`2026-08-31T00:00:00.000Z`）を送るが、
 * Postgres は timestamptz を `2026-08-31T00:00:00+00:00` の形で返す。
 * 文字列比較にすると全デッキが毎回「変更あり」と判定され永久に再 push される。
 *
 * deleted_at も同様に厳密比較しない。tombstone の時刻は利用者のデータではなく、
 * push のたびに再スタンプされるため、「削除されているか」だけを比べる。
 */
export function deckEquals(a: SyncedDeck, b: SyncedDeck): boolean {
  return a.name === b.name
    && a.song_id === b.song_id
    && Date.parse(a.created_at) === Date.parse(b.created_at)
    && (a.deleted_at === null) === (b.deleted_at === null)
    && a.slots.length === b.slots.length
    && a.slots.every((slot, i) => slotEquals(slot, b.slots[i]));
}
