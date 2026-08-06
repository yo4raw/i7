import { isEventLive } from '../data/eventBonusTiers';
import { DECK_SLOTS, FALLBACK_BONUS_PCTS, MAX_BONUS_PCT } from './constants';

/** ポイント系イベントのうち、特効%の生成に必要な情報だけを取り出したもの */
export interface PointEventSummary {
  id: number;
  eventname: string;
  start_date: string;
  end_date: string;
  /** 金・銀・銅の gpt_up（グレードpt上昇率。単位は%） */
  gptUps: number[];
}

/** イベント種別がポイント系か判定する（表記揺れに備え includes 判定） */
export function isPointEvent(eventtype?: string | null): boolean {
  return !!eventtype && eventtype.includes('ポイント');
}

/**
 * 各ティアの gpt_up を最大 slots 枚まで自由に組み合わせて到達できる特効%を列挙する。
 * フレンド枠を含めた 6 スロット全部が特効なら 50 × 6 = 300% になる。
 */
export function achievableBonusPcts(
  gptUps: readonly number[],
  slots: number = DECK_SLOTS,
  maxPct: number = MAX_BONUS_PCT,
): number[] {
  const tiers = gptUps.filter(v => v > 0);
  const found = new Set<number>([0]);
  const walk = (index: number, used: number, total: number) => {
    if (index >= tiers.length) return;
    for (let n = 1; used + n <= slots; n++) {
      const next = total + tiers[index] * n;
      if (next > maxPct) break;
      found.add(next);
      walk(index + 1, used + n, next);
    }
    walk(index + 1, used, total);
  };
  walk(0, 0, 0);
  return [...found].toSorted((a, b) => a - b);
}

/**
 * 特効%の既定値に使うイベントを選ぶ。
 * 開催中のものを優先し、無ければ開始日が最も新しいものを使う。特効が全て 0 のイベントは対象外。
 */
export function pickDefaultEvent(
  events: readonly PointEventSummary[],
  now: number = Date.now(),
): PointEventSummary | null {
  const usable = events.filter(event => event.gptUps.some(v => v > 0));
  if (usable.length === 0) return null;
  const live = usable.find(event => isEventLive(event.start_date, event.end_date, now));
  if (live) return live;
  return usable.reduce((a, b) => (b.start_date > a.start_date ? b : a));
}

/** 特効%チップの既定値 */
export function defaultBonusPcts(
  events: readonly PointEventSummary[],
  now: number = Date.now(),
): number[] {
  const event = pickDefaultEvent(events, now);
  if (!event) return [...FALLBACK_BONUS_PCTS];
  return achievableBonusPcts(event.gptUps);
}
