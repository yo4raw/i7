import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import {
  calcCardSkillMaxActivations,
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
import { CENTER_SKILL_RATES, MC_ITERATIONS, NOTE_RATE, LIGHT_MULTIPLIER, SCOREUP_ASSIST_RATE, TRAIN_BONUS } from '../../../src/lib/score/constants';
import { allBroachs, findBroachsByCardId, findCardById, findSongById } from '../../fixtures';

/** 10th Anniversary 四葉環 (UR / Beat / BAD→Perfect スキル) */
const tenthTamakiMainCard = findCardById(2484);
/** MONSTER GENERATiON (EXPERT+ / 428 ノーツ) */
const monsterGenerationSong = findSongById(2);
/** 10th Anniversary 四葉環 に紐づく固定ブローチ (beat +4500, GROUP=IDOLiSH7) */
const tenthTamakiBroachs = findBroachsByCardId(2484);

const FLATTEN_SEED = 42;
const MC_SEED = 42;

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

    it('スコア総計は 163,097 と一致する (docs/score_calc_spec.md §5 の 2 段 floor 準拠)', async () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      const expectedTotal = 163097;

      expect(calcMinScore(team, notes)).toBe(expectedTotal);
      expect(calcMaxScore(team, notes)).toBe(expectedTotal);

      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      expect(result.mcMin).toBe(expectedTotal);
      expect(result.mcMax).toBe(expectedTotal);
      expect(result.scores.every((s) => s === expectedTotal)).toBe(true);
    });

    it('SCOREUPアシスト ON で属性値に ×1.2 (floor) を適用 → 195,667', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      // team.Shout=3898, Beat=13410, Melody=4611 → Assisted: 4677, 16092, 5533
      // per-note は 2 段 floor (docs/score_calc_spec.md §5)
      expect(calcMinScore(team, notes, { scoreUpAssist: true })).toBe(195667);
    });

    it('SCOREUPバッジ 15 で基本スコアに ×1.15 を適用 → 187,561', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      // 基本 163,097 × 1.15 = 187,561.55 → floor = 187,561
      expect(calcMinScore(team, notes, { scoreUpAssist: false, scoreUpBadgeRate: 15 })).toBe(187561);
    });

    it('アシスト + バッジ 15: アシスト済み素点に ×1.15 を乗算 → 225,017', () => {
      const team = computeTeam(centerDeck, tenthTamakiBroachs, monsterGenerationSong);
      const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
      // アシスト後 195,667 × 1.15 = 225,017.05 → floor = 225,017
      expect(calcMinScore(team, notes, { scoreUpAssist: true, scoreUpBadgeRate: 15 })).toBe(225017);
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

    it('基本スコア (縮小全不発 = calcMinScore) は 292,683 と一致 (§5 の 2 段 floor 準拠)', () => {
      expect(calcMinScore(team, notes)).toBe(292683);
    });

    it('calcMaxScore (縮小全発動時) は 419,581 と一致 (§5 の 2 段 floor 準拠)', () => {
      expect(calcMaxScore(team, notes)).toBe(419581);
    });

    it('calcExpectedScore.finalScore (算術期待値、仕様 §5-3) は 345,334 と一致', () => {
      // 仕様 §4: 期待縮小時間 = 20×4×0.40 = 32秒 / expectedCoverageRate = 32/104 ≈ 0.3077
      // shrinkExpected = floor(eligibleBaseScore × (1.6−1.0) × 0.3077)
      const expected = calcExpectedScore(team, notes, notesCount);
      expect(expected.finalScore).toBe(345334);
    });

    it('runSimulation の mcMin / mcMax / mean / stddev は固定値と一致 (MC_SEED=42, iter=100)', async () => {
      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      expect({
        mcMin: result.mcMin,
        mcMax: result.mcMax,
        mean: result.mean,
        stddev: result.stddev,
      }).toEqual({
        mcMin: 317323,
        mcMax: 389668,
        mean: 343698,
        stddev: 13811,
      });
    });
  });

  describe('縮小全発動モード (maxShrinkCoverage オプション)', () => {
    const team = computeTeam(centerFriendDeck, tenthTamakiBroachs, monsterGenerationSong);
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(monsterGenerationSong));
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED, exclusion);

    it('maxShrinkCoverage: true の全試行で縮小スキル発動回数が理論最大 floor(407/20)=20 回に一致', async () => {
      const result = await runSimulation(
        team, notes, 50, undefined, MC_SEED,
        { scoreUpAssist: false, maxShrinkCoverage: true },
      );
      const shrinkStat = result.cardStats.find((s) => s.skillType.includes('判定縮小'));
      expect(shrinkStat).toBeDefined();
      expect(shrinkStat!.avgActivations).toBe(20);
    });

    it('maxShrinkCoverage 未指定 (既存挙動) の平均発動回数は理論最大 × per/100 = 8 回近傍 (対照群)', async () => {
      const result = await runSimulation(team, notes, 200, undefined, MC_SEED);
      const shrinkStat = result.cardStats.find((s) => s.skillType.includes('判定縮小'));
      expect(shrinkStat).toBeDefined();
      expect(shrinkStat!.avgActivations).toBeGreaterThan(6.5);
      expect(shrinkStat!.avgActivations).toBeLessThan(9.5);
    });

    it('maxShrinkCoverage: true のとき MC 平均スコアは calcMaxScore 近傍に収束する', async () => {
      const maxScore = calcMaxScore(team, notes);
      const result = await runSimulation(
        team, notes, 50, undefined, MC_SEED,
        { scoreUpAssist: false, maxShrinkCoverage: true },
      );
      const relDiff = Math.abs(result.mean - maxScore) / maxScore;
      expect(relDiff).toBeLessThan(0.01);
    });

    it('maxShrinkCoverage: false の MC 平均は calcMaxScore より十分小さい (対照群)', async () => {
      const maxScore = calcMaxScore(team, notes);
      const result = await runSimulation(team, notes, 200, undefined, MC_SEED);
      expect(result.mean).toBeLessThan(maxScore * 0.95);
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

  describe('縮小スキル 2 枚のキューイング検証 (docs/shrink-skill-spec.md §1-1 / §7-9)', () => {
    const team = computeTeam(threeCardDeck, tenthTamakiBroachs, monsterGenerationSong);
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(monsterGenerationSong));
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED, exclusion);
    const notesCount = monsterGenerationSong.notes_count!;

    it('calcMaxScore > calcMinScore + eligibleBaseScore × 0.6 × 0.9 (キューイングで縮小区間がほぼ全域をカバー)', () => {
      const minScore = calcMinScore(team, notes);
      const maxScore = calcMaxScore(team, notes);
      let eligibleBaseScore = 0;
      for (const n of notes) {
        if (n.excluded) continue;
        const perNoteBase = Math.floor(team[n.attribute] * NOTE_RATE[n.type]);
        eligibleBaseScore += Math.floor(perNoteBase * LIGHT_MULTIPLIER[n.group]);
      }
      const addScore = maxScore - minScore;
      // キューイング下では「最初のトリガー成立前のデッドゾーン」と曲終了で溢れたキューの分、
      // 仕様書の簡易式 (§5-2, eligibleBaseScore × 0.6 × 100%) よりわずかに下振れする。
      // 90% 以上カバーしていれば実ゲームの挙動として妥当。
      expect(addScore).toBeGreaterThan(eligibleBaseScore * 0.6 * 0.9);
      expect(addScore).toBeLessThanOrEqual(Math.floor(eligibleBaseScore * 0.6));
    });

    it('runSimulation (iter=2000, seed=42) の mean が calcExpectedScore.finalScore ±3% に収束する (キューイングで単純加算カバー率と整合)', async () => {
      const expected = calcExpectedScore(team, notes, notesCount);
      const result = await runSimulation(team, notes, 2000, undefined, MC_SEED);
      const relDiff = Math.abs(result.mean - expected.finalScore) / expected.finalScore;
      expect(relDiff).toBeLessThan(0.03);
    });
  });
});

/** 記念日2024 百 (UR / Beat / 判定縮小Perfect Lv5 count=22 per=42 value=4 rate=1.6) */
const memorial2024MomoForShrink3 = findCardById(2237);
/**
 * MONSTER GENERATiON 3 枚縮小デッキ:
 *   - center: 10th Anniversary 環 (BAD→Perfect, 寄与なし)
 *   - member1: リスポ2 陸 (縮小 count=23 / per=39 / value=5)
 *   - member2: 記念日2024 百 (縮小 count=22 / per=42 / value=4)
 *   - friend: 記念日2024 環 (縮小 count=20 / per=40 / value=4)
 * 期待最大縮小時間合計 = 80 + 85 + 72 = 237 秒 >> 104 秒 → 内部カバー率 100% キャップ
 */
const fourShrinkDeck: (Card | null)[] = [
  tenthTamakiMainCard,         // center
  rispo2NanaseCard,            // member1 (縮小 count=23)
  memorial2024MomoForShrink3,  // member2 (縮小 count=22)
  null,
  null,
  memorialTamakiCard,          // friend (縮小 count=20)
];

describe('MONSTER GENERATiON で 縮小スキル 3 枚構成（キューイングにより常時カバー率 100%）', () => {
  const team = computeTeam(fourShrinkDeck, tenthTamakiBroachs, monsterGenerationSong);
  const exclusion = computeShrinkExclusion(team, computeGroupSizes(monsterGenerationSong));
  const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED, exclusion);
  const notesCount = monsterGenerationSong.notes_count!;

  it('計 3 枚の縮小スキルが認識される (count=23 / count=22 / count=20)', () => {
    const shrinkCounts = team.cards
      .filter((dc) => dc.skill?.isShrink)
      .map((dc) => dc.skill!.count)
      .sort((a, b) => a - b);
    expect(shrinkCounts).toEqual([20, 22, 23]);
  });

  it('calcShrinkCoverage: coverageRate は 100% キャップ / expectedCoverageRate も 100% (65.15 + 72×0.42 ≈ 95.4 秒 < 104 秒だが 3 枚合計で高カバー)', () => {
    const cov = calcShrinkCoverage(team, notesCount, 0, 21);
    expect(cov).not.toBeNull();
    // 最大縮小時間合計 = 80 + 85 + 72 = 237 秒
    expect(cov!.rawCoveredSeconds).toBe(80 + 85 + 72);
    // 内部計算用は songDuration (104) でキャップ
    expect(cov!.coveredSeconds).toBe(monsterGenerationSong.duration);
    expect(cov!.coverageRate).toBeCloseTo(1.0, 5);
    // 期待縮小時間合計 = 80×0.40 + 85×0.39 + 72×0.42 = 32 + 33.15 + 30.24 = 95.39 秒
    expect(cov!.rawExpectedCoveredSeconds).toBeCloseTo(95.39, 2);
  });

  it('runSimulation (iter=2000, seed=42) の mean が calcExpectedScore.finalScore ±6% に収束 (3 枚でキューイング効果が顕在化)', async () => {
    // キューイング下では期待カバー率 (91.7%) の近傍で、ランダムな試行毎の総活性時間が
    // `songDuration - firstFireTime` を超えた分が溢れる。結果 MC 平均は単純加算期待値より
    // 数%下振れするが、旧実装 (max(rate) + 重複無視) の 20-30% 下振れと比べ十分改善される。
    const expected = calcExpectedScore(team, notes, notesCount);
    const result = await runSimulation(team, notes, 2000, undefined, MC_SEED);
    const relDiff = Math.abs(result.mean - expected.finalScore) / expected.finalScore;
    expect(relDiff).toBeLessThan(0.06);
  });

  it('runSimulation の mcMin が calcMinScore より必ず高い (3 枚縮小で最低ケースでもほぼ確実に何かしら発動する)', async () => {
    const result = await runSimulation(team, notes, 2000, undefined, MC_SEED);
    expect(result.mcMin).toBeGreaterThan(calcMinScore(team, notes));
  });

  it('maxShrinkCoverage: true のとき 3 枚全スキルが理論最大回数発動 (キューイング下でも確率ロールは全 pass)', async () => {
    const result = await runSimulation(
      team, notes, 30, undefined, MC_SEED,
      { scoreUpAssist: false, maxShrinkCoverage: true },
    );
    const shrinkStats = result.cardStats.filter((s) => s.skillType.includes('判定縮小'));
    expect(shrinkStats).toHaveLength(3);
    const actByCount: Record<number, number> = {};
    for (const s of shrinkStats) {
      const slot = team.cards.find((dc) => dc.slotIndex === s.cardIndex);
      actByCount[slot!.skill!.count] = s.avgActivations;
    }
    expect(actByCount[20]).toBe(20);
    expect(actByCount[22]).toBe(18);
    expect(actByCount[23]).toBe(17);
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

/** 7th Anniversary 百 (UR / Beat / 固定ブローチ beat+800 あり) */
const card1500 = findCardById(1805); // 画面表示 ID=1500
/** 記念日2024 百 (UR / Beat) */
const card1923 = findCardById(2237); // 画面表示 ID=1923
/** 記念日2021 千 (UR / Beat) */
const card1139 = findCardById(1488); // 画面表示 ID=1139
/** Binary Vampire (ID=60 / EXPERT+ / notes_count=461 / duration=92) */
const binaryVampireSong = findSongById(60);

/**
 * UI 上の表示順 [1枚目, 2枚目, センター, 4枚目, 5枚目, フレンド] を
 * エンジン配列 [center, member1, member2, member3, member4, friend] に変換したもの。
 *
 * - センター: ID1500 (7th Anniversary 百, UR/Beat)
 * - メンバー: ID1923 ×2 (記念日2024 百), ID1139 ×2 (記念日2021 千)
 * - フレンド: ID1139 (記念日2021 千)
 */
const revale6Deck = [card1500, card1923, card1923, card1139, card1139, card1139];

/**
 * 全員 銀特効 (×2.2): Re:vale記念日2026 (event ID=223) が期間中 (2026-04-15〜04-22) の場合、
 * デッキ内のカードはすべて silver に該当する。
 */
const silverTiers = ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'] as const;

describe('Binary Vampire (ID60) × Re:vale六枚デッキ (センター=ID1500 / ID1923×2 / ID1139×3) で銀特効 + SCOREUPアシスト時の 1 ノーツスコア', () => {
  const team = computeTeam(revale6Deck, allBroachs, binaryVampireSong, [...silverTiers]);

  it('Raw 属性値: 全員 UR の silver(×2.2) 適用で (S=55,356 / B=100,129 / M=61,212)', () => {
    // 1500: round(4016×2.2)=8835 / round(7762×2.2)=17076 / round(4624×2.2)=10173
    // 1923: round(4193×2.2)=9225 / round(7621×2.2)=16766 / round(4785×2.2)=10527
    // 1139: round(4253×2.2)=9357 / round(7503×2.2)=16507 / round(4543×2.2)=9995
    expect(team.rawShout).toBe(8835 + 9225 * 2 + 9357 * 3);
    expect(team.rawBeat).toBe(17076 + 16766 * 2 + 16507 * 3);
    expect(team.rawMelody).toBe(10173 + 10527 * 2 + 9995 * 3);
    expect(team.rawShout).toBe(55356);
    expect(team.rawBeat).toBe(100129);
    expect(team.rawMelody).toBe(61212);
  });

  it('固定ブローチ: ID1500 の 7th Anniversary 百専用ブローチ (beat+800, broach_type=6, limit=2) が 1 枚だけ発動', () => {
    expect(team.broachShout).toBe(0);
    expect(team.broachBeat).toBe(800);
    expect(team.broachMelody).toBe(0);
  });

  it('センター (ID1500 UR/Beat) + フレンド (ID1139 UR/Beat) が両方 Beat / UR のため、Beat に +10% が 2 回 (独立 floor) 加算される', () => {
    // baseBeat = rawBeat + broachBeat = 100,129 + 800 = 100,929
    // centerBeat = floor(100,929 × 0.10) = 10,092 (独立 floor)
    // friendBeat = floor(100,929 × 0.10) = 10,092
    // teamBeat = 100,929 + 10,092 + 10,092 = 121,113
    expect(team.Shout).toBe(55356); // Shout 方向には倍率加算なし
    expect(team.Beat).toBe(121113);
    expect(team.Melody).toBe(61212); // Melody 方向にも倍率加算なし
  });

  describe('SCOREUPアシスト ON (+20%) 適用後の「デッキ合計」値', () => {
    // docs/score_calc_spec.md §3-7 準拠: deckXxx = floor(teamXxx × 1.2)
    const deckShout = Math.floor(team.Shout * (1 + SCOREUP_ASSIST_RATE));
    const deckBeat = Math.floor(team.Beat * (1 + SCOREUP_ASSIST_RATE));
    const deckMelody = Math.floor(team.Melody * (1 + SCOREUP_ASSIST_RATE));

    it('アシスト後のデッキ合計は (S=66,427 / B=145,335 / M=73,454)', () => {
      expect(deckShout).toBe(66427);
      expect(deckBeat).toBe(145335);
      expect(deckMelody).toBe(73454);
    });

    it('1 ノーツ基底値 (ステージ倍率 1.0) は screenshot と一致', () => {
      // 白 = floor(deckAttr × 0.025) / 色 = floor(deckAttr × 0.030)
      expect(Math.floor(deckShout * NOTE_RATE.white)).toBe(1660);
      expect(Math.floor(deckShout * NOTE_RATE.color)).toBe(1992);
      expect(Math.floor(deckBeat * NOTE_RATE.white)).toBe(3633);
      expect(Math.floor(deckBeat * NOTE_RATE.color)).toBe(4360);
      expect(Math.floor(deckMelody * NOTE_RATE.white)).toBe(1836);
      expect(Math.floor(deckMelody * NOTE_RATE.color)).toBe(2203);
    });

    it('ステージ倍率別 1 ノーツスコアは 2 段 floor で screenshot の全セルと一致', () => {
      // 列順: [stage倍率, Shout白, Shout色, Beat白, Beat色, Melody白, Melody色]
      const expected: Array<[number, number, number, number, number, number, number]> = [
        [LIGHT_MULTIPLIER.notes_20,        1660, 1992, 3633,  4360, 1836, 2203], // 1.0
        [LIGHT_MULTIPLIER.light_3,         1826, 2191, 3996,  4796, 2019, 2423], // 1.1
        [LIGHT_MULTIPLIER.light_4,         1992, 2390, 4359,  5232, 2203, 2643], // 1.2
        [LIGHT_MULTIPLIER.light_5,         2158, 2589, 4722,  5668, 2386, 2863], // 1.3
        [LIGHT_MULTIPLIER.light_6,         2490, 2988, 5449,  6540, 2754, 3304], // 1.5
        [LIGHT_MULTIPLIER.chorus_light_5,  4316, 5179, 9445, 11336, 4773, 5727], // 2.6
        [LIGHT_MULTIPLIER.chorus_light_6,  4980, 5976,10899, 13080, 5508, 6609], // 3.0
      ];

      const perNote = (deckAttr: number, type: 'white' | 'color', stage: number) =>
        Math.floor(Math.floor(deckAttr * NOTE_RATE[type]) * stage);

      for (const [stage, sw, sc, bw, bc, mw, mc] of expected) {
        expect(perNote(deckShout,  'white', stage)).toBe(sw);
        expect(perNote(deckShout,  'color', stage)).toBe(sc);
        expect(perNote(deckBeat,   'white', stage)).toBe(bw);
        expect(perNote(deckBeat,   'color', stage)).toBe(bc);
        expect(perNote(deckMelody, 'white', stage)).toBe(mw);
        expect(perNote(deckMelody, 'color', stage)).toBe(mc);
      }
    });
  });

  describe('Binary Vampire (ID60) の「ステージ×属性×白/色」ノーツ配分', () => {
    it('総ノーツ数は 461 と一致する (screenshot の Total セル)', () => {
      expect(binaryVampireSong.notes_count).toBe(461);
    });

    it('各 (ステージ, 属性, 白/色) セルのノーツ数は screenshot と完全一致し、合計 461 になる', () => {
      // 列順: [groupKey, Shout白, Shout色, Beat白, Beat色, Melody白, Melody色]
      const expected: Array<[string, number, number, number, number, number, number]> = [
        ['notes_20',         0,  0, 17,  3,   0,  0], // stage 1.0
        ['light_2',          0,  0, 15,  2,   0,  0], // stage 1.0
        ['light_3',          0,  0, 44,  3,   0,  0], // stage 1.1
        ['light_4',         23,  3, 18,  3,   0,  0], // stage 1.2
        ['light_5',         49,  1,  0,  0,   0,  0], // stage 1.3
        ['light_6',         50, 11,  0,  0,  29,  8], // stage 1.5
        ['chorus_light_5',   0,  0,  0,  0,   0,  0], // stage 2.6
        ['chorus_light_6',   0,  0,  0,  0, 158, 24], // stage 3.0
      ];

      let grandTotal = 0;
      for (const [key, sw, sc, bw, bc, mw, mc] of expected) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const grp = (binaryVampireSong as any)[key];
        expect(grp, `Binary Vampire.${key} が存在する`).toBeDefined();
        expect(grp.shout_white).toBe(sw);
        expect(grp.shout_color).toBe(sc);
        expect(grp.beat_white).toBe(bw);
        expect(grp.beat_color).toBe(bc);
        expect(grp.melody_white).toBe(mw);
        expect(grp.melody_color).toBe(mc);
        grandTotal += sw + sc + bw + bc + mw + mc;
      }
      expect(grandTotal).toBe(461);
    });
  });

  describe('Binary Vampire × 上記デッキ × SCOREUPアシスト ON 時の「ステージ×属性×白/色」スコア小計と合計', () => {
    const team = computeTeam(revale6Deck, allBroachs, binaryVampireSong, [...silverTiers]);
    const notes = flattenNotes(binaryVampireSong, 42);

    it('calcMinScore (アシスト ON) は全セル合計 1,876,289 と一致', () => {
      // スコアに影響するスキルは無い (1500/1923 は タイマースコアアップ、1139 は 判定縮小Perfect)。
      // calcMinScore は「スキル全不発」時の素点、つまり各セル (1ノーツ値×ノーツ数) の総和と同義。
      expect(calcMinScore(team, notes, { scoreUpAssist: true })).toBe(1876289);
    });

    it('ScoreOptions の 4 通り (± SCOREUPアシスト × ± バッジ 15/16%) を適用した calcMinScore', () => {
      // 仕様: アシストは属性値段階で floor(team × 1.2)、バッジは最終合計に floor(base × (1+rate/100))。
      // 2 段階の floor を介するため「assist ON の値 × 1.2 = assist OFF の値」にはならない点に注意。
      expect(calcMinScore(team, notes, { scoreUpAssist: false, scoreUpBadgeRate: 0 })).toBe(1563379);
      expect(calcMinScore(team, notes, { scoreUpAssist: false, scoreUpBadgeRate: 15 })).toBe(1797885);
      expect(calcMinScore(team, notes, { scoreUpAssist: false, scoreUpBadgeRate: 16 })).toBe(1813519);
      expect(calcMinScore(team, notes, { scoreUpAssist: true, scoreUpBadgeRate: 15 })).toBe(2157732);
      expect(calcMinScore(team, notes, { scoreUpAssist: true, scoreUpBadgeRate: 16 })).toBe(2176495);
    });

    it('各 (ステージ, 属性, 白/色) のスコア小計は「1ノーツ値 × ノーツ数」で計算できる', () => {
      const deckShout  = Math.floor(team.Shout  * (1 + SCOREUP_ASSIST_RATE));
      const deckBeat   = Math.floor(team.Beat   * (1 + SCOREUP_ASSIST_RATE));
      const deckMelody = Math.floor(team.Melody * (1 + SCOREUP_ASSIST_RATE));
      const perNote = (deckAttr: number, type: 'white' | 'color', stage: number) =>
        Math.floor(Math.floor(deckAttr * NOTE_RATE[type]) * stage);

      // 列順: [groupKey, Sw, Sc, Bw, Bc, Mw, Mc] (空白セルは 0)
      const expected: Array<[string, number, number, number, number, number, number]> = [
        ['notes_20',             0,     0,  61761, 13080,      0,      0], // 1.0: 3633×17 / 4360×3
        ['light_2',              0,     0,  54495,  8720,      0,      0], // 1.0: 3633×15 / 4360×2
        ['light_3',              0,     0, 175824, 14388,      0,      0], // 1.1: 3996×44 / 4796×3
        ['light_4',          45816,  7170,  78462, 15696,      0,      0], // 1.2: 1992×23 / 2390×3 / 4359×18 / 5232×3
        ['light_5',         105742,  2589,      0,     0,      0,      0], // 1.3: 2158×49 / 2589×1
        ['light_6',         124500, 32868,      0,     0,  79866,  26432], // 1.5: 2490×50 / 2988×11 / 2754×29 / 3304×8
        ['chorus_light_5',       0,     0,      0,     0,      0,      0], // 2.6: (ノーツなし)
        ['chorus_light_6',       0,     0,      0,     0, 870264, 158616], // 3.0: 5508×158 / 6609×24
      ];

      let grandTotal = 0;
      for (const [key, sw, sc, bw, bc, mw, mc] of expected) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const grp = (binaryVampireSong as any)[key];
        const stage = LIGHT_MULTIPLIER[key];
        expect(perNote(deckShout,  'white', stage) * (grp.shout_white  || 0)).toBe(sw);
        expect(perNote(deckShout,  'color', stage) * (grp.shout_color  || 0)).toBe(sc);
        expect(perNote(deckBeat,   'white', stage) * (grp.beat_white   || 0)).toBe(bw);
        expect(perNote(deckBeat,   'color', stage) * (grp.beat_color   || 0)).toBe(bc);
        expect(perNote(deckMelody, 'white', stage) * (grp.melody_white || 0)).toBe(mw);
        expect(perNote(deckMelody, 'color', stage) * (grp.melody_color || 0)).toBe(mc);
        grandTotal += sw + sc + bw + bc + mw + mc;
      }
      expect(grandTotal).toBe(1876289);
    });
  });
});

describe('calcCardSkillMaxActivations (単一カードのスキル最大発動数)', () => {
  const notesCount = monsterGenerationSong.notes_count!;

  it('スキル非所持カード(10th 環: BAD→Perfect)は 0 を返す', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);
    expect(calcCardSkillMaxActivations(team, notesCount, 0)).toBe(0);
  });

  it('空スロット(カード未配置)は 0 を返す', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);
    expect(calcCardSkillMaxActivations(team, notesCount, 3)).toBe(0);
  });

  it('タイマー(JokerFlag2 環 / count=16秒): floor(songDuration 104 / 16) = 6 回', () => {
    const team = computeTeam(jokerFlag2Deck, [], monsterGenerationSong);
    expect(calcCardSkillMaxActivations(team, notesCount, 0)).toBe(6);
  });

  it('スコアアップコンボ(屋外フェス2 壮五 / count=16ノート): floor(428 / 16) = 26 回', () => {
    const team = computeTeam(outdoorFes2Deck, [], monsterGenerationSong);
    expect(calcCardSkillMaxActivations(team, notesCount, 0)).toBe(26);
  });

  describe('判定縮小 2 枚構成(ID1952 フレンド count=20 / ID3597 メンバー1 count=23)', () => {
    // 先頭除外は縮小のスコア影響範囲 (§2 shrink-skill-spec.md) にのみ作用し、
    // 「スキル最大発動回数」は notesCount 全体で算出する。
    const team = computeTeam(threeCardDeck, tenthTamakiBroachs, monsterGenerationSong);

    it('フレンド(ID1952): floor(notes_count 428 / 20) = 21 回', () => {
      expect(calcCardSkillMaxActivations(team, notesCount, 5)).toBe(21);
    });

    it('メンバー1(ID3597): floor(notes_count 428 / 23) = 18 回', () => {
      expect(calcCardSkillMaxActivations(team, notesCount, 1)).toBe(18);
    });

    it('センター(10th 環: スキル非所持)は 0', () => {
      expect(calcCardSkillMaxActivations(team, notesCount, 0)).toBe(0);
    });
  });

  describe('Binary Vampire (ID60 / notes_count=461) × ID1923 (記念日2024 百 / 判定縮小Lv5 count=22) 単独デッキ', () => {
    const deck1923 = [card1923, null, null, null, null, null];
    const team = computeTeam(deck1923, [], binaryVampireSong);
    const bvNotesCount = binaryVampireSong.notes_count!;

    it('前提: Binary Vampire のノーツ数は 461', () => {
      expect(bvNotesCount).toBe(461);
    });

    it('前提: ID1923 Lv5 は 判定縮小(Perfect) / count=22 / per=42 / value=4 / rate=1.6', () => {
      const card = team.cards.find((c) => c.slotIndex === 0)!;
      expect(card.skill).not.toBeNull();
      expect(card.skill!.isShrink).toBe(true);
      expect(card.skill!.count).toBe(22);
      expect(card.skill!.per).toBe(42);
      expect(card.skill!.value).toBe(4);
      expect(card.skill!.rate).toBe(1.6);
    });

    it('スキル最大発動回数: floor(461 / 22) = 20 回', () => {
      expect(calcCardSkillMaxActivations(team, bvNotesCount, 0)).toBe(20);
    });
  });

  describe('判定縮小（タイマー）は秒数発動なので songDuration を分母とする', () => {
    // 判定縮小（タイマー）の count は秒数。スコアアップ（タイマー）と同じ扱いで
    // floor(songDuration / count) を返さなければならない。
    const shrinkTimerCard = findCardById(976); // 音に想いをのせて 和泉一織 / 判定縮小（タイマー） / Lv5 count=23 秒
    const deck = [shrinkTimerCard, null, null, null, null, null];
    const team = computeTeam(deck, [], binaryVampireSong);
    const bvNotesCount = binaryVampireSong.notes_count!;

    it('前提: ID976 Lv5 は 判定縮小（タイマー） / count=23 秒', () => {
      const card = team.cards.find((c) => c.slotIndex === 0)!;
      expect(card.skill).not.toBeNull();
      expect(card.skill!.isShrink).toBe(true);
      expect(card.skill!.count).toBe(23);
    });

    it('Binary Vampire (songDuration=92): floor(92 / 23) = 4 回', () => {
      expect(team.songDuration).toBe(92);
      expect(calcCardSkillMaxActivations(team, bvNotesCount, 0)).toBe(4);
    });
  });
});
