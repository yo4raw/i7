import {
  BASE_POINT,
  COMBO_BONUS,
  IDLE_COEFFICIENT_X100,
  STAR_MULTIPLIER_X100,
  UNIT_BONUS,
} from './constants';
import type { Difficulty, LiveSpec, PlayMode, Stars } from './types';

/**
 * 特効が乗る部分（グレードpt）を求める。
 *
 * オートだけは★倍率が掛からず基礎点そのものになる。スプレッドシートの実データが
 * ★1〜★5 で一律だったため、式を統一せず例外として扱う（ADR 0049）。
 */
export function gradePoint(playMode: PlayMode, stars: Stars, difficulty: Difficulty): number {
  const base = BASE_POINT[difficulty];
  if (playMode === 'オート') return base;
  const starX100 = STAR_MULTIPLIER_X100[stars];
  if (playMode === '放置') {
    return Math.floor((base * starX100 * IDLE_COEFFICIENT_X100) / 10000);
  }
  return Math.floor((base * starX100) / 100);
}

/**
 * ライブ 1 回で得られるイベントポイント。
 *
 * 特効の乗算は必ず整数で行う。`g * (1 + pct / 100)` と書くと
 * `660 * 2.3 = 1517.9999999999998` となり切り捨てで 1pt ずれる。
 */
export function livePoint(spec: LiveSpec): number {
  const grade = gradePoint(spec.playMode, spec.stars, spec.difficulty);
  const boosted = Math.floor((grade * (100 + spec.bonusPct)) / 100);
  const constant = UNIT_BONUS[spec.unit] + COMBO_BONUS[spec.playMode][spec.difficulty];
  return (boosted + constant) * spec.multiplier;
}
