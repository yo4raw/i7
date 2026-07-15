import { describe, it, expect } from 'vitest';
import { buildDeckSkillDistribution } from '../../../src/lib/score/deckSkillDistribution';
import type { ComputedTeam, DeckCard, CardSkill } from '../../../src/lib/score/types';

function skill(partial: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0,
    skillType: 'scoreUp',
    originalType: '',
    count: 10,
    per: 50,
    value: 1000,
    rate: 0,
    isTimer: false,
    isShrink: false,
    spTime: 0,
    ...partial,
  };
}

function card(partial: Partial<DeckCard>): DeckCard {
  return {
    cardId: 1,
    cardID: 1,
    cardname: 'テスト衣装',
    name: 'キャラ',
    rarity: 'UR',
    attribute: 'Shout',
    shout_max: 1000,
    beat_max: 0,
    melody_max: 0,
    skill: null,
    broachShout: 0,
    broachBeat: 0,
    broachMelody: 0,
    slotIndex: 1,
    bonusMultiplier: 1,
    ...partial,
  } as DeckCard;
}

/** センター/フレンドを持たない（slot 1-4 のみ）メンバーのみチームを作る */
function membersTeam(cards: DeckCard[]): ComputedTeam {
  const rawShout = cards.reduce((s, c) => s + c.shout_max, 0);
  const rawBeat = cards.reduce((s, c) => s + c.beat_max, 0);
  const rawMelody = cards.reduce((s, c) => s + c.melody_max, 0);
  const broachShout = cards.reduce((s, c) => s + c.broachShout, 0);
  const broachBeat = cards.reduce((s, c) => s + c.broachBeat, 0);
  const broachMelody = cards.reduce((s, c) => s + c.broachMelody, 0);
  return {
    Shout: rawShout + broachShout,
    Beat: rawBeat + broachBeat,
    Melody: rawMelody + broachMelody,
    cards,
    songDuration: 120,
    rawShout, rawBeat, rawMelody,
    broachShout, broachBeat, broachMelody,
    broachScoreBonus: 0,
  } as ComputedTeam;
}

const NO_OPT = { scoreUpAssist: false, scoreUpBadgeRate: 0 };

describe('buildDeckSkillDistribution', () => {
  it('scoreUp 衣装の分布点の確率総和は 1、skillGroup は scoreUp', () => {
    const team = membersTeam([card({ slotIndex: 1, skill: skill({ count: 10, per: 50, value: 1000 }) })]);
    const [e] = buildDeckSkillDistribution(team, 100, NO_OPT); // n = floor(100/10) = 10
    expect(e.skillGroup).toBe('scoreUp');
    expect(e.n).toBe(10);
    expect(e.p).toBeCloseTo(0.5);
    const sum = e.points.reduce((s, pt) => s + pt.prob, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(e.points[0].x).toBe(0);
    expect(e.points.at(-1)!.x).toBe(10 * 1000);
  });

  it('貢献比率の総和は 1', () => {
    const team = membersTeam([
      card({ slotIndex: 1, shout_max: 1000 }),
      card({ slotIndex: 2, shout_max: 3000 }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    const sum = entries.reduce((s, e) => s + e.contribRatio, 0);
    expect(sum).toBeCloseTo(1, 6);
    const map = new Map(entries.map(e => [e.slotIndex, e.contribRatio]));
    expect(map.get(1)).toBeCloseTo(0.25, 6);
    expect(map.get(2)).toBeCloseTo(0.75, 6);
  });

  it('係数なしのとき実効属性値の合計はチーム合計属性値に一致', () => {
    const team = membersTeam([
      card({ slotIndex: 1, shout_max: 1000, broachShout: 200 }),
      card({ slotIndex: 2, beat_max: 1500 }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    const total = entries.reduce((s, e) => s + e.effectiveAppeal, 0);
    expect(total).toBe(team.Shout + team.Beat + team.Melody);
  });

  it('スキルなし/判定補助系は skillGroup=none で 0 起点の単一スパイク', () => {
    const team = membersTeam([card({ slotIndex: 1, skill: null })]);
    const [e] = buildDeckSkillDistribution(team, 100, NO_OPT);
    expect(e.skillGroup).toBe('none');
    expect(e.points).toEqual([{ x: 0, prob: 1 }]);
  });

  it('スコアアップ系と縮小系が混在すると group が分かれる', () => {
    const team = membersTeam([
      card({ slotIndex: 1, skill: skill({ isShrink: false, value: 1000 }) }),
      card({ slotIndex: 2, skill: skill({ isShrink: true, value: 2 }) }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    expect(entries.find(e => e.slotIndex === 1)!.skillGroup).toBe('scoreUp');
    expect(entries.find(e => e.slotIndex === 2)!.skillGroup).toBe('shrink');
  });

  it('アシスト/バッジは実効属性値を倍率で底上げするが貢献比率は不変', () => {
    const cards = [
      card({ slotIndex: 1, shout_max: 1000 }),
      card({ slotIndex: 2, shout_max: 1000 }),
    ];
    const team = membersTeam(cards);
    const base = buildDeckSkillDistribution(team, 100, NO_OPT);
    const boosted = buildDeckSkillDistribution(team, 100, { scoreUpAssist: true, scoreUpBadgeRate: 16 });
    // 比率は不変
    expect(boosted[0].contribRatio).toBeCloseTo(base[0].contribRatio, 6);
    // 実効属性値は 1.2 × 1.16 倍
    expect(boosted[0].effectiveAppeal).toBe(Math.round(base[0].effectiveAppeal * 1.2 * 1.16));
  });
});
