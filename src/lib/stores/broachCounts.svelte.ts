import { STORAGE_KEYS } from '../storage';
import { createCountStore } from './countStore.svelte';

/** 自チーム 5 枠 × 2 個が使用上限のため、登録もこの個数までで十分 */
export const MAX_BROACH_COUNT = 10;

export const {
  get: getBroachCount,
  set: setBroachCount,
  delta: deltaBroachCount,
  all: allBroachCounts,
  total: totalOwnedBroachs,
  reload: reloadBroachCountsFromStorage,
} = createCountStore(STORAGE_KEYS.SHARED_BROACH_COUNTS, MAX_BROACH_COUNT);
