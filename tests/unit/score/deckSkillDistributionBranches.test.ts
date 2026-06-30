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
    shout_max: 0,
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

/** センター(0)・フレンド(5)・メンバー(1-4) をすべて含むフルチームを組む */
function fullTeam(cards: DeckCard[]): ComputedTeam {
  const sum = (f: (c: DeckCard) => number) => cards.reduce((s, c) => s + f(c), 0);
  const rawShout = sum((c) => c.shout_max);
  const rawBeat = sum((c) => c.beat_max);
  const rawMelody = sum((c) => c.melody_max);
  const broachShout = sum((c) => c.broachShout);
  const broachBeat = sum((c) => c.broachBeat);
  const broachMelody = sum((c) => c.broachMelody);
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

describe('buildDeckSkillDistribution: 属性別 baseByAttr とセンター/フレンドボーナス', () => {
  it('Beat/Melody センター/フレンドのセンタースキル分を計上する (L46-49, L52, L55, L65, L66)', () => {
    // センターを Beat、フレンドを Melody にして baseByAttr の Beat/Melody 分岐を通す
    const center = card({ slotIndex: 0, attribute: 'Beat', beat_max: 2000 });
    const member = card({ slotIndex: 1, attribute: 'Melody', melody_max: 1000 });
    const friend = card({ slotIndex: 5, attribute: 'Melody', melody_max: 1500 });
    const team = fullTeam([center, member, friend]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);

    const e0 = entries.find((e) => e.slotIndex === 0)!;
    const e5 = entries.find((e) => e.slotIndex === 5)!;
    // センター/フレンドの effectiveAppeal は自カード属性値 + センタースキルボーナス分だけ
    // メンバー (ボーナスなし) より底上げされている
    const eMember = entries.find((e) => e.slotIndex === 1)!;
    expect(e0.effectiveAppeal).toBeGreaterThan(center.beat_max);
    expect(e5.effectiveAppeal).toBeGreaterThan(friend.melody_max);
    expect(eMember.effectiveAppeal).toBe(member.melody_max); // ボーナス対象外
    // 貢献比率の総和は 1
    const sum = entries.reduce((s, e) => s + e.contribRatio, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('Shout センターでも baseByAttr の Shout 分岐とボーナス加算が効く', () => {
    const center = card({ slotIndex: 0, attribute: 'Shout', shout_max: 3000 });
    const friend = card({ slotIndex: 5, attribute: 'Shout', shout_max: 3000 });
    const team = fullTeam([center, friend]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    const e0 = entries.find((e) => e.slotIndex === 0)!;
    expect(e0.effectiveAppeal).toBeGreaterThan(3000);
  });
});

describe('buildDeckSkillDistribution: totalBase=0 のゼロ除算回避 (L80)', () => {
  it('全カードの属性値が 0 なら contribRatio はすべて 0', () => {
    const team = fullTeam([
      card({ slotIndex: 0, attribute: 'Shout', shout_max: 0 }),
      card({ slotIndex: 1, attribute: 'Shout', shout_max: 0 }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.contribRatio).toBe(0);
  });
});

describe('buildDeckSkillDistribution: n=0 / value=0 で単一スパイク (#15)', () => {
  it('notesCount=0 (n=0) のスキル持ちは 0 起点の単一スパイク', () => {
    const team = fullTeam([
      card({ slotIndex: 1, attribute: 'Shout', shout_max: 1000, skill: skill({ count: 10, value: 1000 }) }),
    ]);
    // notesCount=0 → calcCardSkillMaxActivations は 0 → points は初期 [{x:0,prob:1}] のまま
    const entries = buildDeckSkillDistribution(team, 0, NO_OPT);
    const e = entries.find((e) => e.slotIndex === 1)!;
    expect(e.skillGroup).toBe('scoreUp');
    expect(e.points).toEqual([{ x: 0, prob: 1 }]);
  });

  it('value=0 のスキル持ちも単一スパイク', () => {
    const team = fullTeam([
      card({ slotIndex: 1, attribute: 'Shout', shout_max: 1000, skill: skill({ count: 10, value: 0 }) }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    const e = entries.find((e) => e.slotIndex === 1)!;
    expect(e.points).toEqual([{ x: 0, prob: 1 }]);
  });
});
