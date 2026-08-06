import { DIFFICULTIES, STARS_LIST } from './constants';
import { livePoint } from './engine';
import type { LiveSpec, Multiplier, PlayMode, UnitPreset } from './types';

export interface CandidateOptions {
  /** 使ってよい特効%（整数パーセント） */
  bonusPcts: readonly number[];
  playModes: readonly PlayMode[];
  units: readonly UnitPreset[];
  multipliers: readonly Multiplier[];
}

/** 同じ pt になる条件をまとめた候補 */
export interface Candidate {
  point: number;
  /** その pt を出せる条件の一覧（表示時に「別の手段」として使える） */
  specs: LiveSpec[];
}

/**
 * 弱編成（SSR1枚Lv1 / SR以下Lv1）は放置とのみ組み合わせる。
 * 弱編成でオートやフルコンボを取る運用は現実的でないため、スプレッドシートも同じ扱いになっている。
 */
function isValidPair(unit: UnitPreset, playMode: PlayMode): boolean {
  return unit === 'max' || playMode === '放置';
}

export function buildCandidates(options: CandidateOptions): Candidate[] {
  const byPoint = new Map<number, LiveSpec[]>();
  for (const unit of options.units) {
    for (const playMode of options.playModes) {
      if (!isValidPair(unit, playMode)) continue;
      for (const bonusPct of options.bonusPcts) {
        for (const multiplier of options.multipliers) {
          for (const stars of STARS_LIST) {
            for (const difficulty of DIFFICULTIES) {
              const spec: LiveSpec = { stars, difficulty, playMode, bonusPct, unit, multiplier };
              const point = livePoint(spec);
              const list = byPoint.get(point);
              if (list) list.push(spec);
              else byPoint.set(point, [spec]);
            }
          }
        }
      }
    }
  }
  return [...byPoint.entries()]
    .map(([point, specs]) => ({ point, specs }))
    .toSorted((a, b) => a.point - b.point);
}
