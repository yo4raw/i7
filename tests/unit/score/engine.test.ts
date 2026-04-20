import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import {
  calcExpectedScore,
  calcMaxScore,
  calcMinScore,
  calcShrinkCoverage,
  computeGroupSizes,
  computeShrinkExclusion,
  computeTeam,
  flattenNotes,
  getCenterSkillRate,
  runSimulation,
} from '../../../src/lib/score/engine';
import { CENTER_SKILL_RATES, SCOREUP_ASSIST_RATE, TRAIN_BONUS } from '../../../src/lib/score/constants';
import { findBroachsByCardId, findCardById, findSongById } from '../../fixtures';

/** 10th Anniversary 四葉環 (UR / Beat / BAD→Perfect スキル) */
const tenthTamakiMainCard = findCardById(2484);
/** MONSTER GENERATiON (EXPERT+ / 428 ノーツ) */
const monsterGenerationSong = findSongById(2);
/** 10th Anniversary 四葉環 に紐づく固定ブローチ (beat +4500, GROUP=IDOLiSH7) */
const tenthTamakiBroachs = findBroachsByCardId(2484);

const FLATTEN_SEED = 42;
const MC_SEED = 42;
const MC_ITERATIONS = 100;

const emptyDeck: (Card | null)[] = [null, null, null, null, null, null];
const centerDeck: (Card | null)[] = [tenthTamakiMainCard, null, null, null, null, null];

describe('MONSTER GENERATiON で 10th Anniversary 四葉環 をセンター配置した場合', () => {
  describe('getCenterSkillRate (センタースキル倍率)', () => {
    it('returns 10% for UR rarity (matches CENTER_SKILL_RATES table)', () => {
      expect(getCenterSkillRate('UR')).toBe(CENTER_SKILL_RATES.UR);
      expect(getCenterSkillRate(tenthTamakiMainCard.rarity)).toBe(10);
    });

    it('returns 0 for null rarity', () => {
      expect(getCenterSkillRate(null)).toBe(0);
    });
  });

  describe('computeTeam (チーム属性値の計算)', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);

    it('特訓済み時の属性値は *_max と一致 (Shout 3898 / Beat 7691 / Melody 4611)', () => {
      expect(team.rawShout).toBe(3898);
      expect(team.rawBeat).toBe(7691);
      expect(team.rawMelody).toBe(4611);
      expect(team.rawShout).toBe(tenthTamakiMainCard.shout_max);
      expect(team.rawBeat).toBe(tenthTamakiMainCard.beat_max);
      expect(team.rawMelody).toBe(tenthTamakiMainCard.melody_max);
    });

    it('未特訓時は自属性(Beat)のみ TRAIN_BONUS 減算 (Shout 3898 / Beat 5891 / Melody 4611)', () => {
      const untrainedTeam = computeTeam(
        centerDeck,
        [],
        monsterGenerationSong,
        undefined,
        [false, false, false, false, false, false],
      );
      expect(untrainedTeam.rawShout).toBe(3898);
      expect(untrainedTeam.rawBeat).toBe(5891);
      expect(untrainedTeam.rawMelody).toBe(4611);
      // UR の特訓ボーナスは Beat に対して +1800
      expect(TRAIN_BONUS.UR).toBe(1800);
      expect(untrainedTeam.rawBeat).toBe(tenthTamakiMainCard.beat_max! - TRAIN_BONUS.UR);
    });

    it('boosts only the center attribute (Beat) by 10% — UR center skill rate', () => {
      const rawBeat = tenthTamakiMainCard.beat_max!;
      expect(team.Beat).toBe(Math.floor(rawBeat * (100 + CENTER_SKILL_RATES.UR) / 100));
      // 他属性は倍率適用なし
      expect(team.Shout).toBe(tenthTamakiMainCard.shout_max);
      expect(team.Melody).toBe(tenthTamakiMainCard.melody_max);
    });

    it('SCOREUP_ASSIST_RATE is 20% (属性値段階への加算率)', () => {
      expect(SCOREUP_ASSIST_RATE).toBe(0.2);
    });

    it('broach totals are zero when no broach is supplied', () => {
      expect(team.broachShout).toBe(0);
      expect(team.broachBeat).toBe(0);
      expect(team.broachMelody).toBe(0);
      expect(team.broachScoreBonus).toBe(0);
    });

    it('propagates song duration', () => {
      expect(team.songDuration).toBe(monsterGenerationSong.duration);
    });

    it('only the center slot is populated in cards[]', () => {
      expect(team.cards).toHaveLength(1);
      expect(team.cards[0].slotIndex).toBe(0);
      expect(team.cards[0].cardID).toBe(tenthTamakiMainCard.cardID);
      expect(team.cards[0].cardname).toBe(tenthTamakiMainCard.cardname);
      expect(team.cards[0].attribute).toBe('Beat');
    });

    it('10th 環 の BAD→Perfect スキルはスコアに影響しないため skill=null として解析される', () => {
      expect(tenthTamakiMainCard.ap_skill_type).toBe('BAD以上をPerfectに変更');
      expect(team.cards[0].skill).toBeNull();
    });

    it('empty deck yields zero team values (control group)', () => {
      const empty = computeTeam(emptyDeck, [], monsterGenerationSong);
      expect(empty.rawShout).toBe(0);
      expect(empty.rawBeat).toBe(0);
      expect(empty.rawMelody).toBe(0);
      expect(empty.Shout).toBe(0);
      expect(empty.Beat).toBe(0);
      expect(empty.Melody).toBe(0);
      expect(empty.cards).toHaveLength(0);
    });
  });

  describe('固定ブローチ(10th 環専用 beat +4500 / GROUP=IDOLiSH7)を適用した computeTeam', () => {
    it('固定ブローチ1件(card_id=2484, beat=4500, broach_type=4)が fixture に存在', () => {
      expect(tenthTamakiBroachs).toHaveLength(1);
      const b = tenthTamakiBroachs[0];
      expect(b.card_id).toBe(tenthTamakiMainCard.cardID);
      expect(b.beat).toBe(4500);
      expect(b.broach_type).toBe(4); // GROUP
      expect(b.group).toBe('IDOLiSH7');
    });

    it('グループ条件を満たすため broachBeat = 4500 が加算される', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      expect(team.broachShout).toBe(0);
      expect(team.broachBeat).toBe(4500);
      expect(team.broachMelody).toBe(0);
    });

    it('センタースキル倍率は (rawBeat + broachBeat) に対して適用される → Beat 13410', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      // Beat = floor((7691 + 4500) × 1.10) = floor(13410.1) = 13410
      expect(team.Beat).toBe(Math.floor((7691 + 4500) * (100 + CENTER_SKILL_RATES.UR) / 100));
      expect(team.Beat).toBe(13410);
      // 他属性は broach 加算なし(ブローチ属性が beat のみのため)、センター倍率もかからない
      expect(team.Shout).toBe(3898);
      expect(team.Melody).toBe(4611);
    });

    it('スコア総計は docs/unit-test-case.md の理論値 163,242 と一致する', async () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      const expectedTotal = 163242;

      expect(calcMinScore(team, notes)).toBe(expectedTotal);
      expect(calcMaxScore(team, notes)).toBe(expectedTotal);

      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      expect(result.mcMin).toBe(expectedTotal);
      expect(result.mcMax).toBe(expectedTotal);
      expect(result.scores.every((s) => s === expectedTotal)).toBe(true);
    });

    it('SCOREUPアシスト ON で属性値に ×1.2 (floor) を適用 → 195,884', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      // team.Shout=3898, Beat=13410, Melody=4611 → Assisted: 4677, 16092, 5533
      // per-note を再計算 (docs/shrink-skill-spec.md §1)
      expect(calcMinScore(team, notes, { scoreUpAssist: true })).toBe(195884);
    });

    it('SCOREUPバッジ 15 で基本スコアに ×1.15 を適用 → 187,728', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      expect(calcMinScore(team, notes, { scoreUpAssist: false, scoreUpBadgeRate: 15 })).toBe(187728);
    });

    it('アシスト + バッジ 15: アシスト済み素点に ×1.15 を乗算 → 225,266', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      // アシスト後 195,884 × 1.15 = 225,266.6 → floor = 225,266
      expect(calcMinScore(team, notes, { scoreUpAssist: true, scoreUpBadgeRate: 15 })).toBe(225266);
    });
  });

  describe('runSimulation (シード固定の決定論的シミュレーション)', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);

    it('スコアに影響するスキルが無いため 理論最低値 === 理論最高値', () => {
      expect(calcMinScore(team, notes)).toBe(calcMaxScore(team, notes));
    });

    it('MC 実行結果も全て同じスコア (min === max === mcMin === mcMax === 全 scores)', async () => {
      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      const theoretical = calcMinScore(team, notes);

      expect(result.minScore).toBe(theoretical);
      expect(result.maxScore).toBe(theoretical);
      expect(result.mcMin).toBe(theoretical);
      expect(result.mcMax).toBe(theoretical);
      expect(result.mean).toBe(theoretical);
      expect(result.median).toBe(theoretical);
      expect(result.stddev).toBe(0);
      expect(result.scores).toHaveLength(MC_ITERATIONS);
      expect(result.scores.every((s) => s === theoretical)).toBe(true);
    });

    it('cardStats は空 (スコアに影響するスキルを持つカードが0件)', async () => {
      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      expect(result.cardStats).toHaveLength(0);
    });

    it('is deterministic — two runs with the same seed produce identical scores', async () => {
      const r1 = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      const r2 = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      expect(r2.scores).toEqual(r1.scores);
      expect(r2.mean).toBe(r1.mean);
    });
  });

  describe('calcExpectedScore (算術期待値の計算)', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
    const notesCount = monsterGenerationSong.notes_count!;
    const expected = calcExpectedScore(team, notes, notesCount);

    it('baseScore equals calcMinScore (no broach / no badge)', () => {
      expect(expected.baseScore).toBe(calcMinScore(team, notes));
    });

    it('scoreUpExpected は 0 (BAD→Perfect はスコア計算対象外)', () => {
      expect(expected.scoreUpExpected).toBe(0);
    });

    it('shrinkExpected は 0 (10th 環 は判定縮小スキル非所持)', () => {
      expect(expected.shrinkExpected).toBe(0);
    });

    it('finalScore === baseScore (全構成要素が 0 のため)', () => {
      expect(expected.finalScore).toBe(expected.baseScore);
      expect(expected.liveEndScore).toBe(expected.baseScore);
    });
  });
});

/** 記念日2024 四葉環 (UR / Melody / 判定縮小Perfect スキル) */
const memorialTamakiCard = findCardById(2268);
const centerFriendDeck: (Card | null)[] = [
  tenthTamakiMainCard, null, null, null, null, memorialTamakiCard,
];

describe('MONSTER GENERATiON で 10th 環センター + 記念日2024 環フレンドの2枚構成', () => {
  describe('computeTeam (2枚構成のチーム属性値)', () => {
    const team = computeTeam(centerFriendDeck, tenthTamakiBroachs, monsterGenerationSong);

    it('raw 合計は (3,898+4,691, 7,691+4,243, 4,611+7,666) = (8,589, 11,934, 12,277)', () => {
      expect(team.rawShout).toBe(8589);
      expect(team.rawBeat).toBe(11934);
      expect(team.rawMelody).toBe(12277);
    });

    it('固定ブローチは Card 3414 の beat+4,500 のみ (Card 1952 は紐付くブローチ無し)', () => {
      expect(team.broachBeat).toBe(4500);
      expect(team.broachShout).toBe(0);
      expect(team.broachMelody).toBe(0);
      expect(team.broachScoreBonus).toBe(0);
    });

    it('センター (Beat +10%) + フレンド (Melody +10%) で team = (8,589, 18,077, 13,504)', () => {
      expect(team.Shout).toBe(8589);
      expect(team.Beat).toBe(18077);
      expect(team.Melody).toBe(13504);
    });
  });

  describe('スコア計算 (縮小スキルにより分布する)', () => {
    const team = computeTeam(centerFriendDeck, tenthTamakiBroachs, monsterGenerationSong);
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(monsterGenerationSong));
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED, exclusion);
    const notesCount = monsterGenerationSong.notes_count!;

    it('基本スコア (縮小全不発 = calcMinScore) は docs/unit-test-case.md の 293,120 と一致', () => {
      expect(calcMinScore(team, notes)).toBe(293120);
    });

    it('calcMaxScore (縮小全発動時) は docs/unit-test-case.md の 420,279 と一致', () => {
      expect(calcMaxScore(team, notes)).toBe(420279);
    });

    it('calcExpectedScore.finalScore (算術期待値、仕様 §5-3) は 345,852 と一致', () => {
      // 仕様 §4: 期待縮小時間 = 20×4×0.40 = 32秒 / expectedCoverageRate = 32/104 ≈ 0.3077
      // shrinkExpected = floor(eligibleBaseScore × (1.6−1.0) × 0.3077)
      const expected = calcExpectedScore(team, notes, notesCount);
      expect(expected.finalScore).toBe(345852);
    });

    it('runSimulation の mcMin / mcMax / mean / stddev は docs/unit-test-case.md と一致 (MC_SEED=42, iter=100)', async () => {
      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      expect({
        mcMin: result.mcMin,
        mcMax: result.mcMax,
        mean: result.mean,
        stddev: result.stddev,
      }).toEqual({
        mcMin: 317808,
        mcMax: 390305,
        mean: 344240,
        stddev: 13840,
      });
    });
  });
});

/** リスポ2 七瀬陸 (UR / Shout / 判定縮小Perfect スキル) */
const rispo2NanaseCard = findCardById(2618);
const threeCardDeck: (Card | null)[] = [
  tenthTamakiMainCard, // center: ID3414 (BAD→Perfect, 寄与なし)
  rispo2NanaseCard,    // member1: ID3597 (判定縮小 Perfect SL5: 23ノート毎 39% / 5秒 / 1.6倍)
  null, null, null,
  memorialTamakiCard,  // friend: ID1952 (判定縮小 Perfect SL5: 20ノート毎 40% / 4秒 / 1.6倍)
];

describe('MONSTER GENERATiON で 10th 環センター + 記念日2024 環フレンド + リスポ2 陸 メンバー1 の3枚構成', () => {
  describe('縮小スキル 2 枚の発動仕様 (docs/unit-test-case.md ケース3)', () => {
    const team = computeTeam(threeCardDeck, tenthTamakiBroachs, monsterGenerationSong);

    it('ID1952 (フレンド) の縮小スキル: Lv5 count=20 / value=4秒 / per=40%', () => {
      const friend = team.cards.find((dc) => dc.slotIndex === 5)!;
      expect(friend.skill).not.toBeNull();
      expect(friend.skill!.isShrink).toBe(true);
      expect(friend.skill!.count).toBe(20);
      expect(friend.skill!.value).toBe(4);
      expect(friend.skill!.per).toBe(40);
    });

    it('ID3597 (メンバー1) の縮小スキル: Lv5 count=23 / value=5秒 / per=39%', () => {
      const member = team.cards.find((dc) => dc.slotIndex === 1)!;
      expect(member.skill).not.toBeNull();
      expect(member.skill!.isShrink).toBe(true);
      expect(member.skill!.count).toBe(23);
      expect(member.skill!.value).toBe(5);
      expect(member.skill!.per).toBe(39);
    });

    it('発動回数の上限: ID1952 = floor(407/20) = 20 回 / ID3597 = floor(407/23) = 17 回', () => {
      // 仕様 §2: 除外数 = max(notes_20=21, minCount=min(20,23)=20) = 21 ノート
      const eligibleCount = monsterGenerationSong.notes_count! - 21;
      expect(eligibleCount).toBe(407);
      const friend = team.cards.find((dc) => dc.slotIndex === 5)!;
      const member = team.cards.find((dc) => dc.slotIndex === 1)!;
      expect(Math.floor(eligibleCount / friend.skill!.count)).toBe(20);
      expect(Math.floor(eligibleCount / member.skill!.count)).toBe(17);
    });

    it('スコアアップ対象の最大時間: ID1952 = 20×4 = 80秒 / ID3597 = 17×5 = 85秒', () => {
      const eligibleCount = monsterGenerationSong.notes_count! - 21;
      const friend = team.cards.find((dc) => dc.slotIndex === 5)!;
      const member = team.cards.find((dc) => dc.slotIndex === 1)!;
      const actFriend = Math.floor(eligibleCount / friend.skill!.count);
      const actMember = Math.floor(eligibleCount / member.skill!.count);
      expect(actFriend * friend.skill!.value).toBe(80);
      expect(actMember * member.skill!.value).toBe(85);
    });
  });

  describe('calcShrinkCoverage (単純合計 + 100% キャップ)', () => {
    const team = computeTeam(threeCardDeck, tenthTamakiBroachs, monsterGenerationSong);
    // 仕様 §2: excludeHeadCount = max(notes_20=21, minCount=min(20,23)=20) = 21
    const cov = calcShrinkCoverage(team, monsterGenerationSong.notes_count!, 0, 21);

    it('coveredSeconds は 100% キャップで songDuration (104秒) に一致', () => {
      expect(cov).not.toBeNull();
      // 最大縮小時間合計 165 秒 > 104 秒 → min(165, 104) = 104
      expect(cov!.coveredSeconds).toBe(monsterGenerationSong.duration!);
    });

    it('rawCoveredSeconds (生の単純合計) は 80 + 85 = 165 秒', () => {
      expect(cov!.rawCoveredSeconds).toBe(165);
    });

    it('rawCoverageRate は 165/104 ≈ 158.65% で 100% を超過 (表示用: 100% 超過分は計算対象外)', () => {
      expect(cov!.rawCoverageRate).toBeCloseTo(165 / 104, 5);
      expect(cov!.rawCoverageRate).toBeGreaterThan(1.0);
    });

    it('coverageRate は 100% キャップされ 1.0 に等しい', () => {
      expect(cov!.coverageRate).toBeCloseTo(1.0, 5);
    });

    it('rawExpectedCoveredSeconds (生の単純加算) は 80×0.4 + 85×0.39 = 65.15 秒', () => {
      expect(cov!.rawExpectedCoveredSeconds).toBeCloseTo(65.15, 5);
    });

    it('expectedCoverageRate は単純加算の 65.15/104 ≈ 62.64% (100% 未満なのでキャップなし = raw と一致)', () => {
      const naiveRate = (80 * 0.4 + 85 * 0.39) / monsterGenerationSong.duration!;
      expect(cov!.expectedCoverageRate).toBeCloseTo(naiveRate, 5);
      expect(cov!.expectedCoverageRate).toBe(cov!.rawExpectedCoverageRate);
    });

    it('effectiveSeconds は songDuration と一致 (offsetSeconds=0)', () => {
      expect(cov!.effectiveSeconds).toBe(monsterGenerationSong.duration);
    });
  });
});

/** JokerFlag2 四葉環 (UR / Melody / スコアアップタイマー) */
const jokerFlag2TamakiCard = findCardById(1172);
const jokerFlag2Deck: (Card | null)[] = [jokerFlag2TamakiCard, null, null, null, null, null];

describe('MONSTER GENERATiON で ID861 (JokerFlag2 四葉環 / スコアアップ タイマー) のスキル計算', () => {
  const team = computeTeam(jokerFlag2Deck, [], monsterGenerationSong);
  const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);

  it('スキルパラメータ: Lv5 は count=16秒 / per=47% / value=7200 (タイマー)', () => {
    const skill = team.cards[0].skill;
    expect(skill).not.toBeNull();
    expect(skill!.isTimer).toBe(true);
    expect(skill!.isShrink).toBe(false);
    expect(skill!.count).toBe(16);
    expect(skill!.per).toBe(47);
    expect(skill!.value).toBe(7200);
  });

  it('発動回数最大値: floor(songDuration 104 / 16) = 6 回 (docs/unit-test-case.md)', () => {
    expect(Math.floor(monsterGenerationSong.duration! / team.cards[0].skill!.count)).toBe(6);
  });

  it('スコアアップ理論最大値: calcMaxScore - calcMinScore = 6 × 7200 = 43,200 (docs/unit-test-case.md)', () => {
    expect(calcMaxScore(team, notes) - calcMinScore(team, notes)).toBe(43200);
  });

  it('スコアアップ期待値: calcExpectedScore.scoreUpExpected = 6 × 7200 × 47% = 20,304 (docs/unit-test-case.md)', () => {
    const expected = calcExpectedScore(team, notes, monsterGenerationSong.notes_count!);
    expect(expected.scoreUpExpected).toBe(20304);
    // 縮小スキル非所持なので shrinkExpected = 0
    expect(expected.shrinkExpected).toBe(0);
    expect(expected.liveEndScore).toBe(expected.baseScore + 20304);
  });
});

/** 屋外フェス2 逢坂壮五 (UR / Beat / スコアアップコンボ) */
const outdoorFes2SogoCard = findCardById(410);
const outdoorFes2Deck: (Card | null)[] = [outdoorFes2SogoCard, null, null, null, null, null];

describe('MONSTER GENERATiON で ID204 (屋外フェス2 逢坂壮五 / スコアアップ コンボ) のスキル計算', () => {
  const team = computeTeam(outdoorFes2Deck, [], monsterGenerationSong);
  const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);

  it('スキルパラメータ: Lv5 は count=16ノート / per=46% / value=6403 (コンボ / 非タイマー・非縮小)', () => {
    const skill = team.cards[0].skill;
    expect(skill).not.toBeNull();
    expect(skill!.isTimer).toBe(false);
    expect(skill!.isShrink).toBe(false);
    expect(skill!.count).toBe(16);
    expect(skill!.per).toBe(46);
    expect(skill!.value).toBe(6403);
  });

  it('発動回数最大値: floor(notes_count 428 / 16) = 26 回 (docs/unit-test-case.md)', () => {
    expect(Math.floor(monsterGenerationSong.notes_count! / team.cards[0].skill!.count)).toBe(26);
  });

  it('スコアアップ理論最大値: calcMaxScore - calcMinScore = 26 × 6403 = 166,478 (docs/unit-test-case.md)', () => {
    expect(calcMaxScore(team, notes) - calcMinScore(team, notes)).toBe(166478);
  });

  it('スコアアップ期待値: calcExpectedScore.scoreUpExpected = floor(26 × 6403 × 46%) = 76,579 (docs/unit-test-case.md)', () => {
    const expected = calcExpectedScore(team, notes, monsterGenerationSong.notes_count!);
    // 26 × 6403 × 0.46 = 76,579.88 → floor → 76,579
    expect(expected.scoreUpExpected).toBe(76579);
    expect(expected.shrinkExpected).toBe(0);
    expect(expected.liveEndScore).toBe(expected.baseScore + 76579);
  });
});
