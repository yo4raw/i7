/**
 * max-score-finder (編成組合計算) の総当たり探索ロジック。
 *
 * UI (SecretsTool.svelte) と Web Worker (maxScoreFinder.worker.ts) の両方から
 * import される純粋モジュール。Svelte やブラウザ API に依存しない。
 */
import type { Card } from '../data/fetchCardsJson';
import { SKILL_TYPE } from '../data/fetchCardsJson';

/** デッキ6枠中の判定縮小スキル持ち枚数を固定する条件 (shrinkPairOnly 有効時) */
export const SHRINK_PAIR_TARGET = 2;

/** parseSkill (engine.ts) と同じ判定で「判定縮小スキル持ち」かどうかを返す */
export function isShrinkCard(c: Card | null): boolean {
  const t = c?.ap_skill_type;
  return !!t && (t === SKILL_TYPE.SHRINK || t.startsWith(SKILL_TYPE.SHRINK_PREFIX));
}

export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

export function multichoose(n: number, k: number): number {
  return binomial(n + k - 1, k);
}

// 各カード i の出現上限を limits[i] とした k-多重集合の総数
// = ∏(1 + x + ... + x^{limits[i]}) における x^k の係数
export function countMultisetsWithLimits(limits: number[], k: number): number {
  let poly: number[] = [1];
  for (const lim of limits) {
    const newLen = Math.min(poly.length + lim, k + 1);
    const next = new Array<number>(newLen).fill(0);
    for (let d = 0; d < poly.length; d++) {
      if (poly[d] === 0) continue;
      const jMax = Math.min(lim, k - d);
      for (let j = 0; j <= jMax; j++) next[d + j] += poly[d];
    }
    poly = next;
  }
  return poly[k] ?? 0;
}

/**
 * 0..N-1 から重複ありで k 個選ぶ非減少インデックス列を列挙する。
 * yield される配列は次の iteration で破壊的に書き換えられるため、
 * 保持する場合は呼び出し側でコピーすること。
 */
export function* multisetIndices(N: number, k: number): Generator<number[]> {
  if (N <= 0 || k <= 0) return;
  const idx = new Array(k).fill(0);
  while (true) {
    yield idx;
    let i = k - 1;
    while (i >= 0 && idx[i] === N - 1) i--;
    if (i < 0) break;
    const v = idx[i] + 1;
    for (let j = i; j < k; j++) idx[j] = v;
  }
}

/** multisetIndices の k=0 対応版: k=0 のとき空組合せを 1 回だけ yield する */
export function* multisetIndicesOrEmpty(N: number, k: number): Generator<number[]> {
  if (k === 0) { yield []; return; }
  yield* multisetIndices(N, k);
}
