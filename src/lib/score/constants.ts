export const NOTE_RATE = { white: 0.025, color: 0.030 } as const;

export const LIGHT_MULTIPLIER: Record<string, number> = {
  notes_20: 1.0,
  light_2: 1.1,
  light_3: 1.2,
  light_4: 1.3,
  light_5: 1.3,
  light_6: 1.5,
  chorus_light_5: 2.6,
  chorus_light_6: 3.0,
};

export const SHRINK_MULTIPLIER = 1.6;
export const MC_ITERATIONS = 5000;
export const MC_CHUNK_SIZE = 50;
/** センタースキル増加量パターン（キーワード → 増加率%） */
export const CENTER_SKILL_RATES: Record<string, number> = {
  'かなり': 10,
  'やや': 7,
  '大きく': 6,
};
export const DEFAULT_CENTER_SKILL_RATE = 10;

export type EventBonusTier = 'none' | 'bronze' | 'silver' | 'gold';

export const EVENT_BONUS_MULTIPLIER: Record<EventBonusTier, number> = {
  none: 1.0,
  bronze: 1.5,
  silver: 2.0,
  gold: 2.2,
};
