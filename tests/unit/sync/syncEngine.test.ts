// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { runSync } from '../../../src/lib/sync/syncEngine';
import { loadBaselineRowSet, commitBaselineRow } from '../../../src/lib/sync/baseline';
import { loadSyncMeta, saveSyncMeta } from '../../../src/lib/sync/syncMeta';
import { STORAGE_KEYS, loadJson, saveJson } from '../../../src/lib/storage';
import { createFakePort } from './fakePort';

// oxlint-disable-next-line require-await -- ConflictResolver は Promise を返す契約のため async は必須。フェイクは同期的に解決するだけで await は不要
const noConflict = async () => new Map();

/**
 * 「この端末は既にこのアカウントで同期済み」という状態を作る。
 *
 * ベースラインを仕込むテストでは必ず呼ぶこと。呼ばないと runSync の最初の
 * reconcileUser が「userId が null → 別アカウント」と判定してベースラインを
 * 破棄するため、3 値のうちベースラインが常に null になり、
 * 3-way マージを一度も検証しないテストになってしまう。
 */
function seedSyncedDevice(userId = 'user-1') {
  saveSyncMeta({ userId, cursorRev: 0, lastSyncedAt: null });
}

beforeEach(() => localStorage.clear());

describe('runSync — 認証とエラー', () => {
  it('未ログインなら何もせず unauthenticated を返す', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port } = createFakePort({ userId: null });
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('unauthenticated');
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 2 });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('pull が失敗したら localStorage を触らず error を返す', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port } = createFakePort({ failPull: true });
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('error');
    expect(report.error).toContain('network unreachable');
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 2 });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });
});

describe('runSync — push', () => {
  it('ローカルの変更をサーバへ送り、ベースラインを進める', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('ok');
    expect(report.pushed).toBe(1);
    expect(state.cardCounts.get(5)?.count).toBe(2);
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(2);
  });

  it('2 回目の同期では送るものが無い（べき等）', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port } = createFakePort();
    await runSync(port, noConflict);
    const second = await runSync(port, noConflict);
    expect(second.pushed).toBe(0);
    expect(second.adopted).toBe(0);
  });
});

describe('runSync — adopt', () => {
  it('サーバの変更を localStorage へ取り込む', async () => {
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 3);
    const report = await runSync(port, noConflict);
    expect(report.adopted).toBe(1);
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 3 });
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(3);
  });

  it('カーソルを適用した行の rev の最大値まで進める', async () => {
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 3);
    seedCardCount(6, 1);
    await runSync(port, noConflict);
    expect(loadSyncMeta().cursorRev).toBeGreaterThanOrEqual(2);
  });
});

describe('runSync — 競合', () => {
  it('この端末を選ぶとローカルの値が push される', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount, state } = createFakePort();
    seedCardCount(5, 8);
    // oxlint-disable-next-line require-await -- ConflictResolver は Promise を返す契約のため async は必須
    const report = await runSync(port, async () => new Map([['card_counts', 'local']]));
    expect(report.status).toBe('ok');
    expect(state.cardCounts.get(5)?.count).toBe(9);
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 9 });
  });

  it('別の端末を選ぶとサーバの値が取り込まれる', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 8);
    // oxlint-disable-next-line require-await -- ConflictResolver は Promise を返す契約のため async は必須
    const report = await runSync(port, async () => new Map([['card_counts', 'server']]));
    expect(report.status).toBe('ok');
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 8 });
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(8);
  });

  it('解決されなかったデータ種別は一切触らない（次回また聞く）', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount, state } = createFakePort();
    seedCardCount(5, 8);
    const report = await runSync(port, noConflict);
    expect(report.unresolved).toEqual(['card_counts']);
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 9 });
    expect(state.cardCounts.get(5)?.count).toBe(8);
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(2);
  });

  it('競合していないデータ種別は競合の解決を待たずに同期される', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, { '1': 4 });
    const { port, seedCardCount, state } = createFakePort();
    seedCardCount(5, 8);
    await runSync(port, noConflict);
    expect(state.broachCounts.get(1)?.count).toBe(4);
    expect(loadBaselineRowSet<number>('shared_broach_counts').get('1')).toBe(4);
  });

  it('両方が同じ値に変わっていれば競合にせずベースラインだけ進める', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 8 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 8);
    const report = await runSync(port, noConflict);
    expect(report.unresolved).toEqual([]);
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(8);
  });
});

describe('runSync — 部分失敗', () => {
  it('成功した行のベースラインだけを進める（失敗した行は次回再送される）', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2, '6': 3 });
    const { port } = createFakePort({ failPushKeys: new Set(['6']) });
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(report.failed).toBe(1);
    const baseline = loadBaselineRowSet<number>('card_counts');
    expect(baseline.get('5')).toBe(2);
    expect(baseline.has('6')).toBe(false);
  });

  it('失敗した行は次回の同期で再送される', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2, '6': 3 });
    const failing = new Set(['6']);
    const { port, state } = createFakePort({ failPushKeys: failing });
    await runSync(port, noConflict);
    failing.delete('6');
    const second = await runSync(port, noConflict);
    expect(second.pushed).toBe(1);
    expect(state.cardCounts.get(6)?.count).toBe(3);
  });
});

describe('runSync — デッキとラビットノートの push', () => {
  it('ローカルのデッキがサーバへ push される', async () => {
    saveJson(STORAGE_KEYS.SAVED_DECKS, [{
      id: 'd1', name: 'テストデッキ', createdAt: 1000, updatedAt: 2000,
      state: {
        songId: 42, deckIds: [101, null, null, null, null, null],
        bonusTiers: [], trained: [], sharedBroachs: [], skillLevels: [],
      },
    }]);
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('ok');
    expect(report.pushed).toBe(1);
    expect(state.decks.get('d1')?.name).toBe('テストデッキ');
    expect(state.decks.get('d1')?.deleted_at).toBeNull();
    expect(state.decks.get('d1')?.slots[0].card_id).toBe(101);
  });

  it('ローカルで削除したデッキは tombstone として push される（行を消さない）', async () => {
    seedSyncedDevice();
    // 前回同期済み: ベースラインにはデッキがあるが、ローカルからは消えている
    commitBaselineRow('decks', 'd1', {
      name: 'A', song_id: null,
      created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z',
      deleted_at: null,
      slots: Array.from({ length: 6 }, (_, i) => ({
        slot_index: i, card_id: null, trained: false,
        skill_level: null, bonus_tier: null, shared_broach_ids: [],
      })),
    });
    saveJson(STORAGE_KEYS.SAVED_DECKS, []);
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    // 行が消えるのではなく deleted_at が立つこと。行の欠落で削除を表すと
    // 「まだ作っていない」と区別できなくなる
    expect(state.decks.has('d1')).toBe(true);
    expect(state.decks.get('d1')?.deleted_at).not.toBeNull();
  });

  it('ラビットノートがサーバへ push される', async () => {
    saveJson(STORAGE_KEYS.RABBIT_NOTES, { 七瀬陸: { shout: 1, beat: 2, melody: 3 } });
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(state.rabbitNotes.get('七瀬陸')).toMatchObject({ shout: 1, beat: 2, melody: 3 });
  });

  it('ローカルで消した所持数は 0 として push される（行を消さない）', async () => {
    seedSyncedDevice();
    commitBaselineRow('shared_broach_counts', '1', 4);
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, {});
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(state.broachCounts.get(1)?.count).toBe(0);
  });
});

describe('runSync — ベースラインが書けないとき', () => {
  it('同期を止めて baseline-write-failed を返す（勝手なマージに倒さない）', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(key: string, value: string) {
      if (key === STORAGE_KEYS.SYNC_BASELINE) throw new Error('QuotaExceededError');
      return original.call(this, key, value);
    };
    try {
      const { port } = createFakePort();
      const report = await runSync(port, noConflict);
      expect(report.status).toBe('baseline-write-failed');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
