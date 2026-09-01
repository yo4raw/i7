// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ADAPTERS, clampRowSet, findAdapter, hasPendingLocalChanges, planKind,
} from '../../../src/lib/sync/adapters';
import { commitBaselineRow } from '../../../src/lib/sync/baseline';
import { STORAGE_KEYS, saveJson } from '../../../src/lib/storage';
import type { PulledRows } from '../../../src/lib/sync/port';

const EMPTY_PULL: PulledRows = {
  card_counts: [], shared_broach_counts: [], rabbit_notes: [], decks: [], deck_slots: [],
};

beforeEach(() => localStorage.clear());

describe('clampRowSet', () => {
  it('上限を超える値を丸める', () => {
    expect([...clampRowSet(new Map([['a', 15], ['b', 3]]), 10)]).toEqual([['a', 10], ['b', 3]]);
  });

  it('上限以下はそのまま', () => {
    expect([...clampRowSet(new Map([['a', 10]]), 10)]).toEqual([['a', 10]]);
  });
});

describe('ADAPTERS', () => {
  it('4 つのデータ種別を網羅している', () => {
    expect(ADAPTERS.map((a) => a.kind)).toEqual([
      'card_counts', 'shared_broach_counts', 'rabbit_notes', 'decks',
    ]);
  });
});

describe('planKind (card_counts)', () => {
  it('ローカルだけに変更があれば push の判定になる', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const plan = planKind(findAdapter('card_counts'), EMPTY_PULL);
    expect(plan.conflictKeys).toEqual([]);
    expect(plan.verdicts).toEqual([{ kind: 'push', key: '5', value: 2 }]);
  });

  it('サーバだけに変更があれば adopt の判定になる', () => {
    const pulled: PulledRows = {
      ...EMPTY_PULL,
      card_counts: [{ user_id: 'u', card_id: 5, count: 3, rev: 7, updated_at: '2026-08-31T00:00:00Z' }],
    };
    const plan = planKind(findAdapter('card_counts'), pulled);
    expect(plan.verdicts).toEqual([{ kind: 'adopt', key: '5', value: 3 }]);
    expect(plan.serverRevs).toEqual([7]);
  });

  it('ベースラインと一致していれば noop になる', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    commitBaselineRow('card_counts', '5', 2);
    const plan = planKind(findAdapter('card_counts'), EMPTY_PULL);
    expect(plan.verdicts).toEqual([{ kind: 'noop', key: '5', value: 2 }]);
  });

  it('両方が別々に変わっていれば競合キーとして返す', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const pulled: PulledRows = {
      ...EMPTY_PULL,
      card_counts: [{ user_id: 'u', card_id: 5, count: 8, rev: 7, updated_at: '2026-08-31T00:00:00Z' }],
    };
    const plan = planKind(findAdapter('card_counts'), pulled);
    expect(plan.conflictKeys).toEqual(['5']);
  });
});

describe('planKind — 差分プルの扱い（重要）', () => {
  it('差分に現れない行は「未変更」と扱う（サーバ削除と誤認してローカルを消さない）', () => {
    // 前回同期済みの状態: ローカルとベースラインが一致し、サーバからは差分が来ない
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    commitBaselineRow('card_counts', '5', 2);
    const plan = planKind(findAdapter('card_counts'), EMPTY_PULL);
    expect(plan.verdicts).toEqual([{ kind: 'noop', key: '5', value: 2 }]);
  });
});

describe('planKind (shared_broach_counts)', () => {
  it('ローカルもサーバも上限 10 に丸めるため、超過値で競合が起きない', () => {
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, { '1': 15 });
    const pulled: PulledRows = {
      ...EMPTY_PULL,
      shared_broach_counts: [{ user_id: 'u', broach_id: 1, count: 20, rev: 3, updated_at: '2026-08-31T00:00:00Z' }],
    };
    const plan = planKind(findAdapter('shared_broach_counts'), pulled);
    expect(plan.conflictKeys).toEqual([]);
    expect(plan.verdicts).toEqual([{ kind: 'noop', key: '1', value: 10 }]);
  });
});

describe('hasPendingLocalChanges', () => {
  it('ベースラインと一致していれば false', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    commitBaselineRow('card_counts', '5', 2);
    expect(hasPendingLocalChanges()).toBe(false);
  });

  it('ベースラインに無いローカル変更があれば true', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    expect(hasPendingLocalChanges()).toBe(true);
  });

  it('何も無ければ false', () => {
    expect(hasPendingLocalChanges()).toBe(false);
  });

  it('プロジェクションが throw しても未同期あり (true) に倒す', () => {
    // SAVED_DECKS が配列でない状態（バックアップ復元後の壊れ方の一種）。
    // savedDecksToRowSet の for...of が「iterable ではない」で throw する
    saveJson(STORAGE_KEYS.SAVED_DECKS, {});
    expect(hasPendingLocalChanges()).toBe(true);
  });
});

describe('adapter.writeLocal', () => {
  it('card_counts の書き戻しでストアも更新される', async () => {
    const { getCount } = await import('../../../src/lib/stores/cardCounts.svelte');
    findAdapter('card_counts').writeLocal(new Map([['5', 4]]) as never);
    expect(getCount(5)).toBe(4);
  });

  it('decks の書き戻しで localStorage が SavedDeck[] の形になる', async () => {
    const { savedDecksToRowSet } = await import('../../../src/lib/sync/projection/decks');
    const deck = {
      id: 'd1', name: 'A', createdAt: 1000, updatedAt: 2000,
      state: {
        songId: null, deckIds: [1, null, null, null, null, null],
        bonusTiers: [], trained: [], sharedBroachs: [], skillLevels: [],
      },
    };
    findAdapter('decks').writeLocal(savedDecksToRowSet([deck]) as never);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_DECKS) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('d1');
    expect(stored[0].state.deckIds[0]).toBe(1);
  });
});
