export const NOTE_RATE = { white: 0.025, color: 0.030 } as const;

export const LIGHT_MULTIPLIER: Record<string, number> = {
  notes_20: 1.0,
  light_2: 1.0,
  light_3: 1.1,
  light_4: 1.2,
  light_5: 1.3,
  light_6: 1.5,
  chorus_light_5: 2.6,
  chorus_light_6: 3.0,
};

export const SHRINK_MULTIPLIER = 1.6;
export const SCOREUP_ASSIST_MULTIPLIER = 1.2;
/** スコアアップバッジ倍率のデフォルト値（%）。UI 初期値として使用 */
export const DEFAULT_SCOREUP_BADGE_RATE = 15;
export const MC_ITERATIONS = 5000;
export const MC_CHUNK_SIZE = 50;
/** センタースキル増加率（レアリティ → 増加率%） */
export const CENTER_SKILL_RATES: Record<string, number> = {
  'UR': 10,
  'SSR': 7,
};
export const DEFAULT_CENTER_SKILL_RATE = 6;

/**
 * 特訓によるカード自属性への固定加算値（レアリティ → 加算値）。
 * 特訓済み時は *_max、未特訓時は自属性のみ *_max - TRAIN_BONUS を使用する。
 * 他レアリティ(SSR 等)は仕様が未確定のため 0 として扱われる。
 */
export const TRAIN_BONUS: Record<string, number> = {
  UR: 1800,
};

export { EVENT_BONUS_MULTIPLIER } from '../data/eventBonusTiers';
export type { EventBonusTier } from '../data/eventBonusTiers';
