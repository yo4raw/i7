import { STORAGE_KEYS, loadJson, saveJson } from '../storage';
import { clearBaseline } from './baseline';

export type SyncMeta = {
  userId: string | null;
  cursorRev: number;
  lastSyncedAt: number | null;
};

export const EMPTY_SYNC_META: SyncMeta = { userId: null, cursorRev: 0, lastSyncedAt: null };

export function loadSyncMeta(): SyncMeta {
  const raw = loadJson<unknown>(STORAGE_KEYS.SYNC_META, EMPTY_SYNC_META);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_SYNC_META };
  const meta = raw as Partial<SyncMeta>;
  return {
    userId: typeof meta.userId === 'string' ? meta.userId : null,
    cursorRev: Number.isFinite(meta.cursorRev) ? Number(meta.cursorRev) : 0,
    lastSyncedAt: Number.isFinite(meta.lastSyncedAt) ? Number(meta.lastSyncedAt) : null,
  };
}

export function saveSyncMeta(meta: SyncMeta): void {
  saveJson(STORAGE_KEYS.SYNC_META, meta);
}

/**
 * 次のカーソル値。「実際に適用した行の rev の最大値」を採る。
 *
 * sync_cursor.rev を読んで採用すると、プルの途中で別端末の書き込みが入った場合に
 * 未取得の行を飛ばす。最大値方式なら最悪でも次回に再取得するだけで取りこぼさない。
 */
export function nextCursorRev(current: number, appliedRevs: readonly number[]): number {
  return appliedRevs.reduce((max, rev) => (rev > max ? rev : max), current);
}

/**
 * ログイン中のユーザーとメタの userId を突き合わせる。
 * 不一致（別アカウントへの切替、初回）ならベースラインとカーソルを捨てて初回リンク扱いに戻す。
 */
export function reconcileUser(meta: SyncMeta, userId: string): SyncMeta {
  if (meta.userId === userId) return meta;
  clearBaseline();
  const next: SyncMeta = { userId, cursorRev: 0, lastSyncedAt: null };
  saveSyncMeta(next);
  return next;
}

/** バックアップ復元後など、ローカルが外部から書き換わったときに呼ぶ */
export function resetSyncState(): void {
  clearBaseline();
  saveSyncMeta({ ...EMPTY_SYNC_META });
}
