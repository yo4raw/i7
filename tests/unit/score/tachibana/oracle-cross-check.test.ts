import { describe, it, expect } from 'vitest';

import type { Card } from '../../../../src/lib/data/fetchCardsJson';
import { computeTeam } from '../../../../src/lib/score/engine';
import { computeTachibanaResult, TACHIBANA_DEFAULT_OPTIONS, type TachibanaOptions } from '../../../../src/lib/score/tachibana';
import { findCardById, findSongById, findBroachsByCardId } from '../../../fixtures';
import { computeTachibanaOracle } from './spreadsheet-oracle';

/**
 * オラクル (シート式の 1:1 トランスクリプション) と本実装 (engine) のクロスチェック。
 * 両者は実装構造が異なるため、同一の入力に対して同一の出力を返すことで
 * 互いに正しさを補強する。
 */

const card2237 = findCardById(2237); // 百[記念日2024] Beat 判定縮小Perfect
const card1805 = findCardById(1805); // 百[7th Anniversary] Beat スコアアップコンボ
const card1488 = findCardById(1488); // 千[記念日2021] Beat スコアアップPerfect
const card1487 = findCardById(1487); // 百[記念日2021] Melody スコアアップコンボ
const card1806 = findCardById(1806); // 千[7th Anniversary] Shout BAD→Perfect（スコア寄与なし）
const card408 = findCardById(408);   // 和泉三月[屋外フェス2] Melody スコアアップタイマー
const card411 = findCardById(411);   // 六弥ナギ[屋外フェス2] Melody スコアアップタイマー
const card528 = findCardById(528);   // 和泉一織[ユニット2] Melody スコアアップタイマー
const card529 = findCardById(529);   // 七瀬陸[ユニット2] Melody スコアアップタイマー
const card574 = findCardById(574);   // 四葉環[ユニット2] Melody スコアアップタイマー

const binaryVampire = findSongById(60);             // Re:vale / 461 / 92s / Melody 偏重
const monsterGenerationSong = findSongById(2);      // Beat 偏重

const broachs1805 = findBroachsByCardId(1805);

function buildOptions(overrides: Partial<TachibanaOptions> = {}): TachibanaOptions {
  return { ...TACHIBANA_DEFAULT_OPTIONS, ...overrides };
}

function runBoth(deck: (Card | null)[], song: Parameters<typeof computeTeam>[2], options: TachibanaOptions, params: {
  bonusTiers?: Parameters<typeof computeTeam>[3];
  trained?: Parameters<typeof computeTeam>[4];
  broachs?: Parameters<typeof computeTeam>[1];
} = {}) {
  const team = computeTeam(
    deck,
    params.broachs ?? [],
    song,
    params.bonusTiers,
    params.trained,
    undefined,
    undefined,
    [5, 5, 5, 5, 5, 5],
    {},
  );
  const oracle = computeTachibanaOracle(team, song, options);
  const engine = computeTachibanaResult(team, song, options);
  return { oracle, engine };
}

function expectMatch(label: string, oracle: ReturnType<typeof computeTachibanaResult>, engine: ReturnType<typeof computeTachibanaResult>) {
  expect.soft(engine.attributeScore, `${label}: attributeScore`).toBe(oracle.attributeScore);
  expect.soft(engine.scoreUpScore,   `${label}: scoreUpScore`).toBe(oracle.scoreUpScore);
  expect.soft(engine.shrinkScore,    `${label}: shrinkScore`).toBe(oracle.shrinkScore);
  expect.soft(engine.liveEndScore,   `${label}: liveEndScore`).toBe(oracle.liveEndScore);
  expect.soft(engine.finalScore,     `${label}: finalScore`).toBe(oracle.finalScore);
  expect.soft(engine.shrinkCoverage, `${label}: shrinkCoverage`).toBeCloseTo(oracle.shrinkCoverage, 6);
  for (let i = 0; i < 6; i++) {
    expect.soft(engine.cards[i].attributeScore, `${label}: cards[${i}].attributeScore`).toBe(oracle.cards[i].attributeScore);
    expect.soft(engine.cards[i].scoreUpScore,   `${label}: cards[${i}].scoreUpScore`).toBe(oracle.cards[i].scoreUpScore);
    expect.soft(engine.cards[i].shrinkScore,    `${label}: cards[${i}].shrinkScore`).toBe(oracle.cards[i].shrinkScore);
  }
}

describe('oracle 自体の正しさ (公開シート参照値の再現)', () => {
  const deck: (Card | null)[] = [card2237, card2237, card1805, card1488, card1488, card1488];
  const opts = buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 });
  const { oracle } = runBoth(deck, binaryVampire, opts, {
    bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
    trained:    [true, true, true, true, true, true],
    broachs:    broachs1805,
  });
  it('オラクル単体: 属性値 1,876,289 / SU 747,118 / 縮小 938,144 / 最終 4,131,399', () => {
    expect(oracle.attributeScore).toBe(1876289);
    expect(oracle.scoreUpScore).toBe(747118);
    expect(oracle.shrinkScore).toBe(938144);
    expect(oracle.liveEndScore).toBe(3561551);
    expect(oracle.finalScore).toBe(4131399);
  });
});

describe('engine ↔ oracle クロスチェック: 公開シートデッキ × オプション組み合わせ', () => {
  const deck: (Card | null)[] = [card2237, card2237, card1805, card1488, card1488, card1488];
  const params = {
    bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'] as Parameters<typeof computeTeam>[3],
    trained:    [true, true, true, true, true, true],
    broachs:    broachs1805,
  };

  const cases: { label: string; opts: Partial<TachibanaOptions> }[] = [
    { label: '特効 OFF / バッジ 0%',                opts: { specialEffectActive: false, scoreUpBadgeRate: 0 } },
    { label: '特効 OFF / バッジ 16%',               opts: { specialEffectActive: false, scoreUpBadgeRate: 16 } },
    { label: '特効 ON / バッジ 0%',                 opts: { specialEffectActive: true,  scoreUpBadgeRate: 0 } },
    { label: '特効 ON / バッジ 30%',                opts: { specialEffectActive: true,  scoreUpBadgeRate: 30 } },
    { label: 'スコアアップフル発動 OFF',            opts: { scoreUpFullActivation: false } },
    { label: 'スコアアップ確率UP ON / 値10%',       opts: { scoreUpFullActivation: false, scoreUpProbabilityBoost: true, scoreUpProbabilityBoostValue: 10 } },
    { label: 'スコアアップ確率UP ON / 値25%',       opts: { scoreUpFullActivation: false, scoreUpProbabilityBoost: true, scoreUpProbabilityBoostValue: 25 } },
    { label: '縮小フル発動 OFF',                    opts: { shrinkFullActivation: false } },
    { label: '20ノーツ加算なし ON',                 opts: { specialEffectActive: true, excludeNotes20: true, scoreUpBadgeRate: 16 } },
    { label: '全オプション OFF (素の確率ベース)',    opts: { scoreUpFullActivation: false, shrinkFullActivation: false, specialEffectActive: false, scoreUpBadgeRate: 0 } },
  ];

  for (const { label, opts } of cases) {
    it(label, () => {
      const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions(opts), params);
      expectMatch(label, oracle, engine);
    });
  }
});

describe('engine ↔ oracle クロスチェック: 特効ティアごと', () => {
  const deck: (Card | null)[] = [card2237, card2237, card1805, card1488, card1488, card1488];
  const tiers: Parameters<typeof computeTeam>[3][] = [
    ['none',   'none',   'none',   'none',   'none',   'none'],
    ['bronze', 'bronze', 'bronze', 'bronze', 'bronze', 'bronze'],
    ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
    ['gold',   'gold',   'gold',   'gold',   'gold',   'gold'],
    ['gold',   'silver', 'bronze', 'none',   'silver', 'gold'], // ミックス
  ];
  for (const t of tiers) {
    it(`特効ティア = [${t!.join(',')}]`, () => {
      const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
        bonusTiers: t,
        trained:    [true, true, true, true, true, true],
        broachs:    broachs1805,
      });
      expectMatch(`tiers=${t!.join(',')}`, oracle, engine);
    });
  }
});

describe('engine ↔ oracle クロスチェック: 未特訓カードを含む', () => {
  const deck: (Card | null)[] = [card2237, card2237, card1805, card1488, card1488, card1488];
  it('全カード未特訓 / 銀特効 / バッジ16%', () => {
    const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
      bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
      trained:    [false, false, false, false, false, false],
      broachs:    broachs1805,
    });
    expectMatch('全カード未特訓', oracle, engine);
  });
});

describe('engine ↔ oracle クロスチェック: 異なるデッキ構成', () => {
  it('縮小スキルなしデッキ (千記念2021 × 6)', () => {
    const deck: (Card | null)[] = [card1488, card1488, card1488, card1488, card1488, card1488];
    const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
      bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
      trained:    [true, true, true, true, true, true],
    });
    expectMatch('縮小なし', oracle, engine);
    expect(engine.shrinkScore).toBe(0);
  });

  it('スコアアップスキルなしデッキ (百記念2024 × 6 / 全員 判定縮小Perfect)', () => {
    const deck: (Card | null)[] = [card2237, card2237, card2237, card2237, card2237, card2237];
    const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
      bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
      trained:    [true, true, true, true, true, true],
    });
    expectMatch('スコアアップなし', oracle, engine);
    expect(engine.scoreUpScore).toBe(0);
  });

  it('スキル寄与なしカード (BAD→Perfect) を含む', () => {
    const deck: (Card | null)[] = [card1806, card2237, card1805, card1488, card1488, card1488];
    const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
      bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
      trained:    [true, true, true, true, true, true],
    });
    expectMatch('BAD→Perfect カード混在', oracle, engine);
    // card1806 (BAD→Perfect) はスコア寄与なし
    expect(engine.cards[0].scoreUpScore).toBe(0);
    expect(engine.cards[0].shrinkScore).toBe(0);
  });

  it('タイマースキルカードを含む混成デッキ', () => {
    // タイマースキルは秒数ベース (D9) で計算される。固定縮小カードは Perfect/コンボ系のままノーツベース。
    const deck: (Card | null)[] = [card408, card411, card528, card529, card574, card2237];
    const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
      bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
      trained:    [true, true, true, true, true, true],
    });
    expectMatch('タイマースキル混在', oracle, engine);
  });

  it('別属性主体デッキ (Melody 百記念2021)', () => {
    // 百記念2021 は Melody 属性 + コンボスキル
    const deck: (Card | null)[] = [card1487, card1487, card1487, card1487, card1487, card1487];
    const { oracle, engine } = runBoth(deck, binaryVampire, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
      bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
      trained:    [true, true, true, true, true, true],
    });
    expectMatch('Melody デッキ', oracle, engine);
  });
});

describe('engine ↔ oracle クロスチェック: 異なる楽曲', () => {
  const deck: (Card | null)[] = [card2237, card2237, card1805, card1488, card1488, card1488];
  it('MONSTER GENERATiON (Beat 偏重楽曲)', () => {
    const { oracle, engine } = runBoth(deck, monsterGenerationSong, buildOptions({ specialEffectActive: true, scoreUpBadgeRate: 16 }), {
      bonusTiers: ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'],
      trained:    [true, true, true, true, true, true],
      broachs:    broachs1805,
    });
    expectMatch('MONSTER GENERATiON', oracle, engine);
  });
});
