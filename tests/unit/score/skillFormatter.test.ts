import { describe, it, expect } from 'vitest';
import { formatSkillEffect, formatSkillBadge } from '../../../src/lib/score/skillFormatter';
import { SKILL_TYPE, type ApSkillLevel } from '../../../src/lib/data/fetchCardsJson';

const sl = (
  count: number | null,
  per: number | null,
  value: number | null,
  rate: number | null = null,
): ApSkillLevel => ({ count, per, value, rate });

describe('formatSkillEffect (スキル効果の自然文生成)', () => {
  it('スコアアップ（タイマー）: 秒毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.SCOREUP_TIMER, null, sl(15, 40, 300)))
      .toBe('15秒毎に40％の確率でスコア300UP');
  });

  it('スコアアップ（Perfectのみ）: 発動条件プレフィックス + 回毎表記', () => {
    expect(formatSkillEffect('スコアアップ（Perfectのみ）', 'Perfect', sl(25, 35, 250)))
      .toBe('Perfect25回毎に35％の確率でスコア250UP');
  });

  it('判定縮小スコアアップ: rate >= 10 は 1/100 して倍率表示', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK, 'コンボ', sl(30, 40, 8, 250)))
      .toBe('コンボ30回毎に40％の確率で8秒間判定領域を縮小してスコアを2.5倍に');
  });

  it('判定縮小スコアアップ: rate < 10 はそのまま倍率表示', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK, 'コンボ', sl(30, 40, 8, 2.5)))
      .toBe('コンボ30回毎に40％の確率で8秒間判定領域を縮小してスコアを2.5倍に');
  });

  it('判定縮小（タイマー）: 秒毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK_TIMER, null, sl(20, 50, 6, 300)))
      .toBe('20秒毎に50％の確率で6秒間判定領域を縮小してスコアを3倍に');
  });

  it('BAD以上をPerfectに変更 (req=タイマー): 秒毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.BAD_TO_PERFECT, 'タイマー', sl(20, 45, 5)))
      .toBe('20秒毎に45％の確率で5秒間BAD以上をPerfectに');
  });

  it('BAD以上をPerfectに変更 (req=コンボ): 回毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.BAD_TO_PERFECT, 'コンボ', sl(30, 45, 5)))
      .toBe('コンボ30回毎に45％の確率で5秒間BAD以上をPerfectに');
  });

  it('skillType が null なら "-"', () => {
    expect(formatSkillEffect(null, null, sl(10, 10, 10))).toBe('-');
  });

  it('レベル値 (count/per/value) が欠けていたら "-"', () => {
    expect(formatSkillEffect(SKILL_TYPE.SCOREUP_TIMER, null, sl(null, 40, 300))).toBe('-');
  });

  it('縮小系で rate が null なら "-"', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK, 'コンボ', sl(30, 40, 8, null))).toBe('-');
  });

  it('未知のスキル種別は "-"', () => {
    expect(formatSkillEffect('謎スキル', null, sl(10, 10, 10))).toBe('-');
  });
});

describe('formatSkillBadge (SNS共有パネル用の短縮ラベル)', () => {
  it('スコアアップ系は発動条件によらず「スコアアップ」', () => {
    expect(formatSkillBadge('スコアアップ（コンボ）')).toEqual({ label: 'スコアアップ', isShrink: false });
    expect(formatSkillBadge('スコアアップ（Perfect）')).toEqual({ label: 'スコアアップ', isShrink: false });
    expect(formatSkillBadge(SKILL_TYPE.SCOREUP_TIMER)).toEqual({ label: 'スコアアップ', isShrink: false });
  });

  it('判定縮小系は isShrink が立つ', () => {
    expect(formatSkillBadge('判定縮小（Perfect）')).toEqual({ label: '判定縮小', isShrink: true });
    expect(formatSkillBadge('判定縮小（コンボ）')).toEqual({ label: '判定縮小', isShrink: true });
    expect(formatSkillBadge(SKILL_TYPE.SHRINK_TIMER)).toEqual({ label: '判定縮小', isShrink: true });
    expect(formatSkillBadge(SKILL_TYPE.SHRINK)).toEqual({ label: '判定縮小', isShrink: true });
  });

  it('判定変更系は矢印表記に短縮する', () => {
    expect(formatSkillBadge(SKILL_TYPE.BAD_TO_PERFECT)).toEqual({ label: 'BAD→Perfect', isShrink: false });
    expect(formatSkillBadge('MISS以上をPerfectに変更')).toEqual({ label: 'MISS→Perfect', isShrink: false });
    expect(formatSkillBadge('MISS→Perfect')).toEqual({ label: 'MISS→Perfect', isShrink: false });
    expect(formatSkillBadge(SKILL_TYPE.MISS_TO_GOOD)).toEqual({ label: 'MISS→Good', isShrink: false });
  });

  it('判定拡大スコアダウンは「判定拡大」', () => {
    expect(formatSkillBadge('判定拡大スコアダウン')).toEqual({ label: '判定拡大', isShrink: false });
  });

  it('null は「-」、未知の種別はそのまま返す', () => {
    expect(formatSkillBadge(null)).toEqual({ label: '-', isShrink: false });
    expect(formatSkillBadge('謎スキル')).toEqual({ label: '謎スキル', isShrink: false });
  });
});
