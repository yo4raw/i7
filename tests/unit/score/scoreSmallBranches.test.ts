import { describe, it, expect } from 'vitest';
import type { Song } from '../../../src/lib/data/fetchSongsJson';
import type { CardSkill, ComputedTeam, DeckCard } from '../../../src/lib/score/types';
import type { CardStrengthEntry } from '../../../src/lib/score/cardStrength';
import { SKILL_TYPE } from '../../../src/lib/data/fetchCardsJson';

import {
  createEmptyDeckState,
  swapSlots,
  clampSharedBroachs,
  setCard,
} from '../../../src/lib/score/deckState';
import { computeGroupSizes, computeShrinkExclusion } from '../../../src/lib/score/shrinkExclusion';
import { flattenNotes } from '../../../src/lib/score/noteFlattener';
import { buildBroachRanking } from '../../../src/lib/score/songBroachRanking';
import { reachProbability, cardScorePmf, valueToThreshold } from '../../../src/lib/score/cardDistribution';

import { allBroachs, findCardById, findBroachsByCardId } from '../../fixtures';

// ===========================================================================
// deckState.ts: swapSlots ガード分岐 / clampSharedBroachs の hasFixed=false 分岐
// ===========================================================================
describe('deckState: swapSlots ガード分岐', () => {
  /** 10th Anniversary 四葉環 (UR、固有ブローチあり) */
  const urWithBroach = findCardById(2484);
  /** 和泉一織 (UR、固有ブローチなし) */
  const urNoBroach = findCardById(406);

  it('a === b のとき何もしない (L32 path)', () => {
    const s = createEmptyDeckState();
    setCard(s, 1, urWithBroach, 'gold', allBroachs);
    const before = s.cards[1];
    swapSlots(s, 1, 1);
    expect(s.cards[1]).toBe(before);
  });

  it('範囲外 index (a>4 / b<0) のとき何もしない (L33 path)', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'gold', allBroachs);
    // フレンド枠 (5) は swap 対象外
    swapSlots(s, 0, 5);
    expect(s.cards[0]).toBe(urWithBroach);
    expect(s.cards[5]).toBeNull();
    // 負値
    swapSlots(s, -1, 0);
    expect(s.cards[0]).toBe(urWithBroach);
  });

  it('clampSharedBroachs: 固有ブローチなし UR は共有ブローチ 2 個まで (L49 hasFixed=false path)', () => {
    expect(findBroachsByCardId(406).length).toBe(0); // 前提: 固有ブローチなし
    const s = createEmptyDeckState();
    setCard(s, 0, urNoBroach, 'none', allBroachs);
    s.sharedBroachs[0] = [1, 2, 3];
    clampSharedBroachs(s, 0, allBroachs);
    expect(s.sharedBroachs[0]).toEqual([1, 2]);
  });
});

// ===========================================================================
// shrinkExclusion.ts & noteFlattener.ts: グループ欠落 / 非数値 / サイズ 0 分岐
// ===========================================================================

/** 全 8 グループを持つ song。groups で各サブキーを上書きできる */
function fullSong(groups: Partial<Record<string, Record<string, number | null>>>): Song {
  const empty = {
    shout_white: 0, shout_color: 0,
    beat_white: 0, beat_color: 0,
    melody_white: 0, melody_color: 0,
  };
  const keys = ['notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6'];
  const song: Record<string, unknown> = { id: 1, song_name: 'TEST', notes_count: null };
  for (const k of keys) song[k] = { ...empty, ...groups[k] };
  return song as unknown as Song;
}

describe('computeGroupSizes: グループ欠落・非数値分岐', () => {
  it('グループキーが欠落している楽曲では size=0 (L33 path)', () => {
    const song = fullSong({ light_6: { shout_white: 30 } });
    delete (song as unknown as Record<string, unknown>).chorus_light_6;
    const sizes = computeGroupSizes(song);
    expect(sizes.chorus_light_6).toBe(0);
    expect(sizes.light_6).toBe(30);
  });

  it('サブキー値が数値でない場合は加算しない (L41 typeof !== number path)', () => {
    // beat_white を null にして数値ガードの else 経路を通す
    const song = fullSong({ light_3: { shout_white: 10, beat_white: null } });
    const sizes = computeGroupSizes(song);
    // shout_white(10) のみ加算、beat_white(null) は無視
    expect(sizes.light_3).toBe(10);
  });
});

function shrinkSkill(count: number, originalType: string = SKILL_TYPE.SHRINK): CardSkill {
  return {
    cardIndex: 0, skillType: 'shrink', originalType,
    count, per: 40, value: 4, rate: 1.4,
    isTimer: false, isShrink: true, spTime: 0,
  };
}
function makeCard(skill: CardSkill | null, slotIndex: number): DeckCard {
  return {
    cardId: 0, cardID: 0, cardname: '', name: '',
    rarity: 'UR', attribute: 'Shout',
    shout_max: 0, beat_max: 0, melody_max: 0,
    broachShout: 0, broachBeat: 0, broachMelody: 0,
    slotIndex, bonusMultiplier: 1, skill,
  };
}

describe('computeShrinkExclusion: groupSizes 欠落キー / サイズ0グループ / 縮小タイマー songDuration<=0', () => {
  function makeTeam(skills: (CardSkill | null)[], songDuration = 104): ComputedTeam {
    return {
      Shout: 0, Beat: 0, Melody: 0,
      cards: skills.map((s, i) => makeCard(s, i)),
      songDuration,
      rawShout: 0, rawBeat: 0, rawMelody: 0,
      broachShout: 0, broachBeat: 0, broachMelody: 0, broachScoreBonus: 0,
      centerShout: 0, centerBeat: 0, centerMelody: 0,
      friendShout: 0, friendBeat: 0, friendMelody: 0,
    };
  }

  it('groupSizes に notes_20 が無いとき ?? 0 で扱う (L84 path)', () => {
    // notes_20 キーを持たない groupSizes。minCount(=30) が target になる
    const groupSizes: Record<string, number> = { light_2: 100 };
    const team = makeTeam([shrinkSkill(30), null, null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    // target = max(notes_20=0, 30) = 30。light_2(100) で部分除外 30
    expect(exc.partialGroup).toBe('light_2');
    expect(exc.partialCount).toBe(30);
    expect(exc.totalExcluded).toBe(30);
  });

  it('groupSizes に欠落キーがあると ?? 0 で skip し size<=0 continue する (L93/L94 path)', () => {
    // LIGHT_MULTIPLIER の途中グループを欠落 & 0 にして size<=0 の continue を通す。
    // notes_20 を 0、light_2 を欠落、light_3 を大きくして target に届かせる。
    const groupSizes: Record<string, number> = {
      notes_20: 0,          // size<=0 → continue (L94)
      // light_2 欠落 → ?? 0 → continue (L93/L94)
      light_3: 200,
    };
    const team = makeTeam([shrinkSkill(50), null, null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    // target = max(0, 50)=50。notes_20=0 skip、light_2 欠落 skip、light_3(200) で部分除外 50
    expect(exc.partialGroup).toBe('light_3');
    expect(exc.partialCount).toBe(50);
    expect(exc.totalExcluded).toBe(50);
  });

  it('縮小タイマースキル × songDuration>0 で first-trigger ノート換算経路を通る', () => {
    const groupSizes: Record<string, number> = { notes_20: 21, light_2: 100 };
    const team = makeTeam(
      [shrinkSkill(5, SKILL_TYPE.SHRINK_TIMER), null, null, null, null, null],
      104,
    );
    const exc = computeShrinkExclusion(team, groupSizes);
    // notesCount=121, first trigger note = floor((5/104)*121)=5 → max(notes_20=21,5)=21
    expect(exc.totalExcluded).toBe(21);
    expect(exc.fullGroups.has('notes_20')).toBe(true);
  });

  it('縮小タイマースキル × songDuration<=0 では first-trigger を加えない (L74 false path)', () => {
    const groupSizes: Record<string, number> = { notes_20: 21, light_2: 100 };
    // songDuration=0 の SHRINK_TIMER のみ → shrinkFirstTriggerNotes が空のまま → empty 返却
    const team = makeTeam(
      [shrinkSkill(5, SKILL_TYPE.SHRINK_TIMER), null, null, null, null, null],
      0,
    );
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(0);
    expect(exc.fullGroups.size).toBe(0);
  });
});

describe('flattenNotes: グループ欠落 / seed 省略分岐', () => {
  it('グループキーが欠落している楽曲ではそのグループを skip する (L35 path)', () => {
    const song = fullSong({ light_2: { shout_white: 5 }, light_6: { beat_white: 7 } });
    delete (song as unknown as Record<string, unknown>).chorus_light_6;
    const notes = flattenNotes(song, 42);
    expect(notes.some(n => n.group === 'chorus_light_6')).toBe(false);
    expect(notes.filter(n => n.group === 'light_2')).toHaveLength(5);
    expect(notes.filter(n => n.group === 'light_6')).toHaveLength(7);
  });

  it('seed 省略時も生成できる (L31 seed ?? Date.now() path)', () => {
    const song = fullSong({ light_2: { shout_white: 3 } });
    const notes = flattenNotes(song);
    expect(notes).toHaveLength(3);
  });
});

// ===========================================================================
// songBroachRanking.ts: グループ欠落 / count 欠落フォールバック
// ===========================================================================
describe('buildBroachRanking: グループ欠落・count 欠落分岐', () => {
  it('グループキー欠落楽曲では当該グループを skip (L45 path)', () => {
    const song = fullSong({ light_6: { shout_white: 100 } });
    delete (song as unknown as Record<string, unknown>).chorus_light_6;
    const ranking = buildBroachRanking(song);
    expect(ranking.length).toBeGreaterThan(0);
    // Shout 偏重なので Shout 系が含まれる
    expect(ranking.some(e => e.name === 'Shout1100')).toBe(true);
  });

  it('サブキー count が欠落していると ?? 0 で 0 扱い (L50 path)', () => {
    // light_6 から shout_color を削除（undefined）。shout_white のみ加算される。
    const song = fullSong({ light_6: { shout_white: 10 } });
    delete (song as unknown as Record<string, Record<string, unknown>>).light_6.shout_color;
    const ranking = buildBroachRanking(song);
    const all700 = ranking.find(e => e.name === 'ALL700');
    // perNote = floor(700*0.025)=17 → floor(17*1.5)=25。10 ノーツ → 250（color は 0 扱い）
    expect(all700?.score).toBe(250);
  });
});

// ===========================================================================
// cardDistribution.ts: kMin>n / 縮小スパイク / 縮小 base 分岐
// ===========================================================================
function skill(partial: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0, skillType: 'scoreUp', originalType: 'スコアアップ',
    count: 10, per: 50, value: 1000, rate: 0,
    isTimer: false, isShrink: false, spTime: 0,
    ...partial,
  };
}
function entry(partial: Partial<CardStrengthEntry>): CardStrengthEntry {
  return {
    card: findCardById(2484),
    attribute: 'Shout',
    appeal: { Shout: 0, Beat: 0, Melody: 0 },
    appealTotal: 0,
    baseScore: 100000,
    skillExpected: 0, skillMax: 0,
    totalScore: 100000, maxTotalScore: 100000,
    maxActivations: 0, maxCoverSec: 0, expectedCoverSec: 0,
    skill: null, broachScoreBonus: 0, appliedBroach: null,
    ...partial,
  };
}

describe('cardDistribution: 縮小・範囲外分岐', () => {
  it('reachProbability: t>1 で kMin>n のとき 0 (L35 path)', () => {
    const e = entry({ maxActivations: 4, skill: skill({ per: 50 }) });
    expect(reachProbability(e, 1.5)).toBe(0);
  });

  it('cardScorePmf: 縮小スキルだが n=0 のとき cover の 0 スパイク (L52 isShrink?0 path)', () => {
    const e = entry({
      baseScore: 99999,
      maxActivations: 0,
      skill: skill({ isShrink: true, skillType: 'shrink', value: 4, per: 40 }),
    });
    const r = cardScorePmf(e);
    expect(r.metric).toBe('cover');
    // n<=0 のスパイクは isShrink なので x=0
    expect(r.points).toEqual([{ x: 0, prob: 1 }]);
  });

  it('valueToThreshold: 縮小スキル(span>0) は base=0 で割合計算 (L67 isShrink?0 path)', () => {
    const e = entry({
      baseScore: 100000,
      maxActivations: 4,
      skill: skill({ isShrink: true, skillType: 'shrink', value: 2, per: 40 }),
    });
    // span = 4*2 = 8, base=0（縮小）→ x=4 → t=0.5
    expect(valueToThreshold(e, 4)).toBeCloseTo(0.5, 10);
    expect(valueToThreshold(e, 0)).toBe(0);
    expect(valueToThreshold(e, 8)).toBe(1);
  });
});
