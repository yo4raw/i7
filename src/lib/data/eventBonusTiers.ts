export type EventBonusTier = 'none' | 'bronze' | 'silver' | 'gold';

export interface EventBonusTierDef {
  key: EventBonusTier;
  multiplier: number;
  optionLabel: string;
  shortLabel: string;
  labelClass: string;
  selectClasses: string[];
}

export const EVENT_BONUS_TIERS: EventBonusTierDef[] = [
  { key: 'none',   multiplier: 1.0, optionLabel: '特効なし', shortLabel: '-',  labelClass: 'text-gray-400',             selectClasses: [] },
  { key: 'bronze', multiplier: 2.0, optionLabel: '銅特効(100%)',   shortLabel: '銅', labelClass: 'text-amber-700 font-bold',  selectClasses: ['bg-amber-100', 'text-amber-800', 'border-amber-400'] },
  { key: 'silver', multiplier: 2.2, optionLabel: '銀特効(120%)',   shortLabel: '銀', labelClass: 'text-gray-500 font-bold',   selectClasses: ['bg-gray-200', 'text-gray-700', 'border-gray-400'] },
  { key: 'gold',   multiplier: 2.4, optionLabel: '金特効(140%)',   shortLabel: '金', labelClass: 'text-yellow-600 font-bold', selectClasses: ['bg-yellow-100', 'text-yellow-800', 'border-yellow-400'] },
];

export const EVENT_BONUS_MULTIPLIER: Record<EventBonusTier, number> =
  Object.fromEntries(EVENT_BONUS_TIERS.map(t => [t.key, t.multiplier])) as Record<EventBonusTier, number>;

export const BONUS_LABEL: Record<EventBonusTier, string> =
  Object.fromEntries(EVENT_BONUS_TIERS.map(t => [t.key, t.shortLabel])) as Record<EventBonusTier, string>;

export const BONUS_CLASS: Record<EventBonusTier, string> =
  Object.fromEntries(EVENT_BONUS_TIERS.map(t => [t.key, t.labelClass])) as Record<EventBonusTier, string>;

export const ALL_SELECT_CLASSES: string[] =
  EVENT_BONUS_TIERS.flatMap(t => t.selectClasses);

export interface EventForBonus {
  id: number;
  start_date: string;
  end_date: string;
  gold: number[];
  silver: number[];
  bronze: number[];
}

export const TIER_RANK: Record<EventBonusTier, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };

export function isEventLive(start_date: string, end_date: string, now: number = Date.now()): boolean {
  const s = Date.parse(`${start_date}T00:00:00+09:00`);
  const e = Date.parse(`${end_date}T17:00:00+09:00`);
  return now >= s && now < e;
}

export function buildLiveTierMap(events: EventForBonus[], now: number = Date.now()): Map<number, EventBonusTier> {
  const map = new Map<number, EventBonusTier>();
  const upgrade = (id: number, tier: EventBonusTier) => {
    const cur = map.get(id) ?? 'none';
    if (TIER_RANK[tier] > TIER_RANK[cur]) map.set(id, tier);
  };
  for (const ev of events) {
    if (!isEventLive(ev.start_date, ev.end_date, now)) continue;
    for (const id of ev.gold) upgrade(id, 'gold');
    for (const id of ev.silver) upgrade(id, 'silver');
    for (const id of ev.bronze) upgrade(id, 'bronze');
  }
  return map;
}

export function bonusBadgeHtml(tier: EventBonusTier | undefined | null): string {
  if (!tier || tier === 'none') return '';
  const def = EVENT_BONUS_TIERS.find(t => t.key === tier);
  if (!def) return '';
  return `<span class="inline-block px-1.5 py-0.5 text-xs font-bold rounded border ${def.selectClasses.join(' ')}">${def.shortLabel}</span>`;
}

/** イベント種別がハイスコア系か判定する（表記揺れに備え includes 判定）。 */
export function isHighScoreEvent(eventtype: string | null | undefined): boolean {
  return !!eventtype && eventtype.includes('ハイスコア');
}
