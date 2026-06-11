import { STORAGE_KEYS, loadJson, saveJson } from '../storage';

type CountMap = Record<string, number>;

/** 自チーム 5 枠 × 2 個が使用上限のため、登録もこの個数までで十分 */
export const MAX_BROACH_COUNT = 10;

let counts = $state<CountMap>(typeof window !== 'undefined' ? loadJson<CountMap>(STORAGE_KEYS.SHARED_BROACH_COUNTS, {}) : {});

function persist() {
  saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, counts);
}

export function getBroachCount(broachId: number | string): number {
  return counts[String(broachId)] || 0;
}

export function setBroachCount(broachId: number | string, value: number) {
  const v = Math.min(MAX_BROACH_COUNT, Math.max(0, Math.floor(value || 0)));
  const key = String(broachId);
  if (v === 0) {
    delete counts[key];
  } else {
    counts[key] = v;
  }
  persist();
}

export function deltaBroachCount(broachId: number | string, delta: number) {
  setBroachCount(broachId, getBroachCount(broachId) + delta);
}

export function allBroachCounts(): CountMap {
  return counts;
}

export function totalOwnedBroachs(): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export function reloadBroachCountsFromStorage() {
  const fresh = loadJson<CountMap>(STORAGE_KEYS.SHARED_BROACH_COUNTS, {});
  for (const key of Object.keys(counts)) {
    if (!(key in fresh)) delete counts[key];
  }
  for (const [k, v] of Object.entries(fresh)) {
    counts[k] = v;
  }
}
