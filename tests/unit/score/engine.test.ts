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
