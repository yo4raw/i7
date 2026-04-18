import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import {
  calcExpectedScore,
  calcMaxScore,
  calcMinScore,
  computeTeam,
  flattenNotes,
  getCenterSkillRate,
  runSimulation,
} from '../../../src/lib/score/engine';
import { CENTER_SKILL_RATES, SCOREUP_ASSIST_MULTIPLIER, TRAIN_BONUS } from '../../../src/lib/score/constants';
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

    it('assisted values are floor(boosted × 1.2) per attribute', () => {
      expect(team.ShoutAssisted).toBe(Math.floor(team.Shout * SCOREUP_ASSIST_MULTIPLIER));
      expect(team.BeatAssisted).toBe(Math.floor(team.Beat * SCOREUP_ASSIST_MULTIPLIER));
      expect(team.MelodyAssisted).toBe(Math.floor(team.Melody * SCOREUP_ASSIST_MULTIPLIER));
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

    it('スコア総計は docs/unit-test-case.md の理論値 163,097 と一致する', async () => {
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
