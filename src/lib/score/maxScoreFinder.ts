/**
 * max-score-finder (編成組合計算) の総当たり探索ロジック。
 *
 * UI (MaxScoreFinder.svelte) と Web Worker (maxScoreFinder.worker.ts) の両方から
 * import される純粋モジュール。Svelte やブラウザ API に依存しない。
 */
import type { Card } from '../data/fetchCardsJson';
import { SKILL_TYPE } from '../data/fetchCardsJson';
import type { Song } from '../data/fetchSongsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { ScoreOptions } from './types';
import type { SkillLevel } from './deckState';
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
import { assignBroachs, calcAttrWeights, type AttrWeights } from './broachAssignment';
import type { ResolveBroachOptions } from './broachResolver';

/** デッキ6枠中の判定縮小スキル持ちの最低枚数 (shrinkPairOnly 有効時) */
export const SHRINK_MIN = 2;

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

/**
 * 各カード i の出現上限を limits[i] とした j-多重集合の総数を j = 0..k で返す
 * (= ∏(1 + x + ... + x^{limits[i]}) の x^j の係数)
 */
export function multisetPolynomial(limits: number[], k: number): number[] {
  let poly: number[] = [1];
  for (const lim of limits) {
    const newLen = Math.min(poly.length + lim, k + 1);
    const next = Array.from({ length: newLen }, () => 0);
    for (let d = 0; d < poly.length; d++) {
      if (poly[d] === 0) continue;
      const jMax = Math.min(lim, k - d);
      for (let j = 0; j <= jMax; j++) next[d + j] += poly[d];
    }
    poly = next;
  }
  while (poly.length <= k) poly.push(0);
  return poly;
}

/** 各カード i の出現上限を limits[i] とした k-多重集合の総数 */
export function countMultisetsWithLimits(limits: number[], k: number): number {
  return multisetPolynomial(limits, k)[k];
}

/**
 * 0..N-1 から重複ありで k 個選ぶ非減少インデックス列を列挙する。
 * yield される配列は次の iteration で破壊的に書き換えられるため、
 * 保持する場合は呼び出し側でコピーすること。
 */
export function* multisetIndices(N: number, k: number): Generator<number[]> {
  if (N <= 0 || k <= 0) return;
  const idx = Array.from({ length: k }, () => 0);
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

/** flattenNotes のシード (移植元の旧 UI 実装と同値。結果再現性のため固定) */
export const FLATTEN_SEED = 42;

export type EvalMode = 'expected' | 'max';

export interface SearchInput {
  evalMode: EvalMode;
  /** センター+メンバー4枚を所持枚数の範囲内に制限する */
  ownedOnly: boolean;
  /** デッキ6枠中の判定縮小持ちを SHRINK_MIN 枚以上に絞る（所持モードはフレンドプール規則） */
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
  /** 所持共通ブローチを slot 0-4 にグリーディ割当する (false なら従来どおりブローチなし) */
  useOwnedBroachs: boolean;
  /** broachId(文字列) → 所持数 (useOwnedBroachs 時に使用) */
  sharedBroachCounts: Record<string, number>;
  /** cardId(文字列) → 所持 Lv（降順）。ownedOnly 時のみ使用。省略・欠けは Lv5 (ADR 0085) */
  ownedSkillLevels?: Record<string, SkillLevel[]>;
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
  /** ブローチ割当用: 楽曲ノーツから前計算した属性重み */
  attrWeights: AttrWeights;
  /** ブローチ割当用: 固有ブローチ持ちカード判定 */
  hasFixedBroach: (card: Card) => boolean;
  /** 候補配列上の位置 (正規形判定用。所持候補・縮小/非縮小の部分配列も候補配列の順序を保つ) */
  posByCard: Map<Card, number>;
  /**
   * センター/フレンドの入替対称を探索で使うか (ADR 0080)。
   * ラビットノートはスロット 0-4 だけに加算され、所持共通ブローチ割当もフレンド枠だけ規則が違うため、
   * どちらかが有効なら非対称。所持衣装検索はプール自体が非対称なので常に false
   */
  friendSymmetric: boolean;
}

export function createSearchContext(input: SearchInput): SearchContext {
  const owned = input.candidates.filter((c) => (input.ownedCounts[String(c.ID)] ?? 0) >= 1);
  const ownedLimit = new Map<number, number>();
  for (const c of owned) ownedLimit.set(c.ID!, input.ownedCounts[String(c.ID)] ?? 0);
  const notes = flattenNotes(input.song, FLATTEN_SEED);
  const fixedIds = new Set(input.broachs.map((b) => b.card_id));
  const hasRabbitNote = input.candidates.some((c) => {
    const rn = input.rabbitNotes[c.name ?? ''];
    return !!rn && !!(rn.shout || rn.beat || rn.melody);
  });
  return {
    input,
    candidates: input.candidates,
    owned,
    shrink: input.candidates.filter((c) => isShrinkCard(c)),
    nonShrink: input.candidates.filter((c) => !isShrinkCard(c)),
    ownedLimit,
    groupSizes: computeGroupSizes(input.song),
    // oxlint-disable-next-line unicorn/explicit-length-check -- 真偽判定ではなく notes.length は数値フォールバック値として使用。`.length > 0` にすると notesCount が boolean になり壊れる
    notesCount: input.song.notes_count || notes.length,
    attrWeights: calcAttrWeights(notes),
    hasFixedBroach: (c) => c.cardID !== null && fixedIds.has(c.cardID),
    posByCard: new Map(input.candidates.map((c, i) => [c, i])),
    friendSymmetric: !input.ownedOnly && !input.useOwnedBroachs && !hasRabbitNote,
  };
}

/** 属性 × 縮小有無で分けた候補のクラス (数え上げ用) */
interface CardClass {
  attr: string | null;
  shrink: boolean;
  cards: Card[];
}

function classify(cards: Card[]): CardClass[] {
  const map = new Map<string, CardClass>();
  for (const c of cards) {
    const shrink = isShrinkCard(c);
    const key = `${c.attribute}|${shrink}`;
    let cls = map.get(key);
    if (!cls) {
      cls = { attr: c.attribute, shrink, cards: [] };
      map.set(key, cls);
    }
    cls.cards.push(c);
  }
  return [...map.values()];
}

/** クラスごとの枚数配分 v から、属性ごとの枚数と縮小枚数を集計する */
function tally(classes: CardClass[], v: number[]): { byAttr: Map<string | null, number>; shrink: number } {
  const byAttr = new Map<string | null, number>();
  let shrink = 0;
  classes.forEach((cls, i) => {
    if (v[i] === 0) return;
    byAttr.set(cls.attr, (byAttr.get(cls.attr) ?? 0) + v[i]);
    if (cls.shrink) shrink += v[i];
  });
  return { byAttr, shrink };
}

/**
 * 各クラスから v[i] 枚ずつ、合計 k 枚選ぶ全ての配分 v について Σ ∏ coefs[i][v[i]] × weight(v)。
 * coefs[i][j] = クラス i から j 枚の多重集合を作る通り数
 */
function sumOverSplits(coefs: number[][], k: number, weight: (v: number[]) => number): number {
  const v: number[] = Array.from({ length: coefs.length }, () => 0);
  const rec = (i: number, rest: number, prod: number): number => {
    if (i === coefs.length) return rest === 0 ? prod * weight(v) : 0;
    let sum = 0;
    for (let j = 0; j <= rest; j++) {
      const c = coefs[i][j] ?? 0;
      if (c === 0) continue;
      v[i] = j;
      sum += rec(i + 1, rest - j, prod * c);
    }
    return sum;
  };
  return rec(0, k, 1);
}

/** 上限なしのクラス (n 枚) から j 枚の多重集合を作る通り数 (j = 0..k) */
function unlimitedPolynomial(n: number, k: number): number[] {
  return Array.from({ length: k + 1 }, (_, j) => (j === 0 ? 1 : multichoose(n, j)));
}

/**
 * 評価対象の組合せ総数 (= 正規形として実際に評価するデッキ数。ADR 0080)。
 * 同じ 6 枚でセンターの属性が同じ編成は 1 回だけ数える。
 * - 対称時 (friendSymmetric): 6 枚の多重集合 × 実現できる {センター属性, フレンド属性} の組数
 * - 非対称時: スロット 0-4 の 5 枚多重集合 × センター属性の種類数 × フレンドプール
 * - 所持衣装検索: 上と同じ数え方で、5 枚多重集合を所持枚数の上限内に制限する
 * shrinkPairOnly 時はフレンドプールを縮小枚数で絞る (所持衣装検索は 1 枚以下でも縮小フレンドで評価し、除外はしない)。
 */
export function countCombos(ctx: SearchContext): number {
  const { input } = ctx;
  const N = ctx.candidates.length;
  const S = ctx.shrink.length;
  if (N === 0) return 0;
  const friendPool = (shrink5: number): number => {
    if (!input.shrinkPairOnly || shrink5 >= SHRINK_MIN) return N;
    return input.ownedOnly || shrink5 === SHRINK_MIN - 1 ? S : 0;
  };
  const centersTimesFriends = (classes: CardClass[]) => (v: number[]) => {
    const t = tally(classes, v);
    return t.byAttr.size * friendPool(t.shrink);
  };
  if (input.ownedOnly) {
    if (ctx.owned.length === 0) return 0;
    const classes = classify(ctx.owned);
    const coefs = classes.map((cls) => multisetPolynomial(cls.cards.map((c) => ctx.ownedLimit.get(c.ID!) ?? 0), 5));
    return sumOverSplits(coefs, 5, centersTimesFriends(classes));
  }
  const classes = classify(ctx.candidates);
  if (ctx.friendSymmetric) {
    const coefs = classes.map((cls) => unlimitedPolynomial(cls.cards.length, 6));
    return sumOverSplits(coefs, 6, (v) => {
      const t = tally(classes, v);
      if (input.shrinkPairOnly && t.shrink < SHRINK_MIN) return 0;
      // 異なる属性の組 + 同属性で 2 枚以上ある属性
      const present = t.byAttr.size;
      let doubled = 0;
      for (const n of t.byAttr.values()) if (n >= 2) doubled++;
      return (present * (present - 1)) / 2 + doubled;
    });
  }
  const coefs = classes.map((cls) => unlimitedPolynomial(cls.cards.length, 5));
  return sumOverSplits(coefs, 5, centersTimesFriends(classes));
}

/**
 * チャンク = Worker に渡す作業単位。
 * - pair: 通常モード。(center, friend) ペア 1 つ (対称時は centerIdx ≤ friendIdx、非対称時は順序付き)
 * - shrinkPair: 縮小2枚以上条件。センター / フレンドをそれぞれ縮小 (S) か非縮小 (T) のプールから取る。
 *   対称時は同プール内のペアを aIdx ≤ bIdx に絞り (T,S) は列挙しない。非対称時は 4 組すべてを順序付きで列挙する。
 *   メンバー4枠の縮小枚数は max(0, SHRINK_MIN−ペア内の縮小枚数)〜4 を列挙する
 * - center: 所持衣装検索。owned[centerIdx] をセンターに固定
 */
export type ChunkDescriptor =
  | { kind: 'pair'; centerIdx: number; friendIdx: number }
  | { kind: 'shrinkPair'; centerShrink: boolean; friendShrink: boolean; aIdx: number; bIdx: number }
  | { kind: 'center'; centerIdx: number };

export function* generateChunks(ctx: SearchContext): Generator<ChunkDescriptor> {
  const { input } = ctx;
  if (input.ownedOnly) {
    for (let ci = 0; ci < ctx.owned.length; ci++) yield { kind: 'center', centerIdx: ci };
    return;
  }
  const sym = ctx.friendSymmetric;
  if (input.shrinkPairOnly) {
    const S = ctx.shrink.length;
    const T = ctx.nonShrink.length;
    const roles: [boolean, boolean][] = sym
      ? [[false, false], [true, false], [true, true]]
      : [[false, false], [true, false], [false, true], [true, true]];
    for (const [centerShrink, friendShrink] of roles) {
      const A = centerShrink ? S : T;
      const B = friendShrink ? S : T;
      for (let a = 0; a < A; a++) {
        for (let b = sym && centerShrink === friendShrink ? a : 0; b < B; b++) {
          yield { kind: 'shrinkPair', centerShrink, friendShrink, aIdx: a, bIdx: b };
        }
      }
    }
    return;
  }
  const N = ctx.candidates.length;
  for (let c = 0; c < N; c++) {
    for (let f = sym ? c : 0; f < N; f++) yield { kind: 'pair', centerIdx: c, friendIdx: f };
  }
}

/**
 * 正規形判定 (ADR 0080): センターは同属性の中で候補配列上の位置が最小の衣装に限る。
 * 入替対称を使うときはフレンドにも同じ規則を適用する。
 * 同じ 6 枚 (所持衣装検索ではスロット 0-4 の 5 枚) でセンターの属性が同じ編成はスコアが一致するため、
 * 正規形だけを評価すれば同値な編成を 1 回ずつ評価したことになる
 */
function isCanonical(ctx: SearchContext, deck: Card[]): boolean {
  const pos = ctx.posByCard;
  const center = deck[0];
  const centerPos = pos.get(center)!;
  const friend = ctx.friendSymmetric ? deck[5] : null;
  const friendPos = friend ? pos.get(friend)! : -1;
  for (let i = 1; i <= 4; i++) {
    const m = deck[i];
    const p = pos.get(m)!;
    if (m.attribute === center.attribute && p < centerPos) return false;
    if (friend && m.attribute === friend.attribute && p < friendPos) return false;
  }
  return true;
}

/**
 * チャンク内の全デッキを列挙する。
 * yield される配列は次の iteration で破壊的に書き換えられるため、
 * 保持する場合は呼び出し側でコピーすること。
 * deck の並びは [center, member1..4, friend]。
 */
export function* enumerateChunkDecks(ctx: SearchContext, chunk: ChunkDescriptor): Generator<Card[]> {
  const deck: Card[] = Array.from({ length: 6 });

  if (chunk.kind === 'pair') {
    deck[0] = ctx.candidates[chunk.centerIdx];
    deck[5] = ctx.candidates[chunk.friendIdx];
    for (const m of multisetIndices(ctx.candidates.length, 4)) {
      deck[1] = ctx.candidates[m[0]];
      deck[2] = ctx.candidates[m[1]];
      deck[3] = ctx.candidates[m[2]];
      deck[4] = ctx.candidates[m[3]];
      if (!isCanonical(ctx, deck)) continue;
      yield deck;
    }
    return;
  }

  if (chunk.kind === 'shrinkPair') {
    const S = ctx.shrink;
    const T = ctx.nonShrink;
    deck[0] = (chunk.centerShrink ? S : T)[chunk.aIdx];
    deck[5] = (chunk.friendShrink ? S : T)[chunk.bIdx];
    // メンバー4枠中の縮小枚数 k を、6枠合計が SHRINK_MIN 以上になる範囲でループ
    // (縮小候補が k 枚に満たない場合は多重集合の列挙が空になるだけ)
    const kMin = Math.max(0, SHRINK_MIN - (chunk.centerShrink ? 1 : 0) - (chunk.friendShrink ? 1 : 0));
    for (let k = kMin; k <= 4; k++) {
      for (const sm of multisetIndicesOrEmpty(S.length, k)) {
        for (const nm of multisetIndicesOrEmpty(T.length, 4 - k)) {
          for (let i = 0; i < k; i++) deck[1 + i] = S[sm[i]];
          for (let i = 0; i < 4 - k; i++) deck[1 + k + i] = T[nm[i]];
          if (!isCanonical(ctx, deck)) continue;
          yield deck;
        }
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
    if (!isCanonical(ctx, deck)) continue;

    // 縮小2枚以上条件: スロット0-4 の縮小が SHRINK_MIN 以上なら全フレンド、
    // 1 枚以下は縮小フレンドのみ（組合せ自体は除外しない）
    let friendPool = ctx.candidates;
    if (ctx.input.shrinkPairOnly) {
      let shrinkCount5 = 0;
      for (let i = 0; i < 5; i++) {
        if (isShrinkCard(deck[i])) shrinkCount5++;
      }
      friendPool = shrinkCount5 >= SHRINK_MIN ? ctx.candidates : ctx.shrink;
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
  /** useOwnedBroachs 時の共通ブローチ割当 (slot ごとの broachId 配列) */
  sharedBroachIds?: number[][];
  /** ownedOnly 時に評価に使ったスロットごとのスキル Lv (ADR 0085) */
  skillLevels?: SkillLevel[];
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

/** 探索完了時にまとめる結果 (UI の結果表示コンポーネントが受け取る) */
export type SearchResult = {
  best: DeckRecord;
  top: DeckRecord[];
  topFriends: FriendCandidate[];
  evaluated: number;
  elapsedMs: number;
  evalMode: 'expected' | 'max';
  aborted?: boolean;
};

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

// 探索条件は全カード特訓済みで固定 (移植元の旧 UI 実装と同値)。
// スキル Lv は既定 5。所持衣装検索ではスロット 0-4 を所持 Lv で評価する (ADR 0085)。
// 共通ブローチは useOwnedBroachs=false ならなし固定、true なら編成ごとにグリーディ割当
const SEARCH_SKILL_LEVELS: SkillLevel[] = [5, 5, 5, 5, 5, 5];
const SEARCH_TRAINED: boolean[] = [true, true, true, true, true, true];
const SEARCH_EMPTY_SHARED: number[][] = [[], [], [], [], [], []];
// グループ限定の固有ブローチ（種類4）は同グループ編成でなくても発動扱いで加算する (ADR 0072)。
// 結果表示 (SearchResults.svelte) も同じオプションで解決すること。
export const FINDER_BROACH_OPTIONS: ResolveBroachOptions = { assumeSameGroup: true };

/**
 * スロットごとの評価 Lv。所持衣装検索ではスロット 0-4 の衣装が手前に k 枚出ていれば
 * 所持 Lv（降順）の k 番目を使い、範囲外とフレンド枠は 5。それ以外は全 5 (ADR 0085)
 */
export function deckSkillLevels(ctx: SearchContext, deck: (Card | null)[]): SkillLevel[] {
  const { input } = ctx;
  if (!input.ownedOnly || !input.ownedSkillLevels) return SEARCH_SKILL_LEVELS;
  const seen = new Map<number, number>();
  const out: SkillLevel[] = [5, 5, 5, 5, 5, 5];
  for (let i = 0; i < 5; i++) {
    const id = deck[i]?.ID;
    if (id === null || id === undefined) continue;
    const k = seen.get(id) ?? 0;
    seen.set(id, k + 1);
    out[i] = input.ownedSkillLevels[String(id)]?.[k] ?? 5;
  }
  return out;
}

export function evaluateDeck(ctx: SearchContext, deck: (Card | null)[]): DeckRecord {
  const { input } = ctx;
  const tiers: EventBonusTier[] = deck.map((c) =>
    c && c.ID !== null ? input.tierByCardId[String(c.ID)] ?? 'none' : 'none'
  );
  let shared: number[][] = SEARCH_EMPTY_SHARED;
  if (input.useOwnedBroachs) {
    shared = assignBroachs(deck, input.sharedBroachCounts, ctx.attrWeights, ctx.hasFixedBroach);
  }
  const skillLevels = deckSkillLevels(ctx, deck);
  const team = computeTeam(
    deck, input.broachs, input.song, tiers, SEARCH_TRAINED, undefined,
    shared, skillLevels, input.rabbitNotes, FINDER_BROACH_OPTIONS
  );
  const exclusion = computeShrinkExclusion(team, ctx.groupSizes);
  const notes = flattenNotes(input.song, FLATTEN_SEED, exclusion);
  const rec: DeckRecord = {
    cardIds: deck.map((c) => c!.ID!),
    score: 0,
  };
  if (input.useOwnedBroachs) rec.sharedBroachIds = shared;
  if (input.ownedOnly) rec.skillLevels = skillLevels;
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
  return lists.flat().toSorted((a, b) => b.score - a.score).slice(0, k);
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
    pool = fixedShrink >= SHRINK_MIN ? ctx.candidates : ctx.shrink;
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
