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
import {
  computeGroupSizes,
  computeShrinkExclusion,
  computeTeam,
  calcExpectedScore,
  calcMaxScore,
  flattenNotes,
} from './engine';

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

/**
 * チャンク = Worker に渡す作業単位。
 * - pair: 通常モード。(center, friend) 多重集合ペア 1 つ (centerIdx ≤ friendIdx)
 * - shrinkPair: 縮小2枚条件。s2 = ペア内の縮小枚数。s2=0 は非縮小内ペア (aIdx ≤ bIdx)、
 *   s2=1 は (縮小 aIdx, 非縮小 bIdx) の直積、s2=2 は縮小内ペア (aIdx ≤ bIdx)
 * - center: 所持衣装検索。owned[centerIdx] をセンターに固定
 */
export type ChunkDescriptor =
  | { kind: 'pair'; centerIdx: number; friendIdx: number }
  | { kind: 'shrinkPair'; s2: 0 | 1 | 2; aIdx: number; bIdx: number }
  | { kind: 'center'; centerIdx: number };

export function* generateChunks(ctx: SearchContext): Generator<ChunkDescriptor> {
  const { input } = ctx;
  if (input.ownedOnly) {
    for (let ci = 0; ci < ctx.owned.length; ci++) yield { kind: 'center', centerIdx: ci };
    return;
  }
  if (input.shrinkPairOnly) {
    const S = ctx.shrink.length;
    const T = ctx.nonShrink.length;
    for (let a = 0; a < T; a++) for (let b = a; b < T; b++) yield { kind: 'shrinkPair', s2: 0, aIdx: a, bIdx: b };
    for (let a = 0; a < S; a++) for (let b = 0; b < T; b++) yield { kind: 'shrinkPair', s2: 1, aIdx: a, bIdx: b };
    for (let a = 0; a < S; a++) for (let b = a; b < S; b++) yield { kind: 'shrinkPair', s2: 2, aIdx: a, bIdx: b };
    return;
  }
  const N = ctx.candidates.length;
  for (let c = 0; c < N; c++) for (let f = c; f < N; f++) yield { kind: 'pair', centerIdx: c, friendIdx: f };
}

/**
 * チャンク内の全デッキを列挙する。
 * yield される配列は次の iteration で破壊的に書き換えられるため、
 * 保持する場合は呼び出し側でコピーすること。
 * deck の並びは [center, member1..4, friend]。
 */
export function* enumerateChunkDecks(ctx: SearchContext, chunk: ChunkDescriptor): Generator<Card[]> {
  const deck: Card[] = new Array(6);

  if (chunk.kind === 'pair') {
    // (center, friend) は UR/UR でセンタースキルレートが等しく team 値が入れ替え対称
    deck[0] = ctx.candidates[chunk.centerIdx];
    deck[5] = ctx.candidates[chunk.friendIdx];
    for (const m of multisetIndices(ctx.candidates.length, 4)) {
      deck[1] = ctx.candidates[m[0]];
      deck[2] = ctx.candidates[m[1]];
      deck[3] = ctx.candidates[m[2]];
      deck[4] = ctx.candidates[m[3]];
      yield deck;
    }
    return;
  }

  if (chunk.kind === 'shrinkPair') {
    const S = ctx.shrink;
    const T = ctx.nonShrink;
    if (chunk.s2 === 0) {
      deck[0] = T[chunk.aIdx];
      deck[5] = T[chunk.bIdx];
    } else if (chunk.s2 === 1) {
      deck[0] = S[chunk.aIdx];
      deck[5] = T[chunk.bIdx];
    } else {
      deck[0] = S[chunk.aIdx];
      deck[5] = S[chunk.bIdx];
    }
    const k = SHRINK_PAIR_TARGET - chunk.s2; // メンバー4枠中の縮小枚数
    if (k < 0 || k > 4) return;
    for (const sm of multisetIndicesOrEmpty(S.length, k)) {
      for (const nm of multisetIndicesOrEmpty(T.length, 4 - k)) {
        for (let i = 0; i < k; i++) deck[1 + i] = S[sm[i]];
        for (let i = 0; i < 4 - k; i++) deck[1 + k + i] = T[nm[i]];
        yield deck;
      }
    }
    return;
  }

  // kind === 'center': 所持衣装検索
  // center + member1..4 を所持枚数の範囲内で組合せ、フレンドは全候補
  // ((center, friend) 対称性は所持プールが非対称なため利用しない)
  const owned = ctx.owned;
  deck[0] = owned[chunk.centerIdx];
  for (const m of multisetIndices(owned.length, 4)) {
    deck[1] = owned[m[0]];
    deck[2] = owned[m[1]];
    deck[3] = owned[m[2]];
    deck[4] = owned[m[3]];

    // 5 スロット内の所持枚数違反を skip
    const usage = new Map<number, number>();
    for (let i = 0; i < 5; i++) {
      const id = deck[i].ID!;
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    let valid = true;
    for (const [id, n] of usage) {
      if (n > (ctx.ownedLimit.get(id) ?? 0)) { valid = false; break; }
    }
    if (!valid) continue;

    // 縮小2枚条件: スロット0-4の縮小がちょうど2枚なら非縮小フレンド、
    // それ以外 (0枚 / 1枚 / 3枚以上) は縮小フレンドのみ（組合せ自体は除外しない）
    let friendPool = ctx.candidates;
    if (ctx.input.shrinkPairOnly) {
      let shrinkCount5 = 0;
      for (let i = 0; i < 5; i++) {
        if (isShrinkCard(deck[i])) shrinkCount5++;
      }
      friendPool = shrinkCount5 === SHRINK_PAIR_TARGET ? ctx.nonShrink : ctx.shrink;
    }

    for (const f of friendPool) {
      deck[5] = f;
      yield deck;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// デッキ評価・チャンク実行・Top-K マージ・フレンド差し替え
// ─────────────────────────────────────────────────────────────────────────────

export const TOP_K = 10;
/** この評価数ごとに onTick を呼ぶ (進捗報告・中断確認・イベントループへの yield) */
export const YIELD_EVERY = 3000;

export interface DeckRecord {
  /** [center, member1..4, friend] の cardID */
  cardIds: number[];
  score: number;
  liveEndScore?: number;
  baseScore?: number;
  scoreUpExpected?: number;
  shrinkExpected?: number;
  finalScore?: number;
}

export interface FriendCandidate {
  cardId: number;
  score: number;
}

export interface ChunkCallbacks {
  /**
   * yieldEvery 評価ごとと、チャンク完了時の端数で呼ばれる。
   * true を返すとチャンクを中断する (完了時の端数呼び出しの返り値は無視される)。
   */
  onTick?: (evaluatedDelta: number, localBest: DeckRecord | null) => boolean | Promise<boolean>;
}

export interface ChunkResult {
  topK: DeckRecord[];
  evaluated: number;
  aborted: boolean;
}

// 探索条件は全カード スキルLv5・特訓済み・共有ブローチなしで固定 (現行 SecretsTool と同値)
const SEARCH_SKILL_LEVELS: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
const SEARCH_TRAINED: boolean[] = [true, true, true, true, true, true];
const SEARCH_EMPTY_SHARED: number[][] = [[], [], [], [], [], []];

export function evaluateDeck(ctx: SearchContext, deck: (Card | null)[]): DeckRecord {
  const { input } = ctx;
  const tiers: EventBonusTier[] = deck.map((c) =>
    c && c.ID != null ? input.tierByCardId[String(c.ID)] ?? 'none' : 'none'
  );
  const team = computeTeam(
    deck, input.broachs, input.song, tiers, SEARCH_TRAINED, undefined,
    SEARCH_EMPTY_SHARED, SEARCH_SKILL_LEVELS, input.rabbitNotes
  );
  const exclusion = computeShrinkExclusion(team, ctx.groupSizes);
  const notes = flattenNotes(input.song, FLATTEN_SEED, exclusion);
  const rec: DeckRecord = {
    cardIds: deck.map((c) => c!.ID!),
    score: 0,
  };
  if (input.evalMode === 'expected') {
    const e = calcExpectedScore(team, notes, ctx.notesCount, input.scoreOptions);
    rec.score = e.finalScore;
    rec.baseScore = e.baseScore;
    rec.scoreUpExpected = e.scoreUpExpected;
    rec.shrinkExpected = e.shrinkExpected;
    rec.liveEndScore = e.liveEndScore;
    rec.finalScore = e.finalScore;
  } else {
    const s = calcMaxScore(team, notes, input.scoreOptions);
    rec.score = s;
    rec.finalScore = s;
  }
  return rec;
}

function pushTop(top: DeckRecord[], rec: DeckRecord, k: number): void {
  if (top.length < k) {
    top.push(rec);
    top.sort((a, b) => b.score - a.score);
  } else if (rec.score > top[k - 1].score) {
    top[k - 1] = rec;
    top.sort((a, b) => b.score - a.score);
  }
}

/** チャンク内の全デッキを評価し、ローカル Top-K と評価件数を返す */
export async function evaluateChunk(
  ctx: SearchContext,
  chunk: ChunkDescriptor,
  callbacks?: ChunkCallbacks,
  yieldEvery: number = YIELD_EVERY,
): Promise<ChunkResult> {
  const top: DeckRecord[] = [];
  let evaluated = 0;
  let sinceTick = 0;
  let aborted = false;
  for (const deck of enumerateChunkDecks(ctx, chunk)) {
    pushTop(top, evaluateDeck(ctx, deck), TOP_K);
    evaluated++;
    sinceTick++;
    if (sinceTick >= yieldEvery && callbacks?.onTick) {
      const stop = await callbacks.onTick(sinceTick, top[0] ?? null);
      sinceTick = 0;
      if (stop) {
        aborted = true;
        break;
      }
    }
  }
  // 完了時の端数を報告 (中断指示は無視: チャンクは既に終わっている)
  if (sinceTick > 0 && callbacks?.onTick) {
    await callbacks.onTick(sinceTick, top[0] ?? null);
  }
  return { topK: top, evaluated, aborted };
}

/** 各 Worker のローカル Top-K をスコア降順にマージして上位 k 件を返す */
export function mergeTopK(lists: DeckRecord[][], k: number = TOP_K): DeckRecord[] {
  return lists.flat().sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * 最適編成の center + member1..4 を固定し、フレンドだけ差し替えた Top 5 を返す。
 * shrinkPairOnly 時はスロット0-4 の縮小枚数に応じてプールを絞る (探索時と同じ規則)。
 */
export function evaluateFriendSwap(ctx: SearchContext, bestCardIds: number[]): FriendCandidate[] {
  const byId = new Map(ctx.candidates.map((c) => [c.ID!, c]));
  const fixed: (Card | null)[] = bestCardIds.map((id) => byId.get(id) ?? null);
  let pool = ctx.candidates;
  if (ctx.input.shrinkPairOnly) {
    let fixedShrink = 0;
    for (let i = 0; i < 5; i++) {
      if (isShrinkCard(fixed[i])) fixedShrink++;
    }
    pool = fixedShrink === SHRINK_PAIR_TARGET ? ctx.nonShrink : ctx.shrink;
  }
  const scores: FriendCandidate[] = [];
  for (const cand of pool) {
    fixed[5] = cand;
    scores.push({ cardId: cand.ID!, score: evaluateDeck(ctx, fixed).score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Worker プロトコル型
// ---------------------------------------------------------------------------

/** メイン → Worker */
export type FinderWorkerRequest =
  | { type: 'init'; input: SearchInput }
  | { type: 'chunk'; descriptor: ChunkDescriptor }
  | { type: 'abort' };

/** Worker → メイン */
export type FinderWorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; evaluatedDelta: number; localBestScore: number | null }
  | { type: 'result'; topK: DeckRecord[]; evaluated: number; aborted: boolean }
  | { type: 'error'; message: string };
