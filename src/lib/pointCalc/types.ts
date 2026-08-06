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
  /** 特効ボーナス（整数パーセント。上昇率0〜100% × 最大6枠で0〜600） */
  bonusPct: number;
  unit: UnitPreset;
  multiplier: Multiplier;
}

/** 特効のティア。金 = special1 / 銀 = special2 / 銅 = special3 */
export type BonusTierKey = 'gold' | 'silver' | 'bronze';

/** 各ティアの特効上昇率（整数パーセント） */
export interface BonusRates {
  gold: number;
  silver: number;
  bronze: number;
}

/** 使える特効衣装の枚数。フレンドから借りる分を含む */
export interface BonusCounts {
  gold: number;
  silver: number;
  bronze: number;
}
