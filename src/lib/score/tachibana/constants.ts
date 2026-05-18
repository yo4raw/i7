import type { TachibanaOptions } from './types';

/**
 * たちばなさんロジック（公開 Sheets `スコア計算` シート）のデフォルト値。
 * セル参照は B12, B13, C14, B15, B16, K6, M6 に対応。
 */
export const TACHIBANA_DEFAULT_OPTIONS: TachibanaOptions = {
  scoreUpFullActivation: true,    // B12 = TRUE
  scoreUpProbabilityBoost: false, // B13 = FALSE
  scoreUpProbabilityBoostValue: 10, // C14 = 10
  shrinkFullActivation: true,     // B15 = TRUE
  excludeNotes20: false,          // B16 = FALSE
  scoreUpBadgeRate: 16,           // 設定シート B3 = 16%
  shrinkCoverage: 0,              // M6（縮小フル発動 OFF 時はシートの ELSE 分岐を使う）
  specialEffectActive: false,     // I6
};

/**
 * 楽曲セクションキー（`Song` 型のグループキー）と per-section 倍率。
 * シートの BI11..BN18 行と完全に一致する。
 */
export const TACHIBANA_SONG_SECTIONS: Array<{
  key: 'notes_20' | 'light_2' | 'light_3' | 'light_4' | 'light_5' | 'light_6' | 'chorus_light_5' | 'chorus_light_6';
  multiplier: number;
}> = [
  { key: 'notes_20',        multiplier: 1.0 }, // BI11..BN11
  { key: 'light_2',         multiplier: 1.0 }, // BI12..BN12
  { key: 'light_3',         multiplier: 1.1 },
  { key: 'light_4',         multiplier: 1.2 },
  { key: 'light_5',         multiplier: 1.3 },
  { key: 'light_6',         multiplier: 1.5 },
  { key: 'chorus_light_5',  multiplier: 2.6 },
  { key: 'chorus_light_6',  multiplier: 3.0 },
];

/** センタースキル / フレンドスキルの属性ブースト率（シート式の +0.1 部分） */
export const TACHIBANA_CENTER_FRIEND_BOOST = 0.1;
