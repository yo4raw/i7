import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import {
  computeTeam,
  computeGroupSizes,
  computeShrinkExclusion,
  flattenNotes,
  calcExpectedScore,
  calcMaxScore,
} from '../../../src/lib/score/engine';
import { calcNoteScore } from '../../../src/lib/score/simulation';
import { SCOREUP_ASSIST_RATE } from '../../../src/lib/score/constants';
import { findBroachsByCardId, findCardById, findSongById } from '../../fixtures';
import type { ComputedTeam, CardSkill, FlatNote, DeckCard } from '../../../src/lib/score/types';

const FLATTEN_SEED = 42;

/** 10th Anniversary 四葉環 (UR / Beat / BAD→Perfect スキル。縮小スキルは持たない) */
const tenthTamakiMainCard = findCardById(2484);
/** 記念日2024 四葉環 (UR / Melody / 判定縮小Perfect スキル。デッキ内で唯一の縮小スキル所持カード) */
const memorialTamakiCard = findCardById(2268);
/** MONSTER GENERATiON (EXPERT+ / 428 ノーツ) */
const monsterGenerationSong = findSongById(2);
const tenthTamakiBroachs = findBroachsByCardId(2484);

// センター: 10th 環 (縮小スキルなし) / フレンド: 記念日2024 環 (判定縮小 Perfect)
// 単一の縮小スキル所持カードのみの非飽和・単純ケース (docs/spreadsheet-spec-v1.0.7.md §6-5 BN22 / §6-6 H39)
const deck: (Card | null)[] = [
  tenthTamakiMainCard, null, null, null, null, memorialTamakiCard,
];

describe('縮小期待値: H39 小数保持 + BN22 アシスト剥離 (B6/B7)', () => {
  it('縮小期待値: H39 小数保持 + BN22 アシスト剥離 (B6/B7)', () => {
    const team = computeTeam(deck, tenthTamakiBroachs, monsterGenerationSong);
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(monsterGenerationSong));
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED, exclusion);
    const notesCount = monsterGenerationSong.notes_count!;

    const options = { scoreUpAssist: true, scoreUpBadgeRate: 0 };
    const exp = calcExpectedScore(team, notes, notesCount, options);

    // デッキ内で縮小スキルを持つのは記念日2024 環 (フレンド) の 1 枚のみ
    const shrinkCard = team.cards.find((dc) => dc.skill?.isShrink);
    expect(shrinkCard).toBeDefined();
    const skill = shrinkCard!.skill!;

    // eligibleBaseScore: excluded ノート除外 (ADR 0040 / I1) + assist ON の appeal 適用
    const excludedCount = notes.filter((n) => n.excluded).length;
    let eligibleBaseScore = 0;
    for (const note of notes) {
      if (note.excluded) continue;
      const raw = team[note.attribute];
      const appeal = Math.floor(raw * (1 + SCOREUP_ASSIST_RATE));
      eligibleBaseScore += calcNoteScore(appeal, note);
    }

    // BN22: 縮小基準スコアはアシスト剥離後 (assist ON なら floor(eligibleBase / 1.2))
    const strippedBase = Math.floor(eligibleBaseScore / 1.2);

    // H39: denom/count を小数のまま per/100 × value と乗算し、1 回だけ floor する
    const eligDenom = notesCount - excludedCount;
    const expSec = Math.floor((eligDenom / skill.count) * (skill.per / 100) * skill.value);

    // effectiveSeconds / capSeconds は calcShrinkCoverage の返り値を使わず、
    // 仕様書 §6-6 と ADR 0036 の定義からテスト内で独立に再計算する
    const headSeconds = (excludedCount / notesCount) * team.songDuration;
    const effectiveSeconds = team.songDuration - headSeconds;
    const headCapSeconds = (skill.count / notesCount) * team.songDuration;
    const capSeconds = Math.max(0, effectiveSeconds - headCapSeconds);

    const coverage = Math.min(expSec, capSeconds) / effectiveSeconds;
    const expected = Math.floor(strippedBase * coverage * (skill.rate - 1));

    expect(exp.shrinkExpected).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 縮小理論最大値 (B8): docs/spreadsheet-spec-v1.0.7.md §6-6 H40 の按分式
// ---------------------------------------------------------------------------

/** テスト専用の合成ノーツ列 (attribute=Shout / white / light_2 固定、倍率 1.0) */
function makeNotes(n: number): FlatNote[] {
  return Array.from({ length: n }, () => ({
    attribute: 'Shout' as const,
    type: 'white' as const,
    group: 'light_2',
    excluded: false,
  }));
}

function shrinkSkill(over: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0, skillType: 'shrink', originalType: '判定領域縮小',
    count: 20, per: 100, value: 5, rate: 1.6, isTimer: false, isShrink: true, spTime: 0,
    ...over,
  };
}

/** 合成 ComputedTeam。appeal=10007 固定 → 1ノーツ = floor(10007*0.025)*1.0 = 250 点 */
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

describe('縮小理論最大値: H40 按分式 (B8)', () => {
  it('飽和ケース (totalSec >= effectiveSeconds): 秒数比で按分', () => {
    // 2枚の縮小スキル (rate 1.6 / 1.2)。300s/150s 分のカバー秒 (合計450s) が
    // effectiveSeconds=100s (songDuration=100, 除外なし) を上回るため飽和する。
    const skillA = shrinkSkill({ count: 20, value: 15, rate: 1.6 }); // sec = floor(400/20*15) = 300
    const skillB = shrinkSkill({ count: 40, value: 15, rate: 1.2 }); // sec = floor(400/40*15) = 150
    const team = makeTeam([skillA, null, null, null, skillB, null], 10007, 100);
    const notes = makeNotes(400);

    // baseScore: 400 ノーツ × 250 点 (appeal=10007 → floor(10007*0.025)=250, light_2倍率1.0)
    const baseScore = 400 * 250;
    const secA = Math.floor((400 / 20) * 15); // 300
    const secB = Math.floor((400 / 40) * 15); // 150
    const totalSec = secA + secB; // 450 >= effectiveSeconds(100) → 飽和
    const shrinkBase = baseScore; // assist off → BN22 剥離なし
    const shrinkMax =
      Math.floor(shrinkBase * (secA / totalSec) * (1.6 - 1)) +
      Math.floor(shrinkBase * (secB / totalSec) * (1.2 - 1));
    const expected = baseScore + shrinkMax; // scoreUpMax=0 (縮小スキルのみ)

    expect(calcMaxScore(team, notes)).toBe(expected);
    // 手計算値を明示 (仕様変更時のリグレッション検知用)
    expect(expected).toBe(146666);
  });

  it('未飽和ケース (totalSec < effectiveSeconds): 実効秒数比で按分', () => {
    // songDuration=300 に対しカバー秒 (合計60s) が effectiveSeconds=300s を下回るため未飽和。
    const skillA = shrinkSkill({ count: 50, value: 5, rate: 1.6 }); // sec = floor(400/50*5) = 40
    const skillB = shrinkSkill({ count: 100, value: 5, rate: 1.3 }); // sec = floor(400/100*5) = 20
    const team = makeTeam([skillA, null, null, null, skillB, null], 10007, 300);
    const notes = makeNotes(400);

    const baseScore = 400 * 250;
    const secA = Math.floor((400 / 50) * 5); // 40
    const secB = Math.floor((400 / 100) * 5); // 20
    const effectiveSeconds = 300; // songDuration、除外なし
    expect(secA + secB).toBeLessThan(effectiveSeconds); // 未飽和であることの前提確認
    const shrinkBase = baseScore;
    const shrinkMax =
      Math.floor(shrinkBase * (secA / effectiveSeconds) * (1.6 - 1)) +
      Math.floor(shrinkBase * (secB / effectiveSeconds) * (1.3 - 1));
    const expected = baseScore + shrinkMax;

    expect(calcMaxScore(team, notes)).toBe(expected);
    expect(expected).toBe(110000);
  });
});
