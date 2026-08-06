import type { Difficulty, Multiplier, PlayMode, Stars, UnitPreset } from './types';

export const DIFFICULTIES: readonly Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];
export const PLAY_MODES: readonly PlayMode[] = ['放置', 'オート', 'FC', 'PC'];
export const STARS_LIST: readonly Stars[] = [1, 2, 3, 4, 5];
export const MULTIPLIERS: readonly Multiplier[] = [1, 2, 3];
export const UNIT_PRESETS: readonly UnitPreset[] = ['max', 'ssr1', 'weak'];

/** 難易度別の基礎点 */
export const BASE_POINT: Record<Difficulty, number> = {
  EASY: 550,
  NORMAL: 650,
  HARD: 750,
  EXPERT: 1000,
};

/** 楽曲★倍率を 100 倍した整数（浮動小数点を避けるため） */
export const STAR_MULTIPLIER_X100: Record<Stars, number> = {
  1: 120,
  2: 123,
  3: 125,
  4: 128,
  5: 130,
};

/** 放置時のグレード係数を 100 倍した整数 */
export const IDLE_COEFFICIENT_X100 = 12;

/** 編成プリセット別のユニットボーナス */
export const UNIT_BONUS: Record<UnitPreset, number> = { max: 270, ssr1: 10, weak: 0 };

export const UNIT_LABEL: Record<UnitPreset, string> = {
  max: 'MAX編成',
  ssr1: 'SSR1枚Lv1',
  weak: 'SR以下Lv1',
};

/** プレイ方法 × 難易度のコンボボーナス */
export const COMBO_BONUS: Record<PlayMode, Record<Difficulty, number>> = {
  放置: { EASY: 0, NORMAL: 0, HARD: 0, EXPERT: 0 },
  オート: { EASY: 300, NORMAL: 300, HARD: 300, EXPERT: 300 },
  FC: { EASY: 440, NORMAL: 465, HARD: 491, EXPERT: 555 },
  PC: { EASY: 465, NORMAL: 495, HARD: 525, EXPERT: 600 },
};

/** PC は実際に出すのが難しいため既定 OFF（ADR 0049 決定 9） */
export const DEFAULT_PLAY_MODES: readonly PlayMode[] = ['放置', 'オート', 'FC'];

/** 開催中のポイント系イベントが無いときの特効%既定値 */
export const FALLBACK_BONUS_PCTS: readonly number[] = [0, 5, 20, 50, 100, 150, 200, 250, 300];

export const MAX_BONUS_PCT = 300;

/** 特効の合計に使えるスロット数（フレンド含む） */
export const DECK_SLOTS = 6;
