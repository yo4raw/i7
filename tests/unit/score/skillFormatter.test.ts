import { describe, it, expect } from 'vitest';
import { formatSkillEffect, formatSkillBadge, getMaxApSkillLevel, formatSkillEffectMax, isValidApSkillLevel } from '../../../src/lib/score/skillFormatter';
import { SKILL_TYPE, type ApSkillLevel, type Card } from '../../../src/lib/data/fetchCardsJson';

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

  it('レベル値 (count/per/value) のいずれかが 0（未登録）なら "-"', () => {
    expect(formatSkillEffect(SKILL_TYPE.SCOREUP_TIMER, null, sl(0, 0, 0))).toBe('-');
    expect(formatSkillEffect(SKILL_TYPE.SCOREUP_TIMER, null, sl(15, 0, 300))).toBe('-');
    expect(formatSkillEffect('スコアアップ（Perfectのみ）', 'Perfect', sl(25, 35, 0))).toBe('-');
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
    expect(formatSkillBadge(SKILL_TYPE.MISS_TO_PERFECT)).toEqual({ label: 'MISS→Perfect', isShrink: false });
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

/** スキルレベル別フィールドを持つ最小 Card を組み立てる */
function makeCardWithLevels(
  skillType: string | null,
  req: string | null,
  levels: Partial<Record<1 | 2 | 3 | 4 | 5, { count: number; per: number; value: number; rate?: number }>>,
): Card {
  const card: Record<string, unknown> = { ap_skill_type: skillType, ap_skill_req: req };
  for (let i = 1; i <= 5; i++) {
    const lv = levels[i as 1 | 2 | 3 | 4 | 5];
    card[`ap_skill_${i}_count`] = lv?.count ?? null;
    card[`ap_skill_${i}_per`] = lv?.per ?? null;
    card[`ap_skill_${i}_value`] = lv?.value ?? null;
    card[`ap_skill_${i}_rate`] = lv?.rate ?? null;
  }
  return card as unknown as Card;
}

describe('isValidApSkillLevel (レベルが有効データか)', () => {
  it('count/per/value がすべて 0 より大きければ true', () => {
    expect(isValidApSkillLevel(sl(15, 40, 300))).toBe(true);
    expect(isValidApSkillLevel(sl(15, 40, 300, 250))).toBe(true);
  });

  it('count/per/value のいずれかが 0 なら false（未登録扱い）', () => {
    expect(isValidApSkillLevel(sl(0, 0, 0))).toBe(false);
    expect(isValidApSkillLevel(sl(0, 40, 300))).toBe(false);
    expect(isValidApSkillLevel(sl(15, 0, 300))).toBe(false);
    expect(isValidApSkillLevel(sl(15, 40, 0))).toBe(false);
  });

  it('count/per/value のいずれかが null なら false', () => {
    expect(isValidApSkillLevel(sl(null, 40, 300))).toBe(false);
    expect(isValidApSkillLevel(sl(15, null, 300))).toBe(false);
    expect(isValidApSkillLevel(sl(15, 40, null))).toBe(false);
  });
});

describe('getMaxApSkillLevel (最上位スキルレベルの判定)', () => {
  it('Lv5 まで揃っていれば 5', () => {
    const card = makeCardWithLevels(SKILL_TYPE.SCOREUP_TIMER, null, {
      1: { count: 15, per: 30, value: 100 },
      5: { count: 15, per: 45, value: 300 },
    });
    expect(getMaxApSkillLevel(card)).toBe(5);
  });

  it('Lv5 が無い（SSR等）なら Lv4 にフォールバック', () => {
    const card = makeCardWithLevels(SKILL_TYPE.SCOREUP_TIMER, null, {
      1: { count: 15, per: 30, value: 100 },
      4: { count: 15, per: 40, value: 250 },
    });
    expect(getMaxApSkillLevel(card)).toBe(4);
  });

  it('Lv5 が未登録（0 埋め）なら Lv4 にフォールバック', () => {
    const card = makeCardWithLevels(SKILL_TYPE.SCOREUP_TIMER, null, {
      4: { count: 12, per: 44, value: 2662 },
      5: { count: 0, per: 0, value: 0 },
    });
    expect(getMaxApSkillLevel(card)).toBe(4);
  });

  it('レベルデータが全く無ければ null', () => {
    const card = makeCardWithLevels(SKILL_TYPE.SCOREUP_TIMER, null, {});
    expect(getMaxApSkillLevel(card)).toBeNull();
  });

  it('全レベル 0 埋め（完全未登録）なら null', () => {
    const card = makeCardWithLevels(SKILL_TYPE.SCOREUP_TIMER, null, {
      1: { count: 0, per: 0, value: 0 },
      5: { count: 0, per: 0, value: 0 },
    });
    expect(getMaxApSkillLevel(card)).toBeNull();
  });
});

describe('formatSkillEffectMax (一覧用 最上位レベル効果文)', () => {
  it('最上位レベルの効果文とレベル番号を返す', () => {
    const card = makeCardWithLevels(SKILL_TYPE.SCOREUP_TIMER, null, {
      4: { count: 15, per: 40, value: 250 },
    });
    expect(formatSkillEffectMax(card)).toEqual({ level: 4, text: '15秒毎に40％の確率でスコア250UP' });
  });

  it('効果文を持たない種別（判定補助系）は null', () => {
    const card = makeCardWithLevels(SKILL_TYPE.MISS_TO_PERFECT, null, {
      5: { count: 10, per: 30, value: 5 },
    });
    expect(formatSkillEffectMax(card)).toBeNull();
  });

  it('スキルデータ無しは null', () => {
    expect(formatSkillEffectMax(makeCardWithLevels(null, null, {}))).toBeNull();
  });
});
