import { STORAGE_KEYS } from '../storage';
import { createCountStore } from './countStore.svelte';

export const {
  get: getCount,
  set: setCount,
  delta: deltaCount,
  all: allCounts,
  total: totalOwned,
  reload: reloadFromStorage,
} = createCountStore(STORAGE_KEYS.CARD_COUNTS);
