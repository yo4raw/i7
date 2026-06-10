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
  type SearchInput,
  type ChunkDescriptor,
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

  it('縮小2枚条件: s2 ごとのペア数 × メンバー組合せの合計', () => {
    const ctx = createSearchContext(buildInput({ shrinkPairOnly: true }));
    // S=3, T=4:
    //   s2=0: H(4,2)=10 ペア × H(3,2)=6 × H(4,2)=10 = 600
    //   s2=1: 3×4=12 ペア × H(3,1)=3 × H(4,3)=20 = 720
    //   s2=2: H(3,2)=6 ペア × H(3,0)=1 × H(4,4)=35 = 210
    expect(countCombos(ctx)).toBe(600 + 720 + 210);
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

  it('縮小2枚条件: 列挙数 = countCombos、全デッキの縮小枚数がちょうど 2', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAll(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      expect(deck.filter((c) => isShrinkCard(c)).length).toBe(2);
    }
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

  it('所持×縮小2枚条件: 列挙数 = countCombos、フレンドプール規則が守られる', () => {
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
      // スロット0-4 が縮小2枚なら非縮小フレンド、それ以外は縮小フレンド
      expect(isShrinkCard(deck[5])).toBe(shrink5 !== 2);
    }
  });
});
