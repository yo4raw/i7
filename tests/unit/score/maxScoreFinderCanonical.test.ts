import { describe, it, expect } from 'vitest';

import {
  createSearchContext,
  countCombos,
  generateChunks,
  enumerateChunkDecks,
  evaluateDeck,
  isShrinkCard,
  multisetIndices,
  type SearchInput,
} from '../../../src/lib/score/maxScoreFinder';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { EventBonusTier } from '../../../src/lib/data/eventBonusTiers';
import { allCards, allBroachs, findSongById } from '../../fixtures';

// ADR 0080: 同じ 6 枚でセンターの属性が同じ編成は 1 回だけ評価する。
// センター/フレンドの入替対称はラビットノート・共通ブローチ割当がないときだけ使う。

const ur = allCards.filter((c) => c.rarity === 'UR' && c.ID !== null && c.ID !== undefined && c.ap_skill_type && c.attribute && c.name);

/** 属性・縮小有無を指定して、キャラクターが重複しないように候補を選ぶ */
function pickPool(spec: { attr: string; shrink: boolean }[]): Card[] {
  const names = new Set<string>();
  const out: Card[] = [];
  for (const s of spec) {
    const c = ur.find((x) => x.attribute === s.attr && isShrinkCard(x) === s.shrink && !names.has(x.name!) && !out.includes(x));
    if (!c) throw new Error(`候補が見つからない: ${JSON.stringify(s)}`);
    names.add(c.name!);
    out.push(c);
  }
  return out;
}

// 3 属性が揃い、縮小持ち 3 + 非縮小 4 の 7 枚
const pool = pickPool([
  { attr: 'Shout', shrink: true }, { attr: 'Beat', shrink: true }, { attr: 'Melody', shrink: true },
  { attr: 'Shout', shrink: false }, { attr: 'Beat', shrink: false }, { attr: 'Melody', shrink: false }, { attr: 'Melody', shrink: false },
]);
const song = findSongById(2);
const tiers: Record<string, EventBonusTier> = Object.fromEntries(pool.map((c) => [String(c.ID), 'gold' as EventBonusTier]));
/** 候補全キャラにラビットノートを登録した状態 */
const rabbitAll = Object.fromEntries(pool.map((c, i) => [c.name!, { shout: 300 + i * 90, beat: 200 + i * 70, melody: 100 + i * 50 }]));

function buildInput(overrides: Partial<SearchInput> = {}): SearchInput {
  return {
    evalMode: 'expected',
    ownedOnly: false,
    shrinkPairOnly: false,
    scoreOptions: { scoreUpAssist: false, scoreUpBadgeRate: 0 },
    candidates: pool,
    ownedCounts: {},
    song,
    broachs: allBroachs,
    tierByCardId: tiers,
    rabbitNotes: {},
    useOwnedBroachs: false,
    sharedBroachCounts: {},
    ...overrides,
  };
}

const ids = (cards: Card[]) => cards.map((c) => c.ID!).toSorted((a, b) => a - b).join(',');
/** 対称時の同値キー: 6 枚の多重集合 + {センター属性, フレンド属性} */
const symKey = (d: Card[]) => `${ids(d)}|${[d[0].attribute, d[5].attribute].toSorted().join('+')}`;
/** 非対称時の同値キー: スロット 0-4 の多重集合 + センター属性 + フレンド衣装 */
const asymKey = (d: Card[]) => `${ids(d.slice(0, 5))}|${d[0].attribute}|${d[5].ID}`;

/** 探索が実際に列挙するデッキ */
function enumerated(input: SearchInput): Card[][] {
  const ctx = createSearchContext(input);
  const decks: Card[][] = [];
  for (const chunk of generateChunks(ctx)) {
    for (const deck of enumerateChunkDecks(ctx, chunk)) decks.push([...deck]);
  }
  return decks;
}

/**
 * 参照値: 順序付き (センター, フレンド) × メンバー 4 多重集合を全列挙し、
 * モードの制約（縮小 2 枚以上 / 所持上限 / フレンドプール規則）だけを適用する。
 */
function reference(input: SearchInput): Card[][] {
  const pool5 = input.ownedOnly ? input.candidates.filter((c) => (input.ownedCounts[String(c.ID)] ?? 0) >= 1) : input.candidates;
  const decks: Card[][] = [];
  for (const center of pool5) {
    for (const m of multisetIndices(pool5.length, 4)) {
      const five = [center, ...m.map((i) => pool5[i])];
      if (input.ownedOnly) {
        const usage = new Map<number, number>();
        for (const c of five) usage.set(c.ID!, (usage.get(c.ID!) ?? 0) + 1);
        if ([...usage].some(([id, n]) => n > (input.ownedCounts[String(id)] ?? 0))) continue;
      }
      const shrink5 = five.filter((c) => isShrinkCard(c)).length;
      for (const friend of input.candidates) {
        if (input.shrinkPairOnly) {
          if (input.ownedOnly) {
            if (shrink5 < 2 && !isShrinkCard(friend)) continue;
          } else if (shrink5 + (isShrinkCard(friend) ? 1 : 0) < 2) continue;
        }
        decks.push([...five, friend]);
      }
    }
  }
  return decks;
}

function expectCanonicalCover(input: SearchInput, key: (d: Card[]) => string) {
  const decks = enumerated(input);
  const keys = decks.map((d) => key(d));
  // 同値クラスごとに 1 デッキだけ
  expect(new Set(keys).size).toBe(decks.length);
  // 全クラスを網羅する
  expect(new Set(keys)).toEqual(new Set(reference(input).map((d) => key(d))));
  // 表示する件数と一致する
  expect(countCombos(createSearchContext(input))).toBe(decks.length);
  return decks;
}

describe('createSearchContext.friendSymmetric', () => {
  it('ラビットノートも共通ブローチ割当もなければ対称', () => {
    expect(createSearchContext(buildInput()).friendSymmetric).toBe(true);
  });

  it('候補キャラにラビットノートがあれば非対称', () => {
    const one = { [pool[3].name!]: { shout: 100, beat: 0, melody: 0 } };
    expect(createSearchContext(buildInput({ rabbitNotes: one })).friendSymmetric).toBe(false);
  });

  it('候補外キャラのラビットノートや値 0 の登録は対称性を壊さない', () => {
    const zero = { [pool[3].name!]: { shout: 0, beat: 0, melody: 0 }, 'いないキャラ': { shout: 500, beat: 500, melody: 500 } };
    expect(createSearchContext(buildInput({ rabbitNotes: zero })).friendSymmetric).toBe(true);
  });

  it('所持共通ブローチ割当が有効なら非対称', () => {
    expect(createSearchContext(buildInput({ useOwnedBroachs: true, sharedBroachCounts: { '1': 1 } })).friendSymmetric).toBe(false);
  });
});

describe('列挙の重複排除（対称時）', () => {
  it('通常モード: 6 枚 + {センター属性, フレンド属性} ごとに 1 デッキ', () => {
    const decks = expectCanonicalCover(buildInput(), symKey);
    // 同じ 6 枚で属性ペアが違う編成は残る
    const by6 = new Map<string, Set<string>>();
    for (const d of decks) {
      const k = ids(d);
      if (!by6.has(k)) by6.set(k, new Set());
      by6.get(k)!.add(symKey(d));
    }
    expect([...by6.values()].some((s) => s.size >= 2)).toBe(true);
  });

  it('縮小 2 枚以上条件でも同じ規則で 1 デッキずつ', () => {
    const decks = expectCanonicalCover(buildInput({ shrinkPairOnly: true }), symKey);
    for (const d of decks) expect(d.filter((c) => isShrinkCard(c)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('列挙の重複排除（非対称時）', () => {
  it('ラビットノートあり: (センター, フレンド) を順序付きで列挙し、センター属性ごとに 1 デッキ', () => {
    const decks = expectCanonicalCover(buildInput({ rabbitNotes: rabbitAll }), asymKey);
    // 同じ 2 枚を入れ替えた両方の並びが評価される
    const a = pool[3], b = pool[4];
    const hasOrder = (c: Card, f: Card) => decks.some((d) => d[0] === c && d[5] === f);
    expect(hasOrder(a, b)).toBe(true);
    expect(hasOrder(b, a)).toBe(true);
  });

  it('ラビットノートあり × 縮小 2 枚以上条件', () => {
    expectCanonicalCover(buildInput({ rabbitNotes: rabbitAll, shrinkPairOnly: true }), asymKey);
  });

  it('所持衣装検索: スロット 0-4 の多重集合 + センター属性 + フレンドごとに 1 デッキ', () => {
    const ownedCounts = { [String(pool[0].ID)]: 2, [String(pool[1].ID)]: 1, [String(pool[3].ID)]: 3, [String(pool[4].ID)]: 1 };
    expectCanonicalCover(buildInput({ ownedOnly: true, ownedCounts }), asymKey);
  });

  it('所持衣装検索 × 縮小 2 枚以上条件', () => {
    const ownedCounts = { [String(pool[0].ID)]: 2, [String(pool[1].ID)]: 1, [String(pool[3].ID)]: 3, [String(pool[4].ID)]: 1 };
    expectCanonicalCover(buildInput({ ownedOnly: true, shrinkPairOnly: true, ownedCounts }), asymKey);
  });
});

function bestOf(input: SearchInput, decks: Card[][]): number {
  const ctx = createSearchContext(input);
  return Math.max(...decks.map((d) => evaluateDeck(ctx, d).score));
}

describe('最良スコアの保存（実エンジン評価）', () => {
  // 評価コストを抑えるため 5 枚（Shout 2 / Beat 1 / Melody 2）
  const small = pickPool([
    { attr: 'Beat', shrink: true }, { attr: 'Shout', shrink: false }, { attr: 'Melody', shrink: false },
    { attr: 'Shout', shrink: true }, { attr: 'Melody', shrink: true },
  ]);
  const smallTiers: Record<string, EventBonusTier> = Object.fromEntries(small.map((c) => [String(c.ID), 'gold' as EventBonusTier]));
  // 位置が最後の衣装のキャラだけ大きなラビットノート → フレンド枠に置くと損をする
  const rabbitLast = { [small[4].name!]: { shout: 2000, beat: 2000, melody: 2000 } };

  it('対称時: 重複排除しても最良スコアは全順序デッキの総当たりと一致する', () => {
    const input = buildInput({ candidates: small, tierByCardId: smallTiers });
    expect(bestOf(input, enumerated(input))).toBe(bestOf(input, reference(input)));
  });

  it('ラビットノートあり: 最良スコアは全順序デッキの総当たりと一致する', () => {
    const input = buildInput({ candidates: small, tierByCardId: smallTiers, rabbitNotes: rabbitLast });
    expect(bestOf(input, enumerated(input))).toBe(bestOf(input, reference(input)));
  });
});
