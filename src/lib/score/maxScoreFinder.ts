/**
 * max-score-finder (編成組合計算) の総当たり探索ロジック。
 *
 * UI (SecretsTool.svelte) と Web Worker (maxScoreFinder.worker.ts) の両方から
 * import される純粋モジュール。Svelte やブラウザ API に依存しない。
 */
import type { Card } from '../data/fetchCardsJson';
import { SKILL_TYPE } from '../data/fetchCardsJson';
import type { Song } from '../data/fetchSongsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { ScoreOptions } from './types';
import type { EventBonusTier } from '../data/eventBonusTiers';
import type { RabbitNoteMap } from '../data/rabbitNote';
import { computeGroupSizes } from './shrinkExclusion';
import { flattenNotes } from './noteFlattener';

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

/** flattenNotes のシード (現行 SecretsTool と同値。結果再現性のため固定) */
export const FLATTEN_SEED = 42;

export type EvalMode = 'expected' | 'max';

export interface SearchInput {
  evalMode: EvalMode;
  /** センター+メンバー4枚を所持枚数の範囲内に制限する */
  ownedOnly: boolean;
  /** デッキ6枠中の判定縮小持ちをちょうど SHRINK_PAIR_TARGET 枚に絞る */
  shrinkPairOnly: boolean;
  scoreOptions: ScoreOptions;
  /** 評価対象の特効 UR 候補 */
  candidates: Card[];
  /** cardId(文字列) → 所持枚数 (ownedOnly 時に使用) */
  ownedCounts: Record<string, number>;
  song: Song;
  broachs: FixedBroach[];
  /** cardId(文字列) → 特効 tier */
  tierByCardId: Record<string, EventBonusTier>;
  rabbitNotes: RabbitNoteMap;
}

/** SearchInput から導出した探索用の前計算データ (Worker 内で 1 回だけ作る) */
export interface SearchContext {
  input: SearchInput;
  candidates: Card[];
  /** 所持候補 (ownedCounts ≥ 1) */
  owned: Card[];
  shrink: Card[];
  nonShrink: Card[];
  ownedLimit: Map<number, number>;
  groupSizes: Record<string, number>;
  notesCount: number;
}

export function createSearchContext(input: SearchInput): SearchContext {
  const owned = input.candidates.filter((c) => (input.ownedCounts[String(c.ID)] ?? 0) >= 1);
  const ownedLimit = new Map<number, number>();
  for (const c of owned) ownedLimit.set(c.ID!, input.ownedCounts[String(c.ID)] ?? 0);
  return {
    input,
    candidates: input.candidates,
    owned,
    shrink: input.candidates.filter((c) => isShrinkCard(c)),
    nonShrink: input.candidates.filter((c) => !isShrinkCard(c)),
    ownedLimit,
    groupSizes: computeGroupSizes(input.song),
    notesCount: input.song.notes_count || flattenNotes(input.song, FLATTEN_SEED).length,
  };
}

/**
 * 評価対象の組合せ総数。
 * ownedOnly 時: 各 owned カードを center に置いた時の「残り所持枚数で 4-多重集合」の総和 × フレンド候補数。
 * ownedOnly=false 時: (center, friend) は UR/UR で対称、(member1..4) は多重集合
 *   → multichoose(N,2) × multichoose(N,4)。
 * shrinkPairOnly 時: 縮小持ち / それ以外に分割し、6枠合計でちょうど SHRINK_PAIR_TARGET 枚に
 *   なる組合せのみ数える。
 */
export function countCombos(ctx: SearchContext): number {
  const { input } = ctx;
  if (input.ownedOnly) {
    if (ctx.owned.length < 1 || ctx.candidates.length < 1) return 0;
    if (!input.shrinkPairOnly) {
      const limits = ctx.owned.map((c) => ctx.ownedLimit.get(c.ID!) ?? 0);
      let centerSum = 0;
      for (let ci = 0; ci < ctx.owned.length; ci++) {
        const adjusted = limits.slice();
        adjusted[ci] -= 1;
        centerSum += countMultisetsWithLimits(adjusted, 4);
      }
      return centerSum * ctx.candidates.length;
    }
    // 縮小2枚条件 (所持衣装検索): スロット0-4の縮小枚数がちょうど2枚なら非縮小フレンド、
    // それ以外 (0枚 / 1枚 / 3枚以上) は縮小フレンドのみを組合せる（除外はしない）
    let total = 0;
    for (let ci = 0; ci < ctx.owned.length; ci++) {
      const center = ctx.owned[ci];
      const cs = isShrinkCard(center) ? 1 : 0;
      const shrinkLimits: number[] = [];
      const nonShrinkLimits: number[] = [];
      for (const c of ctx.owned) {
        let lim = ctx.ownedLimit.get(c.ID!) ?? 0;
        if (c === center) lim -= 1;
        (isShrinkCard(c) ? shrinkLimits : nonShrinkLimits).push(lim);
      }
      for (let j = 0; j <= 4; j++) {
        const own5 = cs + j; // スロット0-4 の縮小枚数
        const friendPool = own5 === SHRINK_PAIR_TARGET ? ctx.nonShrink.length : ctx.shrink.length;
        if (friendPool < 1) continue;
        total += countMultisetsWithLimits(shrinkLimits, j)
          * countMultisetsWithLimits(nonShrinkLimits, 4 - j)
          * friendPool;
      }
    }
    return total;
  }
  if (ctx.candidates.length < 1) return 0;
  if (!input.shrinkPairOnly) {
    return multichoose(ctx.candidates.length, 2) * multichoose(ctx.candidates.length, 4);
  }
  // 縮小2枚条件: (center, friend) ペア内の縮小枚数 s2 ごとにメンバーの縮小枚数 k が決まる
  const S = ctx.shrink.length;
  const T = ctx.nonShrink.length;
  let total = 0;
  for (let s2 = 0; s2 <= SHRINK_PAIR_TARGET; s2++) {
    const k = SHRINK_PAIR_TARGET - s2;
    if (k < 0 || k > 4) continue;
    const pairs = s2 === 0 ? multichoose(T, 2) : s2 === 1 ? S * T : multichoose(S, 2);
    total += pairs * multichoose(S, k) * multichoose(T, 4 - k);
  }
  return total;
}
