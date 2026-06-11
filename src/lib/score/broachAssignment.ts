/**
 * 編成組合計算用の共通ブローチ・グリーディ割当。
 *
 * 共通ブローチの効果は装着カードに依存しない（条件付きブローチもデッキ全体の
 * 属性枚数で決まる）ため、候補編成ごとに「装備可能枠数 × 寄与値上位」の貪欲割当が
 * 線形近似のもとで最適になる。ブローチ組合せの総当たりは行わない (ADR 0004)。
 * calcNoteScore のノーツごとの floor により厳密には非線形だが、属性値に対して
 * 単調非減少のため誤差はブローチ寄与値に対して無視できる。
 */
import type { Card } from '../data/fetchCardsJson';
import type { FlatNote, AttributeName } from './types';
import { normalizeAttribute } from './types';
import { NOTE_RATE, LIGHT_MULTIPLIER } from './constants';
import { SHARED_BROACHS, type SharedBroach } from '../data/sharedBroachs';

export interface AttrWeights {
  Shout: number;
  Beat: number;
  Melody: number;
}

/** 楽曲ノーツから属性 1 ポイントあたりのスコア寄与重みを線形近似で求める (floor 無視) */
export function calcAttrWeights(notes: FlatNote[]): AttrWeights {
  const w: AttrWeights = { Shout: 0, Beat: 0, Melody: 0 };
  for (const n of notes) {
    w[n.attribute] += NOTE_RATE[n.type] * (LIGHT_MULTIPLIER[n.group] || 0);
  }
  return w;
}

/** デッキ 6 枠の属性別カード枚数 (条件付きブローチの倍率算出用、teamBuilder と同じ規則) */
export function countDeckAttrs(deck: (Card | null)[]): Record<AttributeName, number> {
  const counts: Record<AttributeName, number> = { Shout: 0, Beat: 0, Melody: 0 };
  for (const c of deck) {
    if (!c) continue;
    const a = normalizeAttribute(c.attribute);
    if (a in counts) counts[a]++;
  }
  return counts;
}

/** ブローチ 1 個あたりの重み付き寄与値 */
export function broachValue(
  sb: SharedBroach,
  weights: AttrWeights,
  attrCounts: Record<AttributeName, number>,
): number {
  const mult = sb.targetAttribute ? attrCounts[sb.targetAttribute] : 1;
  return (sb.shout * weights.Shout + sb.beat * weights.Beat + sb.melody * weights.Melody) * mult;
}

/** カード 1 枚の共通ブローチ装備可能数 (UR のみ、固有ブローチ持ちは 1 / それ以外は 2) */
export function broachCapacity(card: Card | null, hasFixedBroach: (card: Card) => boolean): number {
  if (!card || card.rarity !== 'UR') return 0;
  return hasFixedBroach(card) ? 1 : 2;
}

/**
 * slot 0-4 に所持共通ブローチを寄与値降順でグリーディ割当し、
 * slot 5 (フレンド) には全種から最良ブローチを容量分割当てた selections を返す。
 */
export function assignBroachs(
  deck: (Card | null)[],
  ownedCounts: Record<string, number>,
  weights: AttrWeights,
  hasFixedBroach: (card: Card) => boolean,
): number[][] {
  const attrCounts = countDeckAttrs(deck);
  const selections: number[][] = [[], [], [], [], [], []];

  // 所持ブローチを寄与値降順に個数分展開
  const units: { id: number; value: number }[] = [];
  for (const sb of SHARED_BROACHS) {
    const n = ownedCounts[String(sb.id)] ?? 0;
    if (n <= 0) continue;
    const v = broachValue(sb, weights, attrCounts);
    if (v <= 0) continue;
    for (let i = 0; i < n; i++) units.push({ id: sb.id, value: v });
  }
  units.sort((a, b) => b.value - a.value);

  let u = 0;
  for (let slot = 0; slot <= 4 && u < units.length; slot++) {
    const cap = broachCapacity(deck[slot], hasFixedBroach);
    for (let k = 0; k < cap && u < units.length; k++) {
      selections[slot].push(units[u++].id);
    }
  }

  // フレンド枠: 全種から最良 1 種を容量分 (同種重複可・所持制約なし)
  const friendCap = broachCapacity(deck[5], hasFixedBroach);
  if (friendCap > 0) {
    let best: SharedBroach | null = null;
    let bestValue = 0;
    for (const sb of SHARED_BROACHS) {
      const v = broachValue(sb, weights, attrCounts);
      if (v > bestValue) {
        best = sb;
        bestValue = v;
      }
    }
    if (best) {
      for (let k = 0; k < friendCap; k++) selections[5].push(best.id);
    }
  }
  return selections;
}
