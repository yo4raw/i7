import { describe, it, expect } from 'vitest';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import {
  computeTeam, flattenNotes, computeShrinkExclusion, computeGroupSizes,
  calcCardSkillExpected, calcCardSkillMax,
} from '../../../src/lib/score/engine';
import { findCardById, findSongById } from '../../fixtures';

const song = findSongById(2);
const notesCount = song.notes_count!;
const SEED = 42;

const timerScoreUp = findCardById(1172); // タイマー scoreUp count=16秒 per=47 value=7200
const comboScoreUp = findCardById(410);  // コンボ scoreUp count=16 per=46 value=6403
const shrinkCard = findCardById(2618);   // 判定縮小 Perfect
const noSkillCard = findCardById(2484);  // BAD→Perfect (寄与なし)

const deckOf = (c: Card, slot = 0): (Card | null)[] => {
  const d: (Card | null)[] = [null, null, null, null, null, null];
  d[slot] = c;
  return d;
};

describe('calcCardSkillExpected', () => {
  it('タイマー scoreUp: floor(maxAct × per/100 × value) = 20304', () => {
    const team = computeTeam(deckOf(timerScoreUp), [], song);
    const notes = flattenNotes(song, SEED);
    expect(calcCardSkillExpected(team, notes, notesCount, 0)).toBe(20304);
  });

  it('コンボ scoreUp: floor(26 × 0.46 × 6403) = 76579', () => {
    const team = computeTeam(deckOf(comboScoreUp), [], song);
    const notes = flattenNotes(song, SEED);
    expect(calcCardSkillExpected(team, notes, notesCount, 0)).toBe(76579);
  });

  it('判定縮小カード: 正の期待値を返す', () => {
    const team = computeTeam(deckOf(shrinkCard), [], song);
    const ex = computeShrinkExclusion(team, computeGroupSizes(song));
    const notes = flattenNotes(song, SEED, ex);
    expect(calcCardSkillExpected(team, notes, notesCount, 0)).toBeGreaterThan(0);
  });

  it('カード未配置スロットは 0', () => {
    const team = computeTeam(deckOf(timerScoreUp), [], song);
    expect(calcCardSkillExpected(team, flattenNotes(song, SEED), notesCount, 3)).toBe(0);
  });

  it('スキル非所持カードは 0', () => {
    const team = computeTeam(deckOf(noSkillCard), [], song);
    expect(calcCardSkillExpected(team, flattenNotes(song, SEED), notesCount, 0)).toBe(0);
  });

  it('notesCount=0（denom<=0）は 0', () => {
    const team = computeTeam(deckOf(comboScoreUp), [], song);
    expect(calcCardSkillExpected(team, flattenNotes(song, SEED), 0, 0)).toBe(0);
  });
});

describe('calcCardSkillMax', () => {
  it('タイマー scoreUp: 6 × 7200 = 43200', () => {
    const team = computeTeam(deckOf(timerScoreUp), [], song);
    expect(calcCardSkillMax(team, flattenNotes(song, SEED), notesCount, 0)).toBe(43200);
  });

  it('コンボ scoreUp: 26 × 6403 = 166478', () => {
    const team = computeTeam(deckOf(comboScoreUp), [], song);
    expect(calcCardSkillMax(team, flattenNotes(song, SEED), notesCount, 0)).toBe(166478);
  });

  it('判定縮小カード: 正の最大値を返す', () => {
    const team = computeTeam(deckOf(shrinkCard), [], song);
    const ex = computeShrinkExclusion(team, computeGroupSizes(song));
    const notes = flattenNotes(song, SEED, ex);
    expect(calcCardSkillMax(team, notes, notesCount, 0)).toBeGreaterThan(0);
  });

  it('未配置スロット / notesCount=0 は 0', () => {
    const team = computeTeam(deckOf(comboScoreUp), [], song);
    expect(calcCardSkillMax(team, flattenNotes(song, SEED), notesCount, 3)).toBe(0);
    expect(calcCardSkillMax(team, flattenNotes(song, SEED), 0, 0)).toBe(0);
  });
});
