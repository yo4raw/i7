import { DECK_SLOTS } from './constants';
import type { BonusCounts, BonusRates } from './types';

/** 負値・非整数を 0 以上の整数へ正規化する。UI でもクランプするが、関数単体で呼んでも壊れないようにする */
function normalize(value: number): number {
  const n = Math.trunc(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 使える特効衣装で到達できる特効%をすべて列挙する。
 *
 * 金 g 枚・銀 s 枚・銅 b 枚（それぞれ counts 以下、合計 slots 以下）を入れたときの
 * 上昇率の合計を集める。一部だけ入れて叩くパターンも含むので 0 は必ず入る。
 * 枚数はフレンドから借りる分を含めた 6 枠分として扱う。
 */
export function achievableBonusPcts(
  rates: BonusRates,
  counts: BonusCounts,
  slots: number = DECK_SLOTS,
): number[] {
  const maxSlots = normalize(slots);
  const goldRate = normalize(rates.gold);
  const silverRate = normalize(rates.silver);
  const bronzeRate = normalize(rates.bronze);
  const maxGold = Math.min(normalize(counts.gold), maxSlots);
  const maxSilver = Math.min(normalize(counts.silver), maxSlots);
  const maxBronze = Math.min(normalize(counts.bronze), maxSlots);

  const found = new Set<number>();
  for (let gold = 0; gold <= maxGold; gold++) {
    for (let silver = 0; silver <= maxSilver && gold + silver <= maxSlots; silver++) {
      for (let bronze = 0; bronze <= maxBronze && gold + silver + bronze <= maxSlots; bronze++) {
        found.add(gold * goldRate + silver * silverRate + bronze * bronzeRate);
      }
    }
  }
  return [...found].toSorted((a, b) => a - b);
}
