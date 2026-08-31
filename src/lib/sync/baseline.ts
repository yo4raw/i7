import { STORAGE_KEYS, loadJson, saveJson } from '../storage';
import type { RowSet } from './rows';

export type BaselineKind = 'card_counts' | 'shared_broach_counts' | 'rabbit_notes' | 'decks';

const KINDS: readonly BaselineKind[] = ['card_counts', 'shared_broach_counts', 'rabbit_notes', 'decks'];

type BaselineStore = Partial<Record<BaselineKind, Record<string, unknown>>>;

function load(): BaselineStore {
  const raw = loadJson<unknown>(STORAGE_KEYS.SYNC_BASELINE, {});
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as BaselineStore)
    : {};
}

/** 「最後にサーバと一致していると確認できた行集合」を読む */
export function loadBaselineRowSet<V>(kind: BaselineKind): RowSet<V> {
  const bucket = load()[kind];
  if (!bucket || typeof bucket !== 'object') return new Map();
  return new Map(Object.entries(bucket) as [string, V][]);
}

/**
 * ベースラインを **1 行だけ** 更新する。null を渡すとその行を削除する。
 * 保存に失敗したら false を返す。
 *
 * 行単位の API しか公開しないのは、一括更新を構造的に不可能にするため。
 * 部分失敗時に「サーバへの反映が確認できた行だけ」を進める必要があり、
 * 一括更新すると失敗した行まで同期済みとして扱ってしまう（ADR 0064 決定 6）。
 */
export function commitBaselineRow(kind: BaselineKind, key: string, value: unknown): boolean {
  const store = load();
  const bucket = { ...store[kind] };
  if (value === null) {
    delete bucket[key];
  } else {
    bucket[key] = value;
  }
  const next: BaselineStore = { ...store, [kind]: bucket };
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_BASELINE, JSON.stringify(next));
    return true;
  } catch {
    // quota 超過。呼び出し側は同期を無効化してエラー表示すること（勝手なマージに倒さない）
    return false;
  }
}

export function clearBaseline(): void {
  saveJson(STORAGE_KEYS.SYNC_BASELINE, Object.fromEntries(KINDS.map((kind) => [kind, {}])));
}
