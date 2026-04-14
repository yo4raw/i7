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
