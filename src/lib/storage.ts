/**
 * localStorage JSON ヘルパ
 *
 * JSON.parse / JSON.stringify を try/catch でラップし、
 * パース失敗・quota 超過・プライベートモード等で例外が飛ぶのを防ぐ。
 */

export const STORAGE_KEYS = {
  CARD_COUNTS: 'i7_card_counts',
  RABBIT_NOTES: 'i7_rabbit_notes',
  SELECTED_SONGS: 'i7_selected_songs',
  SAVED_DECKS: 'i7_saved_decks',
  SCORE_CALC_STATE: 'i7_score_calc_state',
  CARD_LIST_VIEW_MODE: 'i7_card_list_view_mode',
} as const;

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota 超過 / プライベートモード等は無視
  }
}
