import { STORAGE_KEYS, loadJson, saveJson } from '../storage';

type CountMap = Record<string, number>;

let counts = $state<CountMap>(typeof window !== 'undefined' ? loadJson<CountMap>(STORAGE_KEYS.CARD_COUNTS, {}) : {});

function persist() {
  saveJson(STORAGE_KEYS.CARD_COUNTS, counts);
}

export function getCount(cardId: number | string): number {
  return counts[String(cardId)] || 0;
}

export function setCount(cardId: number | string, value: number) {
  const v = Math.max(0, Math.floor(value || 0));
  const key = String(cardId);
  if (v === 0) {
    delete counts[key];
  } else {
    counts[key] = v;
  }
  persist();
}

export function deltaCount(cardId: number | string, delta: number) {
  setCount(cardId, getCount(cardId) + delta);
}

export function allCounts(): CountMap {
  return counts;
}

export function totalOwned(): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export function ownedIdSet(): Set<string> {
  return new Set(Object.keys(counts).filter((k) => counts[k] > 0));
}

export function reloadFromStorage() {
  const fresh = loadJson<CountMap>(STORAGE_KEYS.CARD_COUNTS, {});
  for (const key of Object.keys(counts)) {
    if (!(key in fresh)) delete counts[key];
  }
  for (const [k, v] of Object.entries(fresh)) {
    counts[k] = v;
  }
}
