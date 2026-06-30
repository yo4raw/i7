import { describe, it, expect } from 'vitest';
import type { CardSkill, ComputedTeam, DeckCard, FlatNote } from '../../../src/lib/score/types';
import { SKILL_TYPE } from '../../../src/lib/data/fetchCardsJson';
import {
  calcExpectedScore,
  calcCardSkillExpected,
  calcCardSkillMax,
  calcCardSkillMaxActivations,
  calcMaxScore,
  calcMinScore,
  runSimulation,
} from '../../../src/lib/score/engine';

/**
 * simulation.ts のガード分岐・エッジ分岐を直接 ComputedTeam / FlatNote を組み立てて網羅する。
 * 値の正しさは小さな手計算ケースで検証する（範囲チェックではなく決定値）。
 */

function skill(partial: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0,
    skillType: 'scoreUp',
    originalType: 'スコアアップ',
    count: 10,
    per: 50,
    value: 100,
    rate: 0,
    isTimer: false,
    isShrink: false,
    spTime: 0,
    ...partial,
  };
}

function shrinkSkill(partial: Partial<CardSkill> = {}): CardSkill {
  return skill({
    skillType: 'shrink',
    originalType: SKILL_TYPE.SHRINK,
    isShrink: true,
    rate: 1.4,
    value: 4,
    per: 40,
    count: 10,
    ...partial,
  });
}

function makeCard(s: CardSkill | null, slotIndex: number): DeckCard {
  return {
    cardId: 0, cardID: 0, cardname: `c${slotIndex}`, name: '',
    rarity: 'UR', attribute: 'Shout',
    shout_max: 0, beat_max: 0, melody_max: 0,
    broachShout: 0, broachBeat: 0, broachMelody: 0,
    slotIndex, bonusMultiplier: 1,
    skill: s,
  };
}

function makeTeam(skills: (CardSkill | null)[], songDuration = 104): ComputedTeam {
  return {
    Shout: 1000, Beat: 0, Melody: 0,
    cards: skills.map((s, i) => makeCard(s, i)),
    songDuration,
    rawShout: 1000, rawBeat: 0, rawMelody: 0,
    broachShout: 0, broachBeat: 0, broachMelody: 0,
    broachScoreBonus: 0,
  };
}

/** すべて Shout / white の単純ノート列 */
function plainNotes(count: number, group = 'light_2'): FlatNote[] {
  return Array.from({ length: count }, (): FlatNote => ({
    attribute: 'Shout', type: 'white', group, excluded: false,
  }));
}

describe('simulation: ガード分岐（count<=0 / denom<=0 / 空ノート）', () => {
  it('calcCardSkillMaxActivations: count<=0 のスキルは 0', () => {
    // L429-430 経由ではなく count>0 必須。count=0 → dc.skill.count<=0 で 0 を返す
    const team = makeTeam([skill({ count: 0 }), null, null, null, null, null]);
    expect(calcCardSkillMaxActivations(team, 100, 0)).toBe(0);
  });

  it('calcCardSkillMaxActivations: 通常スキルで denom(notesCount)<=0 のとき 0 (L433 path)', () => {
    const team = makeTeam([skill({ count: 5, isTimer: false }), null, null, null, null, null]);
    expect(calcCardSkillMaxActivations(team, 0, 0)).toBe(0);
  });

  it('calcCardSkillMaxActivations: 通常スキルは floor(notesCount/count)', () => {
    const team = makeTeam([skill({ count: 10 }), null, null, null, null, null]);
    expect(calcCardSkillMaxActivations(team, 95, 0)).toBe(9);
  });

  it('calcCardSkillExpected: 縮小スキルで effectiveSeconds<=0 のとき 0 (L398 path)', () => {
    // songDuration=0 → effectiveSeconds = 0 - 0 = 0 → <=0
    const team = makeTeam([shrinkSkill({ count: 5 }), null, null, null, null, null], 0);
    const notes = plainNotes(20);
    expect(calcCardSkillExpected(team, notes, 20, 0)).toBe(0);
  });

  it('calcCardSkillExpected: 縮小スキルで numActivations<=0 のとき 0 (L400 path)', () => {
    // eligible(notes 20 - excluded 0)=20, count=50 → floor(20/50)=0
    const team = makeTeam([shrinkSkill({ count: 50 }), null, null, null, null, null]);
    const notes = plainNotes(20);
    expect(calcCardSkillExpected(team, notes, 20, 0)).toBe(0);
  });

  it('calcCardSkillMax: 縮小スキルで effectiveSeconds<=0 のとき 0 (L459 path)', () => {
    const team = makeTeam([shrinkSkill({ count: 5 }), null, null, null, null, null], 0);
    const notes = plainNotes(20);
    expect(calcCardSkillMax(team, notes, 20, 0)).toBe(0);
  });

  it('calcCardSkillMax: 縮小スキルで numActivations<=0 のとき 0 (L461 path)', () => {
    const team = makeTeam([shrinkSkill({ count: 50 }), null, null, null, null, null]);
    const notes = plainNotes(20);
    expect(calcCardSkillMax(team, notes, 20, 0)).toBe(0);
  });
});

describe('simulation: calcExpectedScore のスキップ分岐', () => {
  it('縮小スキルは scoreUpExpected の加算対象外 (L332 path: skill.isShrink で continue)', () => {
    // 縮小スキルのみのデッキ: scoreUpExpected は 0 になる
    const team = makeTeam([shrinkSkill({ count: 10, per: 40, value: 4 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = calcExpectedScore(team, notes, 40);
    expect(r.scoreUpExpected).toBe(0);
  });

  it('count<=0 のスコアアップスキルは scoreUpExpected に寄与しない (L334 path)', () => {
    const team = makeTeam([skill({ count: 0, value: 100, per: 50 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = calcExpectedScore(team, notes, 40);
    expect(r.scoreUpExpected).toBe(0);
  });

  it('count>0 のスコアアップスキルは floor(notesCount/count)*per/100*value', () => {
    const team = makeTeam([skill({ count: 10, value: 100, per: 50 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = calcExpectedScore(team, notes, 40);
    // floor(40/10)=4 回 × 0.5 × 100 = 200
    expect(r.scoreUpExpected).toBe(200);
  });

  it('denom(notesCount)<=0 のスコアアップスキルは寄与しない (L334 path)', () => {
    // count>0 だが notesCount=0 (非タイマー) → denom<=0 で continue
    const team = makeTeam([skill({ count: 10, value: 100, per: 50, isTimer: false }), null, null, null, null, null]);
    const r = calcExpectedScore(team, [], 0);
    expect(r.scoreUpExpected).toBe(0);
  });
});

describe('simulation: calcMaxScore / calcMinScore の空・縮小分岐', () => {
  it('空ノート列では minScore = broachScoreBonus 加算済みの基礎のみ', () => {
    const team = makeTeam([null, null, null, null, null, null]);
    expect(calcMinScore(team, [])).toBe(0);
    expect(calcMaxScore(team, [])).toBe(0);
  });

  it('calcMaxScore: 通常スコアアップ skill.count<=0 はスキップされる (L276 path)', () => {
    // count=0 のスキルを混ぜても score は count>0 のスキルのみ反映
    const teamZero = makeTeam([skill({ count: 0, value: 9999 }), null, null, null, null, null]);
    const teamNone = makeTeam([null, null, null, null, null, null]);
    const notes = plainNotes(40);
    expect(calcMaxScore(teamZero, notes)).toBe(calcMaxScore(teamNone, notes));
  });
});

describe('runSimulation: 統計・cardStats 分岐', () => {
  it('seed 省略時も実行できる (L639 path: seed ?? Date.now())', async () => {
    const team = makeTeam([skill({ count: 10, value: 100, per: 50 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = await runSimulation(team, notes, 4, undefined, undefined);
    expect(r.scores.length).toBe(4);
  });

  it('偶数試行回数では median が中央 2 値の平均 (L667 偶数 path)', async () => {
    const team = makeTeam([skill({ count: 10, value: 100, per: 50 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = await runSimulation(team, notes, 4, undefined, 42);
    const sorted = [...r.scores].sort((a, b) => a - b);
    const expectedMedian = Math.round((sorted[1] + sorted[2]) / 2);
    expect(r.median).toBe(expectedMedian);
  });

  it('奇数試行回数では median が中央 1 値 (L667 奇数 path)', async () => {
    const team = makeTeam([skill({ count: 10, value: 100, per: 50 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = await runSimulation(team, notes, 3, undefined, 42);
    expect(r.scores.length).toBe(3);
    const sorted = [...r.scores].sort((a, b) => a - b);
    expect(r.median).toBe(Math.round(sorted[1]));
  });

  it('cardStats skillType: タイマー型スコアアップ (originalType=null → timerScoreUp 分岐)', async () => {
    // originalType を null にして fallback ternary に入らせ、skillType='timerScoreUp' を選択
    const timerScoreUp = skill({
      skillType: 'timerScoreUp', originalType: null,
      isTimer: true, count: 16, value: 7200, per: 47,
    });
    const team = makeTeam([timerScoreUp, null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = await runSimulation(team, notes, 4, undefined, 42);
    const stat = r.cardStats.find(s => s.cardIndex === 0);
    expect(stat).toBeDefined();
    expect(stat!.skillType).toBe(SKILL_TYPE.SCOREUP_TIMER);
  });

  it('cardStats skillType: 縮小型 (originalType=null → isShrink 分岐 → SHRINK)', async () => {
    const sh = shrinkSkill({ originalType: null, count: 10, value: 4, per: 40 });
    const team = makeTeam([sh, null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = await runSimulation(team, notes, 4, undefined, 42);
    const stat = r.cardStats.find(s => s.cardIndex === 0);
    expect(stat!.skillType).toBe(SKILL_TYPE.SHRINK);
  });

  it('cardStats skillType: 通常スコアアップ (originalType=null → 末尾 スコアアップ 分岐)', async () => {
    const su = skill({ skillType: 'scoreUp', originalType: null, isShrink: false, isTimer: false, count: 10, value: 100, per: 50 });
    const team = makeTeam([su, null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = await runSimulation(team, notes, 4, undefined, 42);
    const stat = r.cardStats.find(s => s.cardIndex === 0);
    expect(stat!.skillType).toBe('スコアアップ');
  });

  it('runOnce: 通常スコアアップ count<=0 はスキップ (Phase B L578 path)', async () => {
    const teamZero = makeTeam([skill({ count: 0, value: 9999, per: 100 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    const r = await runSimulation(teamZero, notes, 4, undefined, 42);
    // count<=0 のスキルは発動せず scoreUpScores は全て 0
    expect(r.scoreUpScores.every(s => s === 0)).toBe(true);
  });
});

describe('simulation: タイマースキルの noteIndex<0 分岐 (songDuration<=0)', () => {
  it('calcMaxScore: タイマー型でも songDuration=0 のとき maxAct=0 で寄与なし', () => {
    // songDuration=0 → floor(0/count)=0 → ループに入らない
    const team = makeTeam([skill({ isTimer: true, count: 5, value: 9999 }), null, null, null, null, null], 0);
    const notes = plainNotes(40);
    const none = makeTeam([null, null, null, null, null, null], 0);
    expect(calcMaxScore(team, notes)).toBe(calcMaxScore(none, notes));
  });

  it('calcMaxScore: 非縮小タイマー × 空ノート列で calcNoteIndexAtTime が -1 (L172 / L231 else-if false)', () => {
    // songDuration>0 で maxAct>=1 だが N=0 → noteIndex=-1 → どちらの分岐も成立せず
    const team = makeTeam([skill({ isTimer: true, count: 5, value: 9999, per: 100 }), null, null, null, null, null], 104);
    expect(calcMaxScore(team, [])).toBe(0);
  });

  it('runSimulation: 非縮小タイマー × 空ノート列で noteIndex=-1 (runOnce L530 else-if false)', async () => {
    const team = makeTeam([skill({ isTimer: true, count: 5, value: 9999, per: 100 }), null, null, null, null, null], 104);
    const r = await runSimulation(team, [], 4, undefined, 42);
    // ノートが無いので score は broachScoreBonus(0) のみ
    expect(r.scores.every(s => s === 0)).toBe(true);
  });

  it('runSimulation: 縮小タイマー × songDuration=0 で calcShrinkActivationCount の :0 分岐 (L182/L184/L198)', async () => {
    // SHRINK_TIMER skill + songDuration=0:
    //  - calcShrinkActivationCount: isShrinkTimer && songDuration<=0 → :0 (L184 path1)
    //  - shrinkDurationNotes: songDuration<=0 → 0 → enqueueShrink durationNotes<=0 (L198 path0)
    const shrinkTimer = shrinkSkill({
      originalType: SKILL_TYPE.SHRINK_TIMER,
      count: 5, value: 4, per: 40, rate: 1.4,
    });
    const team = makeTeam([shrinkTimer, null, null, null, null, null], 0);
    const notes = plainNotes(40);
    const r = await runSimulation(team, notes, 4, undefined, 42);
    // songDuration=0 のタイマーは発動しないので縮小寄与なし
    expect(r.shrinkScores.every(s => s === 0)).toBe(true);
  });

  it('calcCardSkillMaxActivations: 縮小タイマーで denom(songDuration)<=0 のとき 0 (L433 timer path)', () => {
    const shrinkTimer = shrinkSkill({ originalType: SKILL_TYPE.SHRINK_TIMER, count: 5 });
    const team = makeTeam([shrinkTimer, null, null, null, null, null], 0);
    expect(calcCardSkillMaxActivations(team, 100, 0)).toBe(0);
  });

  it('calcCardSkillMax: 縮小スキル count<=0 は早期 0 (dc.skill.count<=0 ガード)', async () => {
    // 注: これは calcCardSkillMax 側の count<=0 ガード (L446 相当) で 0 を返す。
    // calcShrinkActivationCount 内部 L182 の count<=0 ガードには到達しない
    // (全呼出元が count>0 で事前フィルタするため。報告参照)。
    const team = makeTeam([shrinkSkill({ count: 0 }), null, null, null, null, null]);
    const notes = plainNotes(40);
    expect(calcCardSkillMax(team, notes, 40, 0)).toBe(0);
  });
});

describe('simulation: 縮小タイマーの enqueue durationNotes>0 経路 (正常系)', () => {
  it('縮小タイマー × maxShrinkCoverage で縮小区間が発動しスコアが上がる', async () => {
    const shrinkTimer = shrinkSkill({
      originalType: SKILL_TYPE.SHRINK_TIMER,
      count: 5, value: 6, per: 40, rate: 1.5,
    });
    const team = makeTeam([shrinkTimer, null, null, null, null, null], 104);
    const notes = plainNotes(100, 'light_6');
    const base = makeTeam([null, null, null, null, null, null], 104);
    const baseNotes = plainNotes(100, 'light_6');
    const r = await runSimulation(team, notes, 6, undefined, 42, {
      scoreUpAssist: false, maxShrinkCoverage: true,
    });
    const baseMin = calcMinScore(base, baseNotes);
    // 縮小タイマーが発動 → mean は基礎を上回る
    expect(r.mean).toBeGreaterThan(baseMin);
  });
});
