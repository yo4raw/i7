/** ポイント芸計算ツールの型定義 */

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';

/** プレイ方法。放置=グレードC相当、PC=パーフェクトコンボ */
export type PlayMode = '放置' | 'オート' | 'FC' | 'PC';

/** 編成プリセット。max=Lv6枚・特訓3枚MAX / ssr1=SSR1枚・特訓なし・Lv1 / weak=SR以下・Lv1 */
export type UnitPreset = 'max' | 'ssr1' | 'weak';

export type Stars = 1 | 2 | 3 | 4 | 5;

/** 倍率ライブ */
export type Multiplier = 1 | 2 | 3;

/** ライブ 1 回分の条件 */
export interface LiveSpec {
  stars: Stars;
  difficulty: Difficulty;
  playMode: PlayMode;
  /** 特効ボーナス（整数パーセント。0〜300） */
  bonusPct: number;
  unit: UnitPreset;
  multiplier: Multiplier;
}
