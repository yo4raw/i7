import { describe, it, expect } from 'vitest';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import { computeTeam, flattenNotes, calcMinScore, calcMaxScore, runSimulation } from '../../../src/lib/score/engine';
import { findCardById, findSongById } from '../../fixtures';

const monsterGeneration = findSongById(2);
const MC_SEED = 42;

/** JokerFlag2 四葉環 (スコアアップ タイマー / Lv5 count=16秒 per=47 value=7200) */
const timerScoreUpCard = findCardById(1172);
/** 屋外フェス2 逢坂壮五 (スコアアップ コンボ / Lv5 count=16ノート per=46 value=6403) */
const comboScoreUpCard = findCardById(410);

const deckOf = (c: Card): (Card | null)[] => [c, null, null, null, null, null];

describe('runSimulation: タイマー型スコアアップ (MC 分岐)', () => {
  const team = computeTeam(deckOf(timerScoreUpCard), [], monsterGeneration);
  const notes = flattenNotes(monsterGeneration, MC_SEED);

  it('確率発動でスコアが minScore〜maxScore の範囲に分布する', async () => {
    const r = await runSimulation(team, notes, 200, undefined, MC_SEED);
    const min = calcMinScore(team, notes);
    const max = calcMaxScore(team, notes);
    expect(r.mcMin).toBeGreaterThanOrEqual(min);
    expect(r.mcMax).toBeLessThanOrEqual(max);
    expect(r.mean).toBeGreaterThan(min);
    const stat = r.cardStats.find((s) => s.skillType.includes('スコアアップ'));
    expect(stat).toBeDefined();
    expect(stat!.avgActivations).toBeGreaterThan(0);
    expect(r.scoreUpScores.length).toBe(200);
  });

  it('maxScoreUpCoverage: true で常時発動 → 平均が maxScore 近傍、発動回数=理論最大(6)', async () => {
    const max = calcMaxScore(team, notes);
    const r = await runSimulation(team, notes, 30, undefined, MC_SEED, {
      scoreUpAssist: false, maxScoreUpCoverage: true,
    });
    expect(Math.abs(r.mean - max) / max).toBeLessThan(0.001);
    const stat = r.cardStats.find((s) => s.skillType.includes('スコアアップ'));
    expect(stat!.avgActivations).toBe(6);
  });
});

describe('runSimulation: 通常型スコアアップ (コンボ, Phase B 分岐)', () => {
  const team = computeTeam(deckOf(comboScoreUpCard), [], monsterGeneration);
  const notes = flattenNotes(monsterGeneration, MC_SEED);

  it('確率発動でスコアアップ寄与が発生する', async () => {
    const r = await runSimulation(team, notes, 200, undefined, MC_SEED);
    expect(r.mean).toBeGreaterThan(calcMinScore(team, notes));
    const stat = r.cardStats.find((s) => s.skillType.includes('スコアアップ'));
    expect(stat!.avgActivations).toBeGreaterThan(0);
  });

  it('maxScoreUpCoverage: true で発動回数=理論最大(26)、平均が maxScore 近傍', async () => {
    const max = calcMaxScore(team, notes);
    const r = await runSimulation(team, notes, 30, undefined, MC_SEED, {
      scoreUpAssist: false, maxScoreUpCoverage: true,
    });
    const stat = r.cardStats.find((s) => s.skillType.includes('スコアアップ'));
    expect(stat!.avgActivations).toBe(26);
    expect(Math.abs(r.mean - max) / max).toBeLessThan(0.001);
  });

  it('onProgress コールバックが進捗(0〜1)で呼ばれる', async () => {
    const pcts: number[] = [];
    await runSimulation(team, notes, 50, (p) => pcts.push(p), MC_SEED);
    expect(pcts.length).toBeGreaterThan(0);
    expect(pcts[pcts.length - 1]).toBe(1);
  });
});
