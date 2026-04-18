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
import { CENTER_SKILL_RATES, SCOREUP_ASSIST_MULTIPLIER } from '../../../src/lib/score/constants';
import { monsterGenerationSong, tenthTamakiMainCard } from '../../fixtures';

const FLATTEN_SEED = 42;
const MC_SEED = 42;
const MC_ITERATIONS = 100;

const emptyDeck: (Card | null)[] = [null, null, null, null, null, null];
const centerDeck: (Card | null)[] = [tenthTamakiMainCard, null, null, null, null, null];

describe('10th Anniversary 四葉環 as center on MONSTER GENERATiON', () => {
  describe('getCenterSkillRate', () => {
    it('returns 10% for UR rarity (matches CENTER_SKILL_RATES table)', () => {
      expect(getCenterSkillRate('UR')).toBe(CENTER_SKILL_RATES.UR);
      expect(getCenterSkillRate(tenthTamakiMainCard.rarity)).toBe(10);
    });

    it('returns 0 for null rarity', () => {
      expect(getCenterSkillRate(null)).toBe(0);
    });
  });

  describe('computeTeam', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);

    it('raw attribute values match the trained *_max stats of 10th 環', () => {
      expect(team.rawShout).toBe(tenthTamakiMainCard.shout_max);
      expect(team.rawBeat).toBe(tenthTamakiMainCard.beat_max);
      expect(team.rawMelody).toBe(tenthTamakiMainCard.melody_max);
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

  describe('runSimulation (seed-fixed, deterministic)', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);

    it('matches theoretical min/max and keeps mcMin/mcMax within bounds', async () => {
      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);

      expect(result.minScore).toBe(calcMinScore(team, notes));
      expect(result.maxScore).toBe(calcMaxScore(team, notes));
      expect(result.mcMin).toBeGreaterThanOrEqual(result.minScore);
      expect(result.mcMax).toBeLessThanOrEqual(result.maxScore);
      expect(result.scores).toHaveLength(MC_ITERATIONS);
      expect(result.mean).toBeGreaterThanOrEqual(result.minScore);
      expect(result.mean).toBeLessThanOrEqual(result.maxScore);
    });

    it('cardStats reports the center card with its original skill type', async () => {
      const result = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);

      expect(result.cardStats).toHaveLength(1);
      expect(result.cardStats[0].cardIndex).toBe(0);
      expect(result.cardStats[0].cardname).toBe(tenthTamakiMainCard.cardname);
      expect(result.cardStats[0].skillType).toBe(tenthTamakiMainCard.ap_skill_type);
      expect(result.cardStats[0].theoreticalRate).toBe(tenthTamakiMainCard.ap_skill_5_per);
    });

    it('is deterministic — two runs with the same seed produce identical scores', async () => {
      const r1 = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      const r2 = await runSimulation(team, notes, MC_ITERATIONS, undefined, MC_SEED);
      expect(r2.scores).toEqual(r1.scores);
      expect(r2.mean).toBe(r1.mean);
    });
  });

  describe('calcExpectedScore', () => {
    const team = computeTeam(centerDeck, [], monsterGenerationSong);
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED);
    const notesCount = monsterGenerationSong.notes_count!;
    const expected = calcExpectedScore(team, notes, notesCount);

    it('baseScore equals calcMinScore (no broach / no badge)', () => {
      expect(expected.baseScore).toBe(calcMinScore(team, notes));
    });

    it('scoreUpExpected matches closed-form: floor(notes / count × per/100 × value)', () => {
      const count = tenthTamakiMainCard.ap_skill_5_count!;
      const per = tenthTamakiMainCard.ap_skill_5_per!;
      const value = tenthTamakiMainCard.ap_skill_5_value!;
      const closedForm = Math.floor((notesCount / count) * (per / 100) * value);
      expect(expected.scoreUpExpected).toBe(closedForm);
    });

    it('shrinkExpected is 0 because 10th 環 has no shrink skill', () => {
      expect(expected.shrinkExpected).toBe(0);
    });

    it('finalScore sums all components and broach bonus', () => {
      expect(expected.finalScore).toBe(
        expected.baseScore + expected.scoreUpExpected + expected.shrinkExpected + team.broachScoreBonus,
      );
      expect(expected.liveEndScore).toBe(
        expected.baseScore + expected.scoreUpExpected + expected.shrinkExpected,
      );
    });
  });
});
