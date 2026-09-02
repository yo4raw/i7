import { STORAGE_KEYS, loadJson } from '../storage';
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
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return new Map();
  return new Map(Object.entries(bucket) as [string, V][]);
}

/**
 * ベースラインを **1 行だけ** 更新する。null を渡すとその行を削除する。
 * 保存に失敗したら false を返す。
 *
 * 行単位の API しか公開しないのは、一括更新を構造的に不可能にするため。
 * 部分失敗時に「サーバへの反映が確認できた行だけ」を進める必要があり、
 * 一括更新すると失敗した行まで同期済みとして扱ってしまう（ADR 0064 決定 6）。
 *
 * タブ間の競合は受容する。2 つのタブが同時に read-modify-write すると片方の行の
 * commit が失われうるが、失われた行は次回の diff で未確認として再検出され、
 * 冪等な re-push が 1 回余分に走るだけで済む。localStorage にロック機構は無く、
 * 排他のために BroadcastChannel 等を導入するのは付加機能の範囲を超える。
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

/**
 * 全 kind を空にする。保存に失敗したら false を返す。
 *
 * `commitBaselineRow` と同じ「setItem 直呼び + 戻り値で成否を伝える」パターンを使う。
 * `saveJson` に戻すと失敗が呼び出し側から見えなくなり、`reconcileUser` が
 * 「ベースラインを捨てられなかったのに新しい userId を記録する」事故を起こしうる。
 */
export function clearBaseline(): boolean {
  try {
    localStorage.setItem(
      STORAGE_KEYS.SYNC_BASELINE,
      JSON.stringify(Object.fromEntries(KINDS.map((kind) => [kind, {}]))),
    );
    return true;
  } catch {
    return false;
  }
}
