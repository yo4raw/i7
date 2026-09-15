import { describe, it, expect } from 'vitest';
import { computeTeam, flattenNotes, runSimulation } from '../../../src/lib/score/engine';
import { summarizeScores } from '../../../src/lib/score/simulation';
import { mergeSimulationResults, splitIterations } from '../../../src/lib/score/simulationPool';
import { findCardById, findSongById } from '../../fixtures';

const song = findSongById(2);
const team = computeTeam([findCardById(1172), findCardById(410), null, null, null, null], [], song);
const notes = flattenNotes(song, 42);

describe('splitIterations', () => {
  it('合計が一致し、端数は先頭から配る', () => {
    expect(splitIterations(100, 3)).toEqual([34, 33, 33]);
    expect(splitIterations(2, 4)).toEqual([1, 1]);
  });
});

describe('mergeSimulationResults', () => {
  it('分割実行の合成が、全スコアから直接求めた統計と一致する', async () => {
    const a = await runSimulation(team, notes, 60, undefined, 1);
    const b = await runSimulation(team, notes, 40, undefined, 2);
    const merged = mergeSimulationResults([a, b]);
    const scores = [...a.scores, ...b.scores];
    expect(merged.scores).toEqual(scores);
    expect(merged).toMatchObject(summarizeScores(scores));
    expect(merged.minScore).toBe(a.minScore);
    expect(merged.maxScore).toBe(a.maxScore);
    expect(merged.shrinkScores).toHaveLength(100);
    // カード統計は試行回数の加重平均
    for (let i = 0; i < merged.cardStats.length; i++) {
      const w = (a.cardStats[i].avgActivations * 60 + b.cardStats[i].avgActivations * 40) / 100;
      expect(merged.cardStats[i].avgActivations).toBeCloseTo(w, 10);
      expect(merged.cardStats[i].cardname).toBe(a.cardStats[i].cardname);
    }
  });
  it('1 件ならそのまま返す', async () => {
    const a = await runSimulation(team, notes, 10, undefined, 1);
    expect(mergeSimulationResults([a])).toBe(a);
  });
});
