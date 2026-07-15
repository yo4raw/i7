import { describe, it, expect } from 'vitest';
import { skillTypeShortLabel } from '../../../src/lib/score/skillFormatter';
import { SKILL_TYPE } from '../../../src/lib/data/fetchCardsJson';

describe('skillTypeShortLabel', () => {
  it('null / undefined / 空文字は「スキルなし」', () => {
    expect(skillTypeShortLabel(null)).toBe('スキルなし');
    expect(skillTypeShortLabel()).toBe('スキルなし');
    expect(skillTypeShortLabel('')).toBe('スキルなし');
  });

  it('BAD→Perfect は「判定強化」に短縮', () => {
    expect(skillTypeShortLabel(SKILL_TYPE.BAD_TO_PERFECT)).toBe('判定強化');
  });

  it('MISS→Perfect は「判定ガード」に短縮', () => {
    expect(skillTypeShortLabel(SKILL_TYPE.MISS_TO_PERFECT)).toBe('判定ガード');
  });

  it('その他の種別はそのまま返す', () => {
    expect(skillTypeShortLabel('スコアアップ（タイマー）')).toBe('スコアアップ（タイマー）');
  });
});
