// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSyncMeta, nextCursorRev, reconcileUser, resetSyncState, saveSyncMeta,
} from '../../../src/lib/sync/syncMeta';
import { commitBaselineRow, loadBaselineRowSet } from '../../../src/lib/sync/baseline';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => localStorage.clear());

describe('loadSyncMeta / saveSyncMeta', () => {
  it('未保存なら初期値', () => {
    expect(loadSyncMeta()).toEqual({ userId: null, cursorRev: 0, lastSyncedAt: null });
  });

  it('保存した値を読み戻せる', () => {
    saveSyncMeta({ userId: 'u1', cursorRev: 12, lastSyncedAt: 1000 });
    expect(loadSyncMeta()).toEqual({ userId: 'u1', cursorRev: 12, lastSyncedAt: 1000 });
  });

  it('不正な形なら初期値に落とす', () => {
    localStorage.setItem('i7_sync_meta', '"文字列"');
    expect(loadSyncMeta()).toEqual({ userId: null, cursorRev: 0, lastSyncedAt: null });
  });

  it('保存値が配列なら初期値に落とす', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_META, JSON.stringify([1, 2, 3]));
    expect(loadSyncMeta()).toEqual({ userId: null, cursorRev: 0, lastSyncedAt: null });
  });
});

describe('nextCursorRev', () => {
  it('適用した行の rev の最大値を返す', () => {
    expect(nextCursorRev(5, [7, 9, 8])).toBe(9);
  });

  it('現在値より小さい rev しか無ければ現在値を保つ (後戻りしない)', () => {
    expect(nextCursorRev(10, [3, 4])).toBe(10);
  });

  it('適用行が無ければ現在値のまま', () => {
    expect(nextCursorRev(10, [])).toBe(10);
  });
});

describe('reconcileUser', () => {
  it('同じユーザーならメタをそのまま返す', () => {
    const meta = { userId: 'u1', cursorRev: 5, lastSyncedAt: 1 };
    expect(reconcileUser(meta, 'u1')).toEqual(meta);
  });

  it('別ユーザーならカーソルを 0 に戻しベースラインを捨てる (初回リンク扱い)', () => {
    commitBaselineRow('card_counts', '5', 2);
    saveSyncMeta({ userId: 'u1', cursorRev: 5, lastSyncedAt: 1 });
    const next = reconcileUser(loadSyncMeta(), 'u2');
    expect(next).toEqual({ userId: 'u2', cursorRev: 0, lastSyncedAt: null });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('初回 (userId が null) もベースラインを捨てて初回リンク扱いにする', () => {
    commitBaselineRow('card_counts', '5', 2);
    const next = reconcileUser(loadSyncMeta(), 'u1');
    expect(next).not.toBeNull();
    expect(next?.cursorRev).toBe(0);
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('ベースラインを捨てられなければ null を返し userId を記録しない', () => {
    saveSyncMeta({ userId: 'u1', cursorRev: 5, lastSyncedAt: 1 });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(key: string, value: string) {
      if (key === STORAGE_KEYS.SYNC_BASELINE) throw new Error('QuotaExceededError');
      return original.call(this, key, value);
    };
    try {
      expect(reconcileUser(loadSyncMeta(), 'u2')).toBeNull();
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(loadSyncMeta().userId).toBe('u1');
  });
});

describe('resetSyncState', () => {
  it('メタとベースラインの両方を消す', () => {
    saveSyncMeta({ userId: 'u1', cursorRev: 5, lastSyncedAt: 1 });
    commitBaselineRow('card_counts', '5', 2);
    resetSyncState();
    expect(loadSyncMeta()).toEqual({ userId: null, cursorRev: 0, lastSyncedAt: null });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });
});
