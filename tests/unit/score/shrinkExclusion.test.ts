import { describe, it, expect } from 'vitest';
import type { CardSkill, ComputedTeam, DeckCard } from '../../../src/lib/score/types';
import {
  computeGroupSizes,
  computeShrinkExclusion,
} from '../../../src/lib/score/shrinkExclusion';
import { findSongById } from '../../fixtures';

const monsterGenerationSong = findSongById(2);

function shrinkSkill(count: number): CardSkill {
  return {
    cardIndex: 0,
    skillType: 'shrink',
    originalType: '判定縮小（Perfect）',
    count,
    per: 40,
    value: 4,
    isTimer: false,
    isShrink: true,
    spTime: 0,
  };
}

function scoreUpSkill(count: number): CardSkill {
  return {
    cardIndex: 0,
    skillType: 'scoreUp',
    originalType: 'スコアアップ',
    count,
    per: 40,
    value: 100,
    isTimer: false,
    isShrink: false,
    spTime: 0,
  };
}

function makeCard(skill: CardSkill | null, slotIndex: number): DeckCard {
  return {
    cardId: 0, cardID: 0, cardname: '', name: '',
    rarity: 'UR', attribute: 'Shout',
    shout_max: 0, beat_max: 0, melody_max: 0,
    broachShout: 0, broachBeat: 0, broachMelody: 0,
    slotIndex, bonusMultiplier: 1,
    skill,
  };
}

function makeTeam(skills: (CardSkill | null)[]): ComputedTeam {
  return {
    Shout: 0, Beat: 0, Melody: 0,
    cards: skills.map((s, i) => makeCard(s, i)),
    songDuration: 104,
    rawShout: 0, rawBeat: 0, rawMelody: 0,
    broachShout: 0, broachBeat: 0, broachMelody: 0,
    broachScoreBonus: 0,
  };
}

describe('computeGroupSizes', () => {
  it('MONSTER GENERATiON (song ID=2) のグループサイズを正しく集計する', () => {
    const sizes = computeGroupSizes(monsterGenerationSong);
    expect(sizes.notes_20).toBe(21);
    expect(sizes.light_2).toBe(14);
    expect(sizes.light_3).toBe(46);
    expect(sizes.light_4).toBe(46);
    expect(sizes.light_5).toBe(49);
    expect(sizes.light_6).toBe(95);
    expect(sizes.chorus_light_5).toBe(0);
    expect(sizes.chorus_light_6).toBe(157);
    const total = Object.values(sizes).reduce((a, b) => a + b, 0);
    expect(total).toBe(428);
    expect(total).toBe(monsterGenerationSong.notes_count);
  });
});

describe('computeShrinkExclusion', () => {
  const groupSizes = computeGroupSizes(monsterGenerationSong);

  it('縮小スキルが 0 枚のとき空仕様を返す', () => {
    const team = makeTeam([null, null, null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(0);
    expect(exc.fullGroups.size).toBe(0);
    expect(exc.partialGroup).toBeUndefined();
    expect(exc.partialCount).toBe(0);
  });

  it('スコアアップスキルのみのデッキでは除外なし (isShrink フィルタ確認)', () => {
    const team = makeTeam([scoreUpSkill(30), null, null, null, null, scoreUpSkill(25)]);
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(0);
  });

  it('maxCount=18 (notes_20 サイズ未満) のとき notes_20 全除外 (下限保持)', () => {
    const team = makeTeam([shrinkSkill(18), null, null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(21);
    expect(exc.fullGroups.has('notes_20')).toBe(true);
    expect(exc.fullGroups.size).toBe(1);
    expect(exc.partialGroup).toBeUndefined();
    expect(exc.partialCount).toBe(0);
  });

  it('maxCount=21 (notes_20 と同一) のとき notes_20 のみ完全除外', () => {
    const team = makeTeam([shrinkSkill(21), null, null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(21);
    expect(exc.fullGroups.has('notes_20')).toBe(true);
    expect(exc.partialGroup).toBeUndefined();
    expect(exc.partialCount).toBe(0);
  });

  it('複数スキル [count=23, count=20] → minCount=20 で notes_20 全除外 (21)', () => {
    const team = makeTeam([null, shrinkSkill(23), null, null, null, shrinkSkill(20)]);
    const exc = computeShrinkExclusion(team, groupSizes);
    // max(notes_20=21, minCount=20) = 21 → notes_20 のみ除外
    expect(exc.totalExcluded).toBe(21);
    expect(exc.fullGroups.has('notes_20')).toBe(true);
    expect(exc.fullGroups.has('light_2')).toBe(false);
    expect(exc.partialGroup).toBeUndefined();
    expect(exc.partialCount).toBe(0);
  });

  it('minCount=26 (単体, ユーザー例: 6 ノート超過) のとき notes_20 全 + light_2 先頭 5 ノート', () => {
    const team = makeTeam([shrinkSkill(26), null, null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(26);
    expect(exc.fullGroups.has('notes_20')).toBe(true);
    expect(exc.partialGroup).toBe('light_2');
    expect(exc.partialCount).toBe(5);
  });

  it('minCount=50 (単体, 複数グループ跨ぎ) のとき notes_20 + light_2 全 + light_3 先頭 15 ノート', () => {
    const team = makeTeam([shrinkSkill(50), null, null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(50);
    expect(exc.fullGroups.has('notes_20')).toBe(true);
    expect(exc.fullGroups.has('light_2')).toBe(true);
    expect(exc.partialGroup).toBe('light_3');
    expect(exc.partialCount).toBe(15);
  });

  it('複数縮小スキルから最小 count が採用される (仕様 §2: min)', () => {
    const team = makeTeam([
      shrinkSkill(20),
      shrinkSkill(23),
      shrinkSkill(21),
      null, null, shrinkSkill(22),
    ]);
    const exc = computeShrinkExclusion(team, groupSizes);
    // minCount = 20 → max(notes_20=21, 20) = 21
    expect(exc.totalExcluded).toBe(21);
    expect(exc.fullGroups.has('notes_20')).toBe(true);
    expect(exc.partialGroup).toBeUndefined();
    expect(exc.partialCount).toBe(0);
  });

  it('count=0 の不正な縮小スキルは最小値算出から除外される', () => {
    // 有効スキルは count=25 のみ → minCount = 25 → max(21, 25) = 25
    const team = makeTeam([shrinkSkill(0), shrinkSkill(25), null, null, null, null]);
    const exc = computeShrinkExclusion(team, groupSizes);
    expect(exc.totalExcluded).toBe(25);
    expect(exc.partialGroup).toBe('light_2');
    expect(exc.partialCount).toBe(4);
  });
});
