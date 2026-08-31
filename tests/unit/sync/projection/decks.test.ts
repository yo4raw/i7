import { describe, it, expect } from 'vitest';
import {
  deckEquals, deckRowsToRowSet, rowSetToSavedDecks, savedDecksToRowSet, SLOT_COUNT,
} from '../../../../src/lib/sync/projection/decks';
import type { SavedDeck } from '../../../../src/lib/sync/projection/decks';

const deck: SavedDeck = {
  id: 'm9x2k1p',
  name: 'イベント用フル特効',
  createdAt: 1_780_000_000_000,
  updatedAt: 1_780_000_100_000,
  state: {
    songId: 42,
    deckIds: [101, 102, null, 104, 105, 106],
    bonusTiers: ['gold', 'silver', '', 'none', 'none', 'none'],
    trained: [true, false, false, true, false, false],
    sharedBroachs: [[1, 2], [], [], [3], [], []],
    skillLevels: [5, 4, 0, 3, 2, 1],
  },
};

describe('savedDecksToRowSet', () => {
  it('デッキ ID をキーにし、スロットを常に 6 件に正規化する', () => {
    const value = savedDecksToRowSet([deck]).get('m9x2k1p');
    expect(value?.name).toBe('イベント用フル特効');
    expect(value?.song_id).toBe(42);
    expect(value?.deleted_at).toBeNull();
    expect(value?.slots).toHaveLength(SLOT_COUNT);
    expect(value?.slots[0]).toEqual({
      slot_index: 0, card_id: 101, trained: true, skill_level: 5,
      bonus_tier: 'gold', shared_broach_ids: [1, 2],
    });
  });

  it('epoch ミリ秒を ISO 文字列にする', () => {
    expect(savedDecksToRowSet([deck]).get('m9x2k1p')?.created_at)
      .toBe(new Date(1_780_000_000_000).toISOString());
  });

  it('配列が 6 件に足りないデッキでも 6 スロットに埋める', () => {
    const short: SavedDeck = {
      ...deck,
      id: 'short',
      state: { songId: null, deckIds: [7], bonusTiers: [], trained: [], sharedBroachs: [], skillLevels: [] },
    };
    const value = savedDecksToRowSet([short]).get('short');
    expect(value?.slots).toHaveLength(SLOT_COUNT);
    expect(value?.slots[5]).toEqual({
      slot_index: 5, card_id: null, trained: false, skill_level: null,
      bonus_tier: null, shared_broach_ids: [],
    });
  });

  it('空文字の bonusTier は null にする', () => {
    expect(savedDecksToRowSet([deck]).get('m9x2k1p')?.slots[2].bonus_tier).toBeNull();
  });
});

describe('rowSetToSavedDecks', () => {
  it('往復して元の SavedDeck に戻る', () => {
    const restored = rowSetToSavedDecks(savedDecksToRowSet([deck]));
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(deck.id);
    expect(restored[0].name).toBe(deck.name);
    expect(restored[0].createdAt).toBe(deck.createdAt);
    expect(restored[0].state.deckIds).toEqual(deck.state.deckIds);
    expect(restored[0].state.sharedBroachs).toEqual(deck.state.sharedBroachs);
    expect(restored[0].state.skillLevels).toEqual(deck.state.skillLevels);
  });

  it('deleted_at が入っているデッキは復元しない (tombstone)', () => {
    const rows = savedDecksToRowSet([deck]);
    rows.set('m9x2k1p', { ...rows.get('m9x2k1p')!, deleted_at: '2026-08-31T00:00:00.000Z' });
    expect(rowSetToSavedDecks(rows)).toEqual([]);
  });

  it('updatedAt の降順ではなく createdAt の昇順で返す (既存の保存順を保つ)', () => {
    const older: SavedDeck = { ...deck, id: 'older', createdAt: 1_000, updatedAt: 9_999 };
    const rows = savedDecksToRowSet([deck, older]);
    expect(rowSetToSavedDecks(rows).map((d) => d.id)).toEqual(['older', 'm9x2k1p']);
  });
});

describe('deckRowsToRowSet', () => {
  it('デッキ行とスロット行を結合する', () => {
    const deckRows = [{
      user_id: 'u', id: 'd1', name: 'A', song_id: 3,
      created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z',
      deleted_at: null, rev: 5,
    }];
    const slotRows = [{
      user_id: 'u', deck_id: 'd1', slot_index: 0, card_id: 9, trained: true,
      skill_level: 2, bonus_tier: 'gold', shared_broach_ids: [4],
    }];
    const value = deckRowsToRowSet(deckRows, slotRows).get('d1');
    expect(value?.slots).toHaveLength(SLOT_COUNT);
    expect(value?.slots[0].card_id).toBe(9);
    expect(value?.slots[1].card_id).toBeNull();
  });

  it('スロット行が無いデッキでも 6 スロットの空枠になる', () => {
    const deckRows = [{
      user_id: 'u', id: 'd2', name: 'B', song_id: null,
      created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z',
      deleted_at: null, rev: 1,
    }];
    expect(deckRowsToRowSet(deckRows, []).get('d2')?.slots).toHaveLength(SLOT_COUNT);
  });
});

describe('deckEquals', () => {
  it('同一内容なら true', () => {
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    expect(deckEquals(a, b)).toBe(true);
  });

  it('スロットが 1 つでも違えば false', () => {
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    b.slots[3] = { ...b.slots[3], card_id: 999 };
    expect(deckEquals(a, b)).toBe(false);
  });

  it('updated_at の違いは無視する (サーバが採番する値であり内容ではない)', () => {
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = { ...a, updated_at: '2030-01-01T00:00:00.000Z' };
    expect(deckEquals(a, b)).toBe(true);
  });
});
