import type { Card } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { Song } from '../data/fetchSongsJson';
import { normalizeAttribute, type AttributeName } from './types';

export interface ResolvedBroach {
  broach: FixedBroach;
  active: boolean;
  /**
   * 効果値倍率。デッキ依存で加算値がスケールするブローチ（種類5: アイドル属性指定カウント）
   * ではデッキ内の対象カード枚数を格納する。通常ブローチでは常に 1。
   */
  multiplier: number;
}

/** ブローチ種類定数 */
const BROACH_TYPE = {
  ATTRIBUTE_UP: 1,
  GROUP: 4,
  IDOL_ATTR_COUNT: 5,
  ATTRIBUTE_UP_LIMITED: 6,
  ALL_ATTRIBUTES: 7,
  AUTO_ONLY: 8,
  SCORE_UP: 9,
} as const;

/** 自カード(スロット0-4)に指定グループ以外のカードが含まれていないか判定。空スロット・フレンド枠は無視。 */
function hasNoOtherGroup(deck: (Card | null)[], group: string): boolean {
  for (let i = 0; i < 5; i++) {
    const card = deck[i];
    if (!card) continue;
    if (card.groupname !== group) return false;
  }
  return true;
}

/** デッキ内に3属性（Shout/Beat/Melody）すべて存在するか判定 */
function hasAllAttributes(deck: (Card | null)[]): boolean {
  const attrs = new Set<AttributeName>();
  for (const card of deck) {
    if (!card) continue;
    attrs.add(normalizeAttribute(card.attribute));
  }
  return attrs.has('Shout') && attrs.has('Beat') && attrs.has('Melody');
}

/** デッキ内の同アイドルかつ同属性のカード枚数をカウント */
function countIdolAttrMatch(deck: (Card | null)[], idol: string, attribute: string): number {
  const normAttr = normalizeAttribute(attribute);
  let count = 0;
  for (const card of deck) {
    if (!card) continue;
    if (card.name === idol && normalizeAttribute(card.attribute) === normAttr) {
      count++;
    }
  }
  return count;
}

/** 個別ブローチの条件判定（デッキ内上限以外） */
function checkBroachCondition(
  broach: FixedBroach,
  deck: (Card | null)[],
  song: Song,
): boolean {
  const type = broach.broach_type;

  switch (type) {
    case BROACH_TYPE.ATTRIBUTE_UP:
      return true;

    case BROACH_TYPE.GROUP:
      return broach.group != null && hasNoOtherGroup(deck, broach.group);

    case BROACH_TYPE.IDOL_ATTR_COUNT: {
      if (!broach.idol || !broach.attribute) return false;
      const required = broach.limit ?? 1;
      return countIdolAttrMatch(deck, broach.idol, broach.attribute) >= required;
    }

    case BROACH_TYPE.ATTRIBUTE_UP_LIMITED:
      // 条件自体は無条件（上限はデッキ全体で処理）
      return true;

    case BROACH_TYPE.ALL_ATTRIBUTES:
      return hasAllAttributes(deck);

    case BROACH_TYPE.AUTO_ONLY:
      // スコープ外: 常に無効
      return false;

    case BROACH_TYPE.SCORE_UP:
      return broach.song != null && song.song_name === broach.song;

    default:
      return false;
  }
}

/**
 * デッキ全体のブローチを条件判定して返す。
 * デッキ内発動上限（種類6/7）も処理する。
 * @returns key = slotIndex (0-5), value = ResolvedBroach[]
 */
export function resolveDeckBroachs(
  deck: (Card | null)[],
  allBroachs: FixedBroach[],
  song: Song,
  selectedBroachIds?: (number | null)[],
): Map<number, ResolvedBroach[]> {
  const result = new Map<number, ResolvedBroach[]>();

  // Phase 1: 各カードのブローチを条件判定（上限以外）
  // デッキ内上限のカウンター: key = broach_type
  const limitCounters = new Map<number, { limit: number; count: number }>();

  // 全スロットのブローチを先に収集（上限処理のため）
  interface PendingBroach {
    slotIndex: number;
    broach: FixedBroach;
    conditionMet: boolean;
  }
  const pending: PendingBroach[] = [];

  for (let i = 0; i < 6; i++) {
    const card = deck[i];
    if (!card || card.rarity !== 'UR') continue;

    let cardBroachs = allBroachs.filter(br => br.card_id === card.cardID);
    if (selectedBroachIds) {
      const selectedId = selectedBroachIds[i];
      if (selectedId != null) {
        cardBroachs = cardBroachs.filter(br => br.id === selectedId);
      } else {
        cardBroachs = [];
      }
    }
    for (const broach of cardBroachs) {
      const conditionMet = checkBroachCondition(broach, deck, song);
      pending.push({ slotIndex: i, broach, conditionMet });
    }
  }

  // Phase 2: デッキ内発動上限の処理（種類6, 7）
  for (const p of pending) {
    const type = p.broach.broach_type;
    if (!p.conditionMet) continue;

    if (type === BROACH_TYPE.ATTRIBUTE_UP_LIMITED || type === BROACH_TYPE.ALL_ATTRIBUTES) {
      const limit = p.broach.limit ?? Infinity;
      if (!limitCounters.has(type)) {
        limitCounters.set(type, { limit, count: 0 });
      }
    }
  }

  // Phase 3: 最終結果の構築
  for (const p of pending) {
    const type = p.broach.broach_type;
    let active = p.conditionMet;

    // デッキ内上限チェック
    if (active && (type === BROACH_TYPE.ATTRIBUTE_UP_LIMITED || type === BROACH_TYPE.ALL_ATTRIBUTES)) {
      const counter = limitCounters.get(type)!;
      if (counter.count < counter.limit) {
        counter.count++;
      } else {
        active = false;
      }
    }

    // 効果値倍率の算出（種類5: アイドル属性指定カウントのみデッキ依存でスケール）
    let multiplier = 1;
    if (active && type === BROACH_TYPE.IDOL_ATTR_COUNT && p.broach.idol && p.broach.attribute) {
      multiplier = countIdolAttrMatch(deck, p.broach.idol, p.broach.attribute);
    }

    const slot = result.get(p.slotIndex) ?? [];
    slot.push({ broach: p.broach, active, multiplier });
    result.set(p.slotIndex, slot);
  }

  return result;
}

/**
 * デッキ全体のブローチスコアボーナス（種類9）を計算する。
 * resolveDeckBroachs の結果から active な種類9ブローチのスコアを合算。
 */
export function calcBroachScoreBonus(resolved: Map<number, ResolvedBroach[]>): number {
  let total = 0;
  for (const broachs of resolved.values()) {
    for (const rb of broachs) {
      if (rb.active && rb.broach.broach_type === BROACH_TYPE.SCORE_UP) {
        total += rb.broach.score || 0;
      }
    }
  }
  return total;
}
