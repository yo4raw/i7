import type { Card } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { EventBonusTier } from '../data/eventBonusTiers';
import { broachCapacity } from './broachAssignment';

export type SkillLevel = 1 | 2 | 3 | 4 | 5;

export const DECK_SIZE = 6;
export const SLOT_LABELS = ['センター', 'メンバー1', 'メンバー2', 'メンバー3', 'メンバー4', 'フレンド'] as const;
export const DISPLAY_ORDER = [1, 2, 0, 3, 4, 5] as const;

/** スコア計算デッキの編成状態（6 スロット: 0=センター, 1-4=メンバー, 5=フレンド） */
export interface DeckState {
  cards: (Card | null)[];
  bonusTiers: EventBonusTier[];
  trained: boolean[];
  sharedBroachs: number[][];
  skillLevels: SkillLevel[];
}

export function createEmptyDeckState(): DeckState {
  return {
    cards: [null, null, null, null, null, null],
    bonusTiers: ['none', 'none', 'none', 'none', 'none', 'none'],
    trained: [true, true, true, true, true, true],
    sharedBroachs: [[], [], [], [], [], []],
    skillLevels: [5, 5, 5, 5, 5, 5],
  };
}

/** 2 スロットの全属性（カード/特効/特訓/共有ブローチ/スキルLv）を交換する */
export function swapSlots(state: DeckState, a: number, b: number): void {
  if (a === b) return;
  if (a < 0 || a > 4 || b < 0 || b > 4) return;
  [state.cards[a], state.cards[b]] = [state.cards[b], state.cards[a]];
  [state.bonusTiers[a], state.bonusTiers[b]] = [state.bonusTiers[b], state.bonusTiers[a]];
  [state.trained[a], state.trained[b]] = [state.trained[b], state.trained[a]];
  [state.sharedBroachs[a], state.sharedBroachs[b]] = [state.sharedBroachs[b], state.sharedBroachs[a]];
  [state.skillLevels[a], state.skillLevels[b]] = [state.skillLevels[b], state.skillLevels[a]];
}

/** 共有ブローチ装備数の検証・切り詰め。容量ルールは broachCapacity に一本化 (ADR 0039) */
export function clampSharedBroachs(state: DeckState, slotIndex: number, allBroachs: FixedBroach[]): void {
  const card = state.cards[slotIndex];
  const cap = broachCapacity(card, c => allBroachs.some(br => br.card_id === c.cardID));
  state.sharedBroachs[slotIndex] = cap > 0 ? state.sharedBroachs[slotIndex].slice(0, cap) : [];
}

/** カードをスロットに配置し、デフォルト特効を設定して共有ブローチを検証する */
export function setCard(state: DeckState, slotIndex: number, card: Card, defaultTier: EventBonusTier, allBroachs: FixedBroach[]): void {
  state.cards[slotIndex] = card;
  state.bonusTiers[slotIndex] = defaultTier;
  clampSharedBroachs(state, slotIndex, allBroachs);
}

/** スロットを空に戻す（カード/特効/特訓/共有ブローチを初期値に。スキルLv は既存挙動どおり維持する） */
export function clearSlot(state: DeckState, slotIndex: number): void {
  state.cards[slotIndex] = null;
  state.bonusTiers[slotIndex] = 'none';
  state.trained[slotIndex] = true;
  state.sharedBroachs[slotIndex] = [];
}
