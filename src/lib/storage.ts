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
  SHARED_BROACH_COUNTS: 'i7_shared_broach_counts',
  CARD_LIST_VIEW_MODE: 'i7_card_list_view_mode',
  COMPARE_EVENT_ID: 'i7_compare_event_id',
  MAX_FINDER_EVENT_ID: 'i7_max_finder_event_id',
  POINT_CALC_STATE: 'i7_point_calc_state',
  SYNC_META: 'i7_sync_meta',
  SYNC_BASELINE: 'i7_sync_baseline',
} as const;

/**
 * バックアップ（FooterTools の JSON エクスポート）の対象から外すキー。
 *
 * 同期メタとベースラインは「この端末がどこまでサーバと一致しているか」を表す端末固有の
 * 状態であり、別端末のものを取り込むと同期エンジンが「同期済み」と誤認して未同期の
 * 変更を取りこぼす。CLAUDE.md の「新しいキーは必ず STORAGE_KEYS に追記する
 * （バックアップ対象に含めるため）」に対する唯一の例外（ADR 0064 決定 10）。
 */
export const BACKUP_EXCLUDED_KEYS: ReadonlySet<string> = new Set<string>([
  STORAGE_KEYS.SYNC_META,
  STORAGE_KEYS.SYNC_BASELINE,
]);

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type SaveListener = (key: string) => void;

const saveListeners = new Set<SaveListener>();

/**
 * saveJson による保存を購読する。戻り値を呼ぶと購読を解除する。
 *
 * 同期層がここを一方的に購読することで、既存の 13 箇所の saveJson 呼び出しを
 * 一切変更せずに全変更を捕捉できる。storage.ts は同期層を知らない（片方向依存）。
 */
export function onSave(listener: SaveListener): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota 超過 / プライベートモード等は無視。書けていないので通知もしない
    return;
  }
  for (const listener of saveListeners) {
    try {
      listener(key);
    } catch {
      // 購読側の例外で保存処理を壊さない
    }
  }
}
