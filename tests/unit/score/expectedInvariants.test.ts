import { describe, it, expect } from 'vitest';
import {
  calcExpectedScore, calcMaxScore, calcMinScore,
} from '../../../src/lib/score/simulation';
import type { ComputedTeam, CardSkill, FlatNote, DeckCard } from '../../../src/lib/score/types';

function makeNotes(n: number, excludedHead = 0): FlatNote[] {
  return Array.from({ length: n }, (_, i) => ({
    attribute: 'Shout' as const,
    type: 'white' as const,
    group: 'light_2', // LIGHT_MULTIPLIER = 1.0
    excluded: i < excludedHead,
  }));
}

function shrinkSkill(over: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0, skillType: 'shrink', originalType: '判定縮小スコアアップ',
    count: 20, per: 54, value: 5, rate: 1.6, isTimer: false, isShrink: true, spTime: 0,
    ...over,
  };
}

function makeTeam(skills: (CardSkill | null)[], appeal = 10007, duration = 100): ComputedTeam {
  const cards: DeckCard[] = skills.map((skill, i) => ({
    cardId: i + 1, cardID: i + 1, cardname: `c${i}`, name: `n${i}`, rarity: 'UR',
    attribute: 'Shout', shout_max: 0, beat_max: 0, melody_max: 0,
    skill: skill ? { ...skill, cardIndex: i } : null,
    broachShout: 0, broachBeat: 0, broachMelody: 0, slotIndex: i, bonusMultiplier: 1,
  }));
  return {
    Shout: appeal, Beat: appeal, Melody: appeal, cards, songDuration: duration,
    rawShout: appeal, rawBeat: appeal, rawMelody: appeal,
    broachShout: 0, broachBeat: 0, broachMelody: 0, broachScoreBonus: 0,
  } as ComputedTeam;
}

describe('期待値 ≤ 理論最大値の不変条件 (ADR 0036)', () => {
  it('縮小 rate 混在デッキでも expected ≤ max (監査 F1 の再現ケース)', () => {
    // rate1.6×1枚(count40) + rate1.2×4枚(count20)、100s/400ノーツ
    const team = makeTeam([
      shrinkSkill({ count: 40, rate: 1.6, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
    ]);
    const notes = makeNotes(400);
    const expected = calcExpectedScore(team, notes, 400).finalScore;
    const max = calcMaxScore(team, notes);
    const min = calcMinScore(team, notes);
    expect(expected).toBeLessThanOrEqual(max);
    expect(min).toBeLessThanOrEqual(expected);
  });

  it('期待カバー率が飽和する編成でも expected ≤ max (監査 F3 の再現ケース)', () => {
    // count=20/per=54/value=5/rate=1.6 ×5枚、100s/400ノーツ (実データ範囲内のパラメータ)
    const team = makeTeam(Array.from({ length: 5 }, () => shrinkSkill({})));
    const notes = makeNotes(400);
    expect(calcExpectedScore(team, notes, 400).finalScore)
      .toBeLessThanOrEqual(calcMaxScore(team, notes));
  });

  it('先頭除外つきの飽和編成でも expected ≤ max', () => {
    const team = makeTeam(Array.from({ length: 5 }, () => shrinkSkill({})));
    const notes = makeNotes(400, 20);
    expect(calcExpectedScore(team, notes, 400).finalScore)
      .toBeLessThanOrEqual(calcMaxScore(team, notes));
  });

  it('単一 rate・非飽和の編成では従来式と同値 (rate 加重の後方互換)', () => {
    // 縮小1枚: 期待カバー秒 = floor(400/20)×5×0.54 = 54秒 < capSeconds → キャップ非発動
    const team = makeTeam([shrinkSkill({}), null, null, null, null]);
    const notes = makeNotes(400);
    const e = calcExpectedScore(team, notes, 400);
    // 従来式: floor(eligibleBase × (1.6−1) × 期待カバー率) と一致すること
    // eligibleBase = 400 × floor(10007×0.025) = 400 × 250 = 100000
    // 期待カバー率 = 54 / 100 = 0.54 → shrinkExpected = floor(100000 × 0.6 × 0.54) = 32400
    expect(e.shrinkExpected).toBe(32400);
  });
});
