import { describe, it, expect } from 'vitest';

import {
  binomial,
  multichoose,
  countMultisetsWithLimits,
  multisetIndices,
  multisetIndicesOrEmpty,
  isShrinkCard,
  createSearchContext,
  countCombos,
  generateChunks,
  enumerateChunkDecks,
  evaluateDeck,
  evaluateChunk,
  mergeTopK,
  evaluateFriendSwap,
  TOP_K,
  type SearchInput,
  type DeckRecord,
} from '../../../src/lib/score/maxScoreFinder';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { EventBonusTier } from '../../../src/lib/data/eventBonusTiers';
import { allCards, allBroachs, findSongById } from '../../fixtures';

describe('組合せ数学ユーティリティ', () => {
  it('binomial: C(5,2)=10, C(4,0)=1, C(3,5)=0, C(-1,0)=0', () => {
    expect(binomial(5, 2)).toBe(10);
    expect(binomial(4, 0)).toBe(1);
    expect(binomial(3, 5)).toBe(0);
    expect(binomial(-1, 0)).toBe(0);
  });

  it('multichoose: H(3,2)=6, H(7,4)=210, H(1,4)=1', () => {
    expect(multichoose(3, 2)).toBe(6);
    expect(multichoose(7, 4)).toBe(210);
    expect(multichoose(1, 4)).toBe(1);
  });

  it('countMultisetsWithLimits: 上限付き多重集合の数え上げ', () => {
    // 各 1 枚ずつ 3 種から 2 枚 → {a,b},{a,c},{b,c} の 3 通り
    expect(countMultisetsWithLimits([1, 1, 1], 2)).toBe(3);
    // a×2, b×1 から 2 枚 → {a,a},{a,b} の 2 通り
    expect(countMultisetsWithLimits([2, 1], 2)).toBe(2);
    // 上限なし相当 (上限 ≥ k) なら multichoose と一致
    expect(countMultisetsWithLimits([4, 4, 4], 4)).toBe(multichoose(3, 4));
    // 合計上限が k 未満なら 0
    expect(countMultisetsWithLimits([1, 1], 3)).toBe(0);
  });

  it('multisetIndices: 列挙数が multichoose と一致し非減少列のみ', () => {
    const seen: string[] = [];
    for (const idx of multisetIndices(4, 3)) {
      // ジェネレーターは同一配列を破壊的に再利用するため必ずコピーする
      seen.push([...idx].join(','));
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
    }
    expect(seen.length).toBe(multichoose(4, 3));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('multisetIndices: N=0 または k=0 では何も yield しない', () => {
    expect([...multisetIndices(0, 2)].length).toBe(0);
    expect([...multisetIndices(3, 0)].length).toBe(0);
  });

  it('multisetIndicesOrEmpty: k=0 のとき空配列を 1 回だけ yield する', () => {
    const out = [...multisetIndicesOrEmpty(3, 0)].map((a) => [...a]);
    expect(out).toEqual([[]]);
    expect([...multisetIndicesOrEmpty(3, 2)].length).toBe(multichoose(3, 2));
  });
});

describe('isShrinkCard', () => {
  it('フィクスチャに判定縮小持ちと非縮小の UR が両方存在する', () => {
    const ur = allCards.filter((c) => c.rarity === 'UR' && c.ap_skill_type);
    expect(ur.some((c) => isShrinkCard(c))).toBe(true);
    expect(ur.some((c) => !isShrinkCard(c))).toBe(true);
  });

  it('null は false', () => {
    expect(isShrinkCard(null)).toBe(false);
  });

  it('スキルタイプ文字列で判定する', () => {
    const fake = (t: string | null) => ({ ap_skill_type: t }) as unknown as Card;
    expect(isShrinkCard(fake('判定縮小スコアアップ'))).toBe(true);
    expect(isShrinkCard(fake('判定縮小（タイマー）'))).toBe(true);
    expect(isShrinkCard(fake('スコアアップ'))).toBe(false);
    expect(isShrinkCard(fake(null))).toBe(false);
  });
});

/** テスト用候補: 縮小持ち UR 3 枚 + 非縮小 UR 4 枚 */
const urPool = allCards.filter((c) => c.rarity === 'UR' && c.ID != null && c.ap_skill_type);
const shrinkUr = urPool.filter((c) => isShrinkCard(c)).slice(0, 3);
const nonShrinkUr = urPool.filter((c) => !isShrinkCard(c)).slice(0, 4);
const testCandidates = [...shrinkUr, ...nonShrinkUr];
const testSong = findSongById(2); // MONSTER GENERATiON (EXPERT+)
const testTiers: Record<string, EventBonusTier> = Object.fromEntries(
  testCandidates.map((c) => [String(c.ID), 'gold' as EventBonusTier])
);

function buildInput(overrides: Partial<SearchInput> = {}): SearchInput {
  return {
    evalMode: 'expected',
    ownedOnly: false,
    shrinkPairOnly: false,
    scoreOptions: { scoreUpAssist: false, scoreUpBadgeRate: 0 },
    candidates: testCandidates,
    ownedCounts: {},
    song: testSong,
    broachs: allBroachs,
    tierByCardId: testTiers,
    rabbitNotes: {},
    useOwnedBroachs: false,
    sharedBroachCounts: {},
    ...overrides,
  };
}

describe('createSearchContext', () => {
  it('縮小/非縮小・所持候補を分割し、notesCount を解決する', () => {
    const ownedCounts = {
      [String(testCandidates[0].ID)]: 2,
      [String(testCandidates[3].ID)]: 1,
    };
    const ctx = createSearchContext(buildInput({ ownedCounts }));
    expect(ctx.candidates.length).toBe(7);
    expect(ctx.shrink.length).toBe(3);
    expect(ctx.nonShrink.length).toBe(4);
    expect(ctx.owned.length).toBe(2);
    expect(ctx.ownedLimit.get(testCandidates[0].ID!)).toBe(2);
    expect(ctx.notesCount).toBeGreaterThan(0);
  });
});

describe('countCombos', () => {
  it('通常モード: multichoose(N,2) × multichoose(N,4)', () => {
    const ctx = createSearchContext(buildInput());
    expect(countCombos(ctx)).toBe(multichoose(7, 2) * multichoose(7, 4)); // 28 × 210 = 5880
  });

  it('縮小2枚以上条件: s2 ごとのペア数 × k=max(0,2−s2)..4 のメンバー組合せ総和', () => {
    const ctx = createSearchContext(buildInput({ shrinkPairOnly: true }));
    // S=3, T=4。k = メンバー4枠中の縮小枚数:
    //   s2=0: H(4,2)=10 ペア × Σ_{k=2..4} H(3,k)×H(4,4−k) = (6×10 + 10×4 + 15×1) = 115 → 1150
    //   s2=1: 3×4=12 ペア × Σ_{k=1..4} = (3×20 + 6×10 + 10×4 + 15×1) = 175 → 2100
    //   s2=2: H(3,2)=6 ペア × Σ_{k=0..4} = (1×35 + 3×20 + 6×10 + 10×4 + 15×1) = 210 → 1260
    expect(countCombos(ctx)).toBe(1150 + 2100 + 1260); // 4510
  });

  it('所持衣装検索: センターごとの上限付き 4-多重集合 × フレンド候補数', () => {
    // 2 種を各 1 枚ずつ所持 → センター+メンバー4枚 (計5枠) は枚数不足で 0 通り
    const fewOwned = {
      [String(testCandidates[0].ID)]: 1,
      [String(testCandidates[1].ID)]: 1,
    };
    expect(countCombos(createSearchContext(buildInput({ ownedOnly: true, ownedCounts: fewOwned })))).toBe(0);

    // 1 種 5 枚所持 → センター 1 通り × メンバー {同一カード×4} 1 通り × フレンド 7
    const fiveOwned = { [String(testCandidates[0].ID)]: 5 };
    expect(countCombos(createSearchContext(buildInput({ ownedOnly: true, ownedCounts: fiveOwned })))).toBe(7);
  });

  it('候補 0 枚なら全モードで 0', () => {
    const empty = buildInput({ candidates: [] });
    expect(countCombos(createSearchContext(empty))).toBe(0);
    expect(countCombos(createSearchContext({ ...empty, shrinkPairOnly: true }))).toBe(0);
    expect(countCombos(createSearchContext({ ...empty, ownedOnly: true }))).toBe(0);
  });
});

/** 全チャンクの全デッキを列挙して個数と正規化キーを集める */
function enumerateAll(input: SearchInput): { count: number; keys: Set<string>; decks: Card[][] } {
  const ctx = createSearchContext(input);
  const keys = new Set<string>();
  const decks: Card[][] = [];
  let count = 0;
  for (const chunk of generateChunks(ctx)) {
    for (const deck of enumerateChunkDecks(ctx, chunk)) {
      count++;
      decks.push([...deck]); // yield された配列は再利用されるためコピー
      // 正規化キー: (center,friend) は対称なのでソートしたペア + ソートしたメンバー
      const pair = [deck[0].ID!, deck[5].ID!].sort((a, b) => a - b).join('+');
      const members = deck.slice(1, 5).map((c) => c.ID!).sort((a, b) => a - b).join(',');
      keys.add(`${pair}|${members}`);
    }
  }
  return { count, keys, decks };
}

/** ownedOnly 用キー: center は役割が固定なので分離する */
function enumerateAllOwned(input: SearchInput): { count: number; keys: Set<string>; decks: Card[][] } {
  const ctx = createSearchContext(input);
  const keys = new Set<string>();
  const decks: Card[][] = [];
  let count = 0;
  for (const chunk of generateChunks(ctx)) {
    for (const deck of enumerateChunkDecks(ctx, chunk)) {
      count++;
      decks.push([...deck]);
      const members = deck.slice(1, 5).map((c) => c.ID!).sort((a, b) => a - b).join(',');
      keys.add(`${deck[0].ID}|${members}|${deck[5].ID}`);
    }
  }
  return { count, keys, decks };
}

describe('generateChunks + enumerateChunkDecks', () => {
  it('通常モード: 列挙数 = countCombos、重複なし', () => {
    const input = buildInput();
    const ctx = createSearchContext(input);
    const { count, keys } = enumerateAll(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count); // 正規化キーに重複がない = 同一編成を二度列挙しない
  });

  it('通常モード: チャンク数 = multichoose(N,2)', () => {
    const ctx = createSearchContext(buildInput());
    expect([...generateChunks(ctx)].length).toBe(multichoose(7, 2));
  });

  it('縮小2枚以上条件: 列挙数 = countCombos、全デッキの縮小枚数が 2 以上', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAll(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      expect(deck.filter((c) => isShrinkCard(c)).length).toBeGreaterThanOrEqual(2);
    }
    // 「以上」になったことで 3 枚以上の編成も列挙される
    expect(decks.some((deck) => deck.filter((c) => isShrinkCard(c)).length >= 3)).toBe(true);
  });

  it('所持衣装検索: 列挙数 = countCombos、スロット0-4 が所持上限内', () => {
    const ownedCounts = {
      [String(testCandidates[0].ID)]: 2, // 縮小持ち
      [String(testCandidates[1].ID)]: 1, // 縮小持ち
      [String(testCandidates[3].ID)]: 3, // 非縮小
      [String(testCandidates[4].ID)]: 1, // 非縮小
    };
    const input = buildInput({ ownedOnly: true, ownedCounts });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAllOwned(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      const usage = new Map<number, number>();
      for (let i = 0; i < 5; i++) usage.set(deck[i].ID!, (usage.get(deck[i].ID!) ?? 0) + 1);
      for (const [id, n] of usage) expect(n).toBeLessThanOrEqual(ownedCounts[String(id)] ?? 0);
    }
  });

  it('所持×縮小2枚以上条件: 列挙数 = countCombos、フレンドプール規則が守られる', () => {
    const ownedCounts = {
      [String(testCandidates[0].ID)]: 2,
      [String(testCandidates[1].ID)]: 1,
      [String(testCandidates[3].ID)]: 3,
      [String(testCandidates[4].ID)]: 1,
    };
    const input = buildInput({ ownedOnly: true, shrinkPairOnly: true, ownedCounts });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAllOwned(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      const shrink5 = deck.slice(0, 5).filter((c) => isShrinkCard(c)).length;
      // スロット0-4 の縮小が 1 枚以下なら縮小フレンドのみ
      if (shrink5 <= 1) expect(isShrinkCard(deck[5])).toBe(true);
    }
    // own5 ≥ 2 では全フレンドが許される: 非縮小/縮小フレンド両方の編成が存在する
    const over2 = decks.filter((deck) => deck.slice(0, 5).filter((c) => isShrinkCard(c)).length >= 2);
    expect(over2.some((deck) => !isShrinkCard(deck[5]))).toBe(true);
    expect(over2.some((deck) => isShrinkCard(deck[5]))).toBe(true);
  });
});

describe('evaluateChunk / mergeTopK (実エンジン評価)', () => {
  // 評価コストを抑えるため候補 5 枚 (縮小 2 + 非縮小 3)
  const smallInput = buildInput({
    candidates: [...shrinkUr.slice(0, 2), ...nonShrinkUr.slice(0, 3)],
  });

  async function runAllChunks(input: SearchInput, shuffle: boolean): Promise<{ top: DeckRecord[]; evaluated: number }> {
    const ctx = createSearchContext(input);
    const chunks = [...generateChunks(ctx)];
    if (shuffle) chunks.reverse(); // 順序を変えても結果が同じことの検証
    const tops: DeckRecord[][] = [];
    let evaluated = 0;
    for (const chunk of chunks) {
      const r = await evaluateChunk(ctx, chunk);
      tops.push(r.topK);
      evaluated += r.evaluated;
    }
    return { top: mergeTopK(tops, TOP_K), evaluated };
  }

  it('順次実行とチャンク順入れ替え実行で Top-K が一致する (分割の完全性)', async () => {
    const a = await runAllChunks(smallInput, false);
    const b = await runAllChunks(smallInput, true);
    const ctx = createSearchContext(smallInput);
    expect(a.evaluated).toBe(countCombos(ctx));
    expect(b.evaluated).toBe(a.evaluated);
    expect(a.top.map((r) => r.score)).toEqual(b.top.map((r) => r.score));
    expect(a.top[0].cardIds.slice().sort()).toEqual(b.top[0].cardIds.slice().sort());
  });

  it('evalMode=max でも動作しスコアは expected と異なりうる', async () => {
    const r = await runAllChunks({ ...smallInput, evalMode: 'max' }, false);
    expect(r.top.length).toBeGreaterThan(0);
    expect(r.top[0].score).toBeGreaterThan(0);
  });

  it('evaluateDeck: expected モードでは内訳フィールドが埋まる', () => {
    const ctx = createSearchContext(smallInput);
    const deck = new Array(6).fill(ctx.candidates[0]);
    const rec = evaluateDeck(ctx, deck);
    expect(rec.cardIds).toEqual(deck.map((c) => c.ID));
    expect(rec.score).toBe(rec.finalScore);
    expect(rec.baseScore).toBeGreaterThan(0);
    expect(rec.liveEndScore).toBeDefined();
  });

  it('evaluateDeck: useOwnedBroachs=true で割当が記録されスコアが下がらない', () => {
    const withoutCtx = createSearchContext(smallInput);
    const withCtx = createSearchContext({
      ...smallInput,
      useOwnedBroachs: true,
      sharedBroachCounts: { '1': 2 }, // ALL750 × 2
    });
    const deck = new Array(6).fill(withoutCtx.candidates[0]);
    const recWithout = evaluateDeck(withoutCtx, deck);
    const recWith = evaluateDeck(withCtx, deck);

    expect(recWithout.sharedBroachIds).toBeUndefined();
    expect(recWith.sharedBroachIds).toBeDefined();
    // slot 0-4 の割当合計は min(所持 2, 容量) = 2、フレンド枠は容量分の最良ブローチ
    const ownAssigned = recWith.sharedBroachIds!.slice(0, 5).flat();
    expect(ownAssigned).toHaveLength(2);
    expect(ownAssigned.every((id) => id === 1)).toBe(true);
    expect(recWith.sharedBroachIds![5].length).toBeGreaterThanOrEqual(1);
    // ブローチ分だけスコアが上がる (少なくとも下がらない)
    expect(recWith.score).toBeGreaterThan(recWithout.score);
  });

  it('onTick が true を返すと中断され、部分結果が整合する', async () => {
    const ctx = createSearchContext(smallInput);
    const chunk = [...generateChunks(ctx)][0];
    let ticks = 0;
    // yieldEvery=10 で 1 回目の tick (10 評価後) に中断
    const r = await evaluateChunk(ctx, chunk, { onTick: () => { ticks++; return true; } }, 10);
    expect(r.aborted).toBe(true);
    expect(r.evaluated).toBe(10);
    expect(ticks).toBe(1);
    expect(r.topK.length).toBeLessThanOrEqual(TOP_K);
    for (let i = 1; i < r.topK.length; i++) {
      expect(r.topK[i].score).toBeLessThanOrEqual(r.topK[i - 1].score);
    }
  });

  it('onTick は yieldEvery ごとと完了時の端数で呼ばれ、delta 合計 = evaluated', async () => {
    const ctx = createSearchContext(smallInput);
    const chunk = [...generateChunks(ctx)][0]; // 1 チャンク = H(5,4) = 70 デッキ
    let total = 0;
    const r = await evaluateChunk(ctx, chunk, { onTick: (delta) => { total += delta; return false; } }, 30);
    expect(r.evaluated).toBe(70);
    expect(total).toBe(70); // 30 + 30 + 10 (端数)
    expect(r.aborted).toBe(false);
  });
});

describe('mergeTopK', () => {
  const rec = (score: number): DeckRecord => ({ cardIds: [1, 2, 3, 4, 5, 6], score });

  it('空リスト・空配列を許容する', () => {
    expect(mergeTopK([], 10)).toEqual([]);
    expect(mergeTopK([[], []], 10)).toEqual([]);
  });

  it('スコア降順にマージして k 件に切り詰める', () => {
    const merged = mergeTopK([[rec(5), rec(1)], [rec(3)], [rec(9), rec(2)]], 3);
    expect(merged.map((r) => r.score)).toEqual([9, 5, 3]);
  });

  it('k 件未満ならあるだけ返す', () => {
    expect(mergeTopK([[rec(1)]], 10).length).toBe(1);
  });

  it('同点は件数を失わない', () => {
    expect(mergeTopK([[rec(5), rec(5)], [rec(5)]], 2).map((r) => r.score)).toEqual([5, 5]);
  });
});

describe('evaluateFriendSwap', () => {
  it('最適編成のフレンド差し替え Top 5 を返す (スコア降順)', async () => {
    const smallInput = buildInput({
      candidates: [...shrinkUr.slice(0, 2), ...nonShrinkUr.slice(0, 3)],
    });
    const ctx = createSearchContext(smallInput);
    const chunks = [...generateChunks(ctx)];
    const tops: DeckRecord[][] = [];
    for (const chunk of chunks) tops.push((await evaluateChunk(ctx, chunk)).topK);
    const best = mergeTopK(tops, 1)[0];
    const friends = evaluateFriendSwap(ctx, best.cardIds);
    expect(friends.length).toBe(Math.min(5, ctx.candidates.length));
    for (let i = 1; i < friends.length; i++) {
      expect(friends[i].score).toBeLessThanOrEqual(friends[i - 1].score);
    }
    // 最良フレンドのスコアは全体ベストと一致する (best 自身が候補に含まれるため)
    expect(friends[0].score).toBe(best.score);
  });

  it('縮小2枚以上条件: 固定5枠の縮小 ≥2 なら全候補プール', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    // 固定5枠 = 縮小2枚 (center 縮小 + member1 縮小) → フレンドは全候補 (7枚) から Top5
    const fixedIds = [
      shrinkUr[0].ID!, shrinkUr[1].ID!,
      nonShrinkUr[0].ID!, nonShrinkUr[1].ID!, nonShrinkUr[2].ID!,
      nonShrinkUr[3].ID!,
    ];
    const friends = evaluateFriendSwap(ctx, fixedIds);
    expect(friends.length).toBe(5); // 旧仕様 (非縮小プール=4枚) なら 4 になる
  });

  it('縮小2枚以上条件: 固定5枠の縮小 ≤1 なら縮小プールのみ', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    // 固定5枠 = 縮小1枚 (center のみ縮小)、フレンド枠は縮小 → プールは縮小 3 枚
    const fixedIds = [
      shrinkUr[0].ID!,
      nonShrinkUr[0].ID!, nonShrinkUr[1].ID!, nonShrinkUr[2].ID!, nonShrinkUr[3].ID!,
      shrinkUr[1].ID!,
    ];
    const friends = evaluateFriendSwap(ctx, fixedIds);
    const shrinkIds = new Set(ctx.shrink.map((c) => c.ID));
    expect(friends.length).toBe(3);
    for (const f of friends) expect(shrinkIds.has(f.cardId)).toBe(true);
  });
});
