import type { ApSkillLevel } from '../data/fetchCardsJson';
import { SKILL_TYPE } from '../data/fetchCardsJson';

/**
 * スキル種別・発動条件・レベル別数値から自然文の効果表示を生成する。
 * 非公式DB (i7.step-on-dream.net) のスキル行表記と一致する文面を返す。
 */
export function formatSkillEffect(
  skillType: string | null,
  req: string | null,
  sl: ApSkillLevel,
): string {
  if (!skillType || sl.count == null || sl.per == null || sl.value == null) return '-';
  const c = sl.count;
  const p = sl.per;
  const v = sl.value;
  if (skillType === SKILL_TYPE.SCOREUP_TIMER) {
    return `${c}秒毎に${p}％の確率でスコア${v}UP`;
  }
  if (skillType === SKILL_TYPE.SHRINK || skillType.startsWith(SKILL_TYPE.SHRINK_PREFIX)) {
    if (sl.rate == null) return '-';
    const mult = sl.rate >= 10 ? sl.rate / 100 : sl.rate;
    if (skillType === SKILL_TYPE.SHRINK_TIMER) {
      return `${c}秒毎に${p}％の確率で${v}秒間判定領域を縮小してスコアを${mult}倍に`;
    }
    return `${req ?? ''}${c}回毎に${p}％の確率で${v}秒間判定領域を縮小してスコアを${mult}倍に`;
  }
  if (skillType === SKILL_TYPE.BAD_TO_PERFECT) {
    if (req === 'タイマー') {
      return `${c}秒毎に${p}％の確率で${v}秒間BAD以上をPerfectに`;
    }
    return `${req ?? ''}${c}回毎に${p}％の確率で${v}秒間BAD以上をPerfectに`;
  }
  if (skillType.startsWith(SKILL_TYPE.SCOREUP_PREFIX)) {
    return `${req ?? ''}${c}回毎に${p}％の確率でスコア${v}UP`;
  }
  return '-';
}
