import { describe, it, expect } from 'vitest';

import {
  countMultisetsWithLimits,
  createSearchContext,
  countCombos,
  evaluateDeck,
  evaluateChunk,
  evaluateFriendSwap,
  enumerateChunkDecks,
  generateChunks,
  isShrinkCard,
  type SearchInput,
} from '../../../src/lib/score/maxScoreFinder';
import type { Song } from '../../../src/lib/data/fetchSongsJson';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { EventBonusTier } from '../../../src/lib/data/eventBonusTiers';
import { allCards, allBroachs, findSongById } from '../../fixtures';

const urPool = allCards.filter((c) => c.rarity === 'UR' && c.ID != null && c.ap_skill_type);
const shrinkUr = urPool.filter((c) => isShrinkCard(c)).slice(0, 3);
const nonShrinkUr = urPool.filter((c) => !isShrinkCard(c)).slice(0, 4);
const testCandidates = [...shrinkUr, ...nonShrinkUr];
const testSong = findSongById(2);
const testTiers: Record<string, EventBonusTier> = Object.fromEntries(
  testCandidates.map((c) => [String(c.ID), 'gold' as EventBonusTier]),
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

describe('countMultisetsWithLimits: 内部 0 係数のスキップ (L54)', () => {
  it('途中の次数で係数 0 が出る上限構成でも正しく数える', () => {
    // limits=[0, 2] : 最初のカードは 0 枚 (poly に 0 係数が残る) → 2 枚目で d をスキップ
    // x^0(=1) × (1 + x + x^2) → k=2 の係数 = 1 ({2nd, 2nd})
    expect(countMultisetsWithLimits([0, 2], 2)).toBe(1);
    // limits=[0,0,3] : 先頭2つが 0 → poly=[1] のまま, 3枚目で 3 枚 → k=3 で 1 通り
    expect(countMultisetsWithLimits([0, 0, 3], 3)).toBe(1);
    // 先頭 0 のあと不足 → 0
    expect(countMultisetsWithLimits([0, 1], 3)).toBe(0);
  });
});

describe('createSearchContext: notes_count フォールバック (L145)', () => {
  it('song.notes_count が falsy なら展開ノーツ数を使う', () => {
    const songNoNotes = { ...testSong, notes_count: 0 } as unknown as Song;
    const ctx = createSearchContext(buildInput({ song: songNoNotes }));
    // notes_count=0 なので flattenNotes の length に等しい正の値が入る
    expect(ctx.notesCount).toBeGreaterThan(0);
  });
});

describe('countCombos: 縮小フレンドプール枯渇・ペア0 のスキップ', () => {
  it('縮小カードが存在しない候補で shrinkPairOnly なら friendPool=0 を skip し総数 0 (L189, L208)', () => {
    // 非縮小のみの候補 → S=0。shrinkPairOnly では SHRINK_MIN を満たせず friendPool=shrink(0)
    const ctx = createSearchContext(buildInput({ candidates: nonShrinkUr, shrinkPairOnly: true }));
    expect(ctx.shrink.length).toBe(0);
    expect(countCombos(ctx)).toBe(0);
  });

  it('所持×縮小2枚以上で縮小候補ゼロ: friendPool=shrink(0) を skip し総数 0 (L189)', () => {
    // 候補が非縮小 UR のみ → shrink=0。所持してもスロット0-4 で SHRINK_MIN を満たせず
    // friendPool=ctx.shrink.length(0) になり L189 の `continue` で skip される。
    const ownedCounts = { [String(nonShrinkUr[0].ID)]: 5 };
    const ctx = createSearchContext(
      buildInput({ candidates: nonShrinkUr, ownedOnly: true, shrinkPairOnly: true, ownedCounts }),
    );
    expect(ctx.shrink.length).toBe(0);
    expect(countCombos(ctx)).toBe(0);
  });

  it('非縮小0枚の候補: s2=0/s2=1 の pairs が 0 になり continue で skip される (L208)', () => {
    // 縮小のみ T=0 → s2=0 の multichoose(T,2)=H(0,2)=0、s2=1 の S*T=0 が 0 になり L208 で skip。
    // s2=2 も members の multichoose(0,0)=0 のため最終的に総数は 0 になる。
    const ctx = createSearchContext(buildInput({ candidates: shrinkUr, shrinkPairOnly: true }));
    expect(ctx.nonShrink.length).toBe(0);
    expect(ctx.shrink.length).toBe(3);
    expect(countCombos(ctx)).toBe(0);
  });
});

describe('countCombos / enumerate: 所持モードの上限フォールバック (L164, L182, L317)', () => {
  it('所持モード非縮小: ownedLimit に無い ID を含む構成でも数える', () => {
    // 1 種 5 枚所持 (非縮小) → 上限付き多重集合
    const fiveOwned = { [String(nonShrinkUr[0].ID)]: 5 };
    const ctx = createSearchContext(buildInput({ ownedOnly: true, ownedCounts: fiveOwned }));
    expect(countCombos(ctx)).toBe(testCandidates.length); // 1 編成 × フレンド全候補
  });

  it('所持×縮小2枚以上: センター縮小 + 縮小所持で総数 > 0 (L182)', () => {
    const ownedCounts = {
      [String(shrinkUr[0].ID)]: 3, // 縮小
      [String(shrinkUr[1].ID)]: 2, // 縮小
      [String(nonShrinkUr[0].ID)]: 1, // 非縮小
    };
    const ctx = createSearchContext(buildInput({ ownedOnly: true, shrinkPairOnly: true, ownedCounts }));
    expect(countCombos(ctx)).toBeGreaterThan(0);
    // 列挙の所持上限違反スキップ (L317) も通る: 各デッキの 5 枠が上限内
    let enumerated = 0;
    for (const chunk of generateChunks(ctx)) {
      for (const deck of enumerateChunkDecks(ctx, chunk)) {
        const usage = new Map<number, number>();
        for (let i = 0; i < 5; i++) usage.set(deck[i].ID!, (usage.get(deck[i].ID!) ?? 0) + 1);
        for (const [id, n] of usage) expect(n).toBeLessThanOrEqual(ownedCounts[String(id)] ?? 0);
        enumerated++;
      }
    }
    expect(enumerated).toBe(countCombos(ctx));
  });
});

describe('evaluateChunk: callbacks 無し経路 (L458, L468)', () => {
  it('onTick を渡さないチャンクは tick 分岐をスキップして完走する', async () => {
    const smallInput = buildInput({ candidates: [...shrinkUr.slice(0, 2), ...nonShrinkUr.slice(0, 2)] });
    const ctx = createSearchContext(smallInput);
    const chunk = [...generateChunks(ctx)][0];
    // yieldEvery を 1 にしても callbacks 自体が無いので onTick は呼ばれない (L458/L468 の callbacks?.onTick 偽側)
    const r = await evaluateChunk(ctx, chunk, undefined, 1);
    expect(r.aborted).toBe(false);
    expect(r.evaluated).toBeGreaterThan(0);
    expect(r.topK.length).toBeGreaterThan(0);
  });

  it('callbacks はあるが onTick 未定義でも完走する', async () => {
    const smallInput = buildInput({ candidates: [...shrinkUr.slice(0, 2), ...nonShrinkUr.slice(0, 2)] });
    const ctx = createSearchContext(smallInput);
    const chunk = [...generateChunks(ctx)][0];
    const r = await evaluateChunk(ctx, chunk, {}, 1);
    expect(r.aborted).toBe(false);
    expect(r.evaluated).toBeGreaterThan(0);
  });
});

describe('evaluateFriendSwap: 候補に無い ID のフォールバック (L484)', () => {
  it('bestCardIds の 5 枠目に候補外 ID を含めても null フォールバックで評価できる', () => {
    const ctx = createSearchContext(buildInput());
    const c = ctx.candidates;
    // フレンド枠 (index 5) に存在しない ID (-999) を入れる → byId.get → null フォールバック (L484)。
    // フレンド枠は evaluateFriendSwap 内で各候補に差し替えられるため null でも安全に評価できる。
    const fixedIds = [c[0].ID!, c[1].ID!, c[2].ID!, c[3].ID!, c[4].ID!, -999];
    const friends = evaluateFriendSwap(ctx, fixedIds);
    expect(friends.length).toBe(Math.min(5, c.length));
    for (let i = 1; i < friends.length; i++) {
      expect(friends[i].score).toBeLessThanOrEqual(friends[i - 1].score);
    }
  });
});
