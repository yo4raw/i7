import { loadJson, saveJson } from '../storage';

type CountMap = Record<string, number>;

export interface CountStore {
  /** 未登録なら 0 */
  get(id: number | string): number;
  /** 0 以下ならキーごと削除。max 指定時は上限で丸める */
  set(id: number | string, value: number): void;
  delta(id: number | string, amount: number): void;
  all(): CountMap;
  total(): number;
  /** localStorage の最新内容に同期し、消えたキーは落とす */
  reload(): void;
}

/**
 * localStorage に載る「ID → 所持数」ストアを作る。
 * $state をクロージャに閉じ込め、関数経由で読み書きする形をとる
 * （オブジェクトごと返すとリアクティビティが切れるため）。
 */
export function createCountStore(storageKey: string, max = Number.POSITIVE_INFINITY): CountStore {
  const counts = $state<CountMap>(
    typeof window === 'undefined' ? {} : loadJson<CountMap>(storageKey, {}),
  );

  function persist() {
    saveJson(storageKey, counts);
  }

  function get(id: number | string): number {
    return counts[String(id)] || 0;
  }

  function set(id: number | string, value: number): void {
    const v = Math.min(max, Math.max(0, Math.floor(value || 0)));
    const key = String(id);
    if (v === 0) {
      delete counts[key];
    } else {
      counts[key] = v;
    }
    persist();
  }

  return {
    get,
    set,
    delta: (id, amount) => { set(id, get(id) + amount); },
    all: () => counts,
    total: () => Object.values(counts).reduce((a, b) => a + b, 0),
    reload: () => {
      const fresh = loadJson<CountMap>(storageKey, {});
      for (const key of Object.keys(counts)) {
        if (!(key in fresh)) delete counts[key];
      }
      for (const [k, v] of Object.entries(fresh)) {
        counts[k] = v;
      }
    },
  };
}
