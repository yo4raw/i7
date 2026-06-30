import { describe, it, expect } from 'vitest';
import { formatSkillEffect, getMaxApSkillLevel } from '../../../src/lib/score/skillFormatter';
import { SKILL_TYPE, type ApSkillLevel, type Card } from '../../../src/lib/data/fetchCardsJson';

const sl = (
  count: number | null,
  per: number | null,
  value: number | null,
  rate: number | null = null,
): ApSkillLevel => ({ count, per, value, rate });

describe('formatSkillEffect: req=null での空プレフィックス (L26, L32, L35)', () => {
  it('判定縮小 (回数系) で req=null なら接頭辞なし (L26)', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK, null, sl(30, 40, 8, 250)))
      .toBe('30回毎に40％の確率で8秒間判定領域を縮小してスコアを2.5倍に');
  });

  it('BAD→Perfect (回数系) で req=null なら接頭辞なし (L32)', () => {
    expect(formatSkillEffect(SKILL_TYPE.BAD_TO_PERFECT, null, sl(30, 45, 5)))
      .toBe('30回毎に45％の確率で5秒間BAD以上をPerfectに');
  });

  it('スコアアップ (プレフィックス系) で req=null なら接頭辞なし (L35)', () => {
    expect(formatSkillEffect('スコアアップ（コンボ）', null, sl(25, 35, 250)))
      .toBe('25回毎に35％の確率でスコア250UP');
  });
});

/** スキルレベル別フィールドを持つ最小 Card を組み立てる (一部フィールドを null にできる) */
function makeCard(
  level: 1 | 2 | 3 | 4 | 5,
  fields: { count: number | null; per: number | null; value: number | null },
): Card {
  const card: Record<string, unknown> = { ap_skill_type: SKILL_TYPE.SCOREUP_TIMER, ap_skill_req: null };
  for (let i = 1; i <= 5; i++) {
    card[`ap_skill_${i}_count`] = null;
    card[`ap_skill_${i}_per`] = null;
    card[`ap_skill_${i}_value`] = null;
    card[`ap_skill_${i}_rate`] = null;
  }
  card[`ap_skill_${level}_count`] = fields.count;
  card[`ap_skill_${level}_per`] = fields.per;
  card[`ap_skill_${level}_value`] = fields.value;
  return card as unknown as Card;
}

describe('getMaxApSkillLevel: value が null のレベルは無効扱い (L49 ?? 0)', () => {
  it('count/per > 0 でも value=null なら null (有効レベルなし)', () => {
    const card = makeCard(5, { count: 15, per: 40, value: null });
    expect(getMaxApSkillLevel(card)).toBeNull();
  });

  it('count>0 per>0 value>0 なら有効レベルとして返る (対照)', () => {
    const card = makeCard(5, { count: 15, per: 40, value: 300 });
    expect(getMaxApSkillLevel(card)).toBe(5);
  });
});
