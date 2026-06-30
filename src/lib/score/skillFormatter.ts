import type { ApSkillLevel, Card } from '../data/fetchCardsJson';
import { SKILL_TYPE, getApSkillLevel } from '../data/fetchCardsJson';

/**
 * スキル種別・発動条件・レベル別数値から自然文の効果表示を生成する。
 * 非公式DB (i7.step-on-dream.net) のスキル行表記と一致する文面を返す。
 */
export function formatSkillEffect(
  skillType: string | null,
  req: string | null,
  sl: ApSkillLevel,
): string {
  if (!skillType || !isValidApSkillLevel(sl)) return '-';
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

/**
 * スキルレベルが有効データ（登録済み）かどうかを判定する。
 * 「有効」= count/per/value がいずれも 0 より大きい。null・0 は未登録扱い。
 * 新規衣装で値が 0 埋めになっているレベルや、欠損レベルを除外する用途で使う。
 */
export function isValidApSkillLevel(sl: ApSkillLevel): boolean {
  return (sl.count ?? 0) > 0 && (sl.per ?? 0) > 0 && (sl.value ?? 0) > 0;
}

/**
 * 数値（count/per/value）が有効な最上位スキルレベルを返す。
 * Lv5 が無い衣装（SSR）や Lv5 未登録の新規衣装（値が 0 で埋まっている）は Lv4 以下に
 * フォールバックする。いずれのレベルも有効でなければ null。
 */
export function getMaxApSkillLevel(card: Card): 1 | 2 | 3 | 4 | 5 | null {
  for (const level of [5, 4, 3, 2, 1] as const) {
    if (isValidApSkillLevel(getApSkillLevel(card, level))) return level;
  }
  return null;
}

/**
 * 衣装の「最上位レベルの効果文」を生成する。一覧リストでの表示用。
 * 効果文を持たない種別（スキルなし・判定補助系など）や該当レベル無しは null を返す。
 */
export function formatSkillEffectMax(card: Card): { level: 1 | 2 | 3 | 4 | 5; text: string } | null {
  const level = getMaxApSkillLevel(card);
  if (level == null) return null;
  const text = formatSkillEffect(card.ap_skill_type, card.ap_skill_req, getApSkillLevel(card, level));
  if (text === '-') return null;
  return { level, text };
}

/**
 * スキル種別を一覧表示用の短いラベルに変換する。
 * 判定強化(BAD→Perfect) / 判定ガード(MISS→Perfect) は括弧表記が長く
 * 固定幅カラムでレイアウトが崩れるため、括弧部分を除いた表記を返す。
 * それ以外の種別（タイマー区別を含む）はそのまま返す。
 */
export function skillTypeShortLabel(skillType: string | null | undefined): string {
  if (!skillType) return 'スキルなし';
  if (skillType === SKILL_TYPE.BAD_TO_PERFECT) return '判定強化';
  if (skillType === SKILL_TYPE.MISS_TO_PERFECT) return '判定ガード';
  return skillType;
}

export interface SkillBadge {
  /** セル表示用の短縮ラベル */
  label: string;
  /** 判定縮小系（強調表示の対象） */
  isShrink: boolean;
}

/**
 * スキル種別の短縮ラベルと判定縮小フラグを生成する。
 * SNS共有パネル・イベント詳細の特効グリッド等で使用する。
 * 発動条件 (ap_skill_req) は呼び出し側が別途表示するため含めない。
 */
export function formatSkillBadge(skillType: string | null): SkillBadge {
  if (!skillType) return { label: '-', isShrink: false };
  if (skillType === SKILL_TYPE.SHRINK || skillType.startsWith(SKILL_TYPE.SHRINK_PREFIX)) {
    return { label: '判定縮小', isShrink: true };
  }
  if (skillType.startsWith(SKILL_TYPE.SCOREUP_PREFIX) || skillType === 'スコアアップ') {
    return { label: 'スコアアップ', isShrink: false };
  }
  if (skillType === SKILL_TYPE.BAD_TO_PERFECT) {
    return { label: 'BAD→Perfect', isShrink: false };
  }
  if (skillType === SKILL_TYPE.MISS_TO_PERFECT) {
    return { label: 'MISS→Perfect', isShrink: false };
  }
  if (skillType === '判定拡大スコアダウン') {
    return { label: '判定拡大', isShrink: false };
  }
  return { label: skillType, isShrink: false };
}
