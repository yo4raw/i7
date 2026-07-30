/**
 * クライアントサイドデータリフレッシュユーティリティ
 *
 * ビルド時埋め込みデータで即座に表示した後、バックグラウンドで
 * Google Sheets GViz API から最新データを取得して差し替える。
 * sessionStorage でキャッシュし、同一セッション内の再リクエストを防ぐ。
 */

type DataKey = 'cards' | 'songs' | 'broachs';

const CACHE_PREFIX = 'i7_fresh_';
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5分

interface CacheEntry<T> {
  data: T[];
  ts: number;
}

// --- インジケーター ---

let indicatorEl: HTMLElement | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | undefined;
let pendingCount = 0;

/**
 * トーストの位置・形状。変化するのは opacity と配色だけなので
 * transition は opacity に限定する (transition-all はレイアウト系プロパティまで
 * 拾ってしまうため使わない)。bottom-safe で下部セーフエリアを避ける。
 */
const INDICATOR_BASE =
  'fixed bottom-safe right-4 z-(--z-overlay) px-4 py-2 rounded-control shadow-overlay text-sm transition-opacity duration-200 pointer-events-none';

function getIndicator(): HTMLElement {
  if (indicatorEl) return indicatorEl;
  const el = document.createElement('div');
  el.id = 'data-freshness-indicator';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.className = `${INDICATOR_BASE} opacity-0`;
  document.body.append(el);
  indicatorEl = el;
  return el;
}

function showIndicator(message: string, type: 'loading' | 'success') {
  const el = getIndicator();
  clearTimeout(fadeTimer);

  if (type === 'loading') {
    el.className = `${INDICATOR_BASE} opacity-100 bg-white text-gray-600 border border-gray-200`;
    el.textContent = message;
  } else {
    el.className = `${INDICATOR_BASE} opacity-100 bg-green-50 text-green-700 border border-green-200`;
    el.textContent = message;
    fadeTimer = setTimeout(() => {
      el.classList.replace('opacity-100', 'opacity-0');
    }, 3000);
  }
}

// --- キャッシュ ---

function readCache<T>(key: DataKey, maxAgeMs: number): T[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: DataKey, data: T[]) {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // sessionStorage が満杯でも動作は継続
  }
}

// --- メイン ---

export async function refreshData<T>(
  key: DataKey,
  fetchFn: () => Promise<T[]>,
  onUpdate: (freshData: T[]) => void,
  options?: { maxAgeMs?: number },
): Promise<void> {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  // キャッシュチェック
  const cached = readCache<T>(key, maxAgeMs);
  if (cached) {
    onUpdate(cached);
    return;
  }

  // フェッチ実行
  pendingCount++;
  if (pendingCount === 1) {
    showIndicator('データ更新中...', 'loading');
  }

  try {
    const freshData = await fetchFn();
    writeCache(key, freshData);
    onUpdate(freshData);
  } catch (err) {
    console.warn(`[clientRefresh] ${key} の更新に失敗:`, err);
  } finally {
    pendingCount--;
    if (pendingCount === 0) {
      showIndicator('最新データに更新済み', 'success');
    }
  }
}
