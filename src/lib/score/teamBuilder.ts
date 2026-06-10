/**
 * チーム計算モジュール: デッキからチーム属性値（アピール値）とセンタースキルを計算する。
 * engine.ts から分割（コードは移動のみ、ロジック変更なし）。
 */
import type { Card } from '../data/fetchCardsJson';
import { getApSkillLevel } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { Song } from '../data/fetchSongsJson';
import {
  normalizeAttribute,
  type CardSkill, type DeckCard, type ComputedTeam,
} from './types';
import {
  CENTER_SKILL_RATES, DEFAULT_CENTER_SKILL_RATE,
  EVENT_BONUS_MULTIPLIER, TRAIN_BONUS,
} from './constants';
import type { EventBonusTier } from '../data/eventBonusTiers';
import { resolveDeckBroachs, calcBroachScoreBonus } from './broachResolver';
import { SKILL_TYPE } from '../data/fetchCardsJson';
import { SHARED_BROACHS } from '../data/sharedBroachs';
import type { RabbitNoteMap } from '../data/rabbitNote';

/** カードからスキル情報を解析する */
function parseSkill(card: Card, slotIndex: number, skillLevel: 1 | 2 | 3 | 4 | 5 = 5): CardSkill | null {
  const type = card.ap_skill_type;
  // 判定補助系スキルはスコアに影響しないため null を返す
  if (!type || type === SKILL_TYPE.MISS_TO_GOOD || type === SKILL_TYPE.BAD_TO_PERFECT) return null;

  const isShrink = type === SKILL_TYPE.SHRINK || type.startsWith(SKILL_TYPE.SHRINK_PREFIX);
  const resolvedSkillLevel = resolveEffectiveSkillLevel(card, skillLevel, isShrink);
  if (resolvedSkillLevel == null) return null;

  const sl = getApSkillLevel(card, resolvedSkillLevel);
  const count = sl.count;
  const per = sl.per;
  const value = sl.value;
  const rate = sl.rate;

  if (count == null || per == null) return null;

  const isTimer = type === SKILL_TYPE.SCOREUP_TIMER || type === SKILL_TYPE.SHRINK_TIMER;

  let skillType: CardSkill['skillType'] = 'scoreUp';
  if (isShrink) skillType = 'shrink';
  else if (isTimer) skillType = 'timerScoreUp';

  return {
    cardIndex: slotIndex,
    skillType,
    originalType: type,
    count: count || 0,
    per: per || 0,
    value: value || 0,
    rate: rate || 0,
    isTimer,
    isShrink,
    spTime: card.sp_time || 0,
  };
}

function isUsableSkillLevel(card: Card, level: 1 | 2 | 3 | 4 | 5, isShrink: boolean): boolean {
  const sl = getApSkillLevel(card, level);
  if (!sl.count || !sl.per || !sl.value) return false;
  if (isShrink && !sl.rate) return false;
  return true;
}

function resolveEffectiveSkillLevel(
  card: Card,
  requested: 1 | 2 | 3 | 4 | 5,
  isShrink: boolean,
): 1 | 2 | 3 | 4 | 5 | null {
  if (isUsableSkillLevel(card, requested, isShrink)) return requested;
  for (let level = 5; level >= 1; level--) {
    if (isUsableSkillLevel(card, level as 1 | 2 | 3 | 4 | 5, isShrink)) {
      return level as 1 | 2 | 3 | 4 | 5;
    }
  }
  return null;
}

/** レアリティからセンタースキル増加率を取得する */
export function getCenterSkillRate(rarity: string | null): number {
  if (!rarity) return 0;
  return CENTER_SKILL_RATES[rarity] ?? DEFAULT_CENTER_SKILL_RATE;
}

/** チームアピール値を計算する */
export function computeTeam(
  deck: (Card | null)[],
  allBroachs: FixedBroach[],
  song: Song,
  bonusTiers?: EventBonusTier[],
  trainedFlags?: boolean[],
  selectedBroachIds?: (number | null)[],
  sharedBroachSelections?: number[][],
  skillLevels?: (1 | 2 | 3 | 4 | 5)[],
  rabbitNotes?: RabbitNoteMap,
): ComputedTeam {
  const cards: DeckCard[] = [];

  let rawShout = 0;
  let rawBeat = 0;
  let rawMelody = 0;
  let broachShoutTotal = 0;
  let broachBeatTotal = 0;
  let broachMelodyTotal = 0;

  // ブローチ条件判定（デッキ全体）
  const resolvedBroachs = resolveDeckBroachs(deck, allBroachs, song, selectedBroachIds);
  const broachScoreBonus = calcBroachScoreBonus(resolvedBroachs);

  // 条件付き共有ブローチ用: デッキ内の属性別カード枚数をカウント
  const attrCounts: Record<string, number> = { Shout: 0, Beat: 0, Melody: 0 };
  for (const c of deck) {
    if (!c) continue;
    const a = normalizeAttribute(c.attribute);
    if (a in attrCounts) attrCounts[a]++;
  }

  for (let i = 0; i < 6; i++) {
    const card = deck[i];
    if (!card) continue;

    const bonusTier = bonusTiers?.[i] || 'none';
    const bonusMult = EVENT_BONUS_MULTIPLIER[bonusTier];
    const trained = trainedFlags?.[i] ?? true;

    // 未特訓は自属性のみ TRAIN_BONUS を引いた値、他属性と特訓済みは *_max をそのまま使う
    const cardAttr = normalizeAttribute(card.attribute);
    const trainBonus = TRAIN_BONUS[card.rarity ?? ''] ?? 0;
    const shoutMax = card.shout_max || 0;
    const beatMax = card.beat_max || 0;
    const melodyMax = card.melody_max || 0;
    const baseShout = shoutMax - (trained || cardAttr !== 'Shout' ? 0 : trainBonus);
    const baseBeat = beatMax - (trained || cardAttr !== 'Beat' ? 0 : trainBonus);
    const baseMelody = melodyMax - (trained || cardAttr !== 'Melody' ? 0 : trainBonus);

    // ラビットノート加算（イベントボーナス倍率適用前）
    const rn = rabbitNotes?.[card.name || ''];
    const s = Math.round((baseShout + (rn?.shout || 0)) * bonusMult);
    const b = Math.round((baseBeat + (rn?.beat || 0)) * bonusMult);
    const m = Math.round((baseMelody + (rn?.melody || 0)) * bonusMult);
    rawShout += s;
    rawBeat += b;
    rawMelody += m;

    // ブローチ加算（条件判定済み）
    let bShout = 0, bBeat = 0, bMelody = 0;
    const slotBroachs = resolvedBroachs.get(i) ?? [];
    for (const rb of slotBroachs) {
      if (!rb.active) continue;
      // 種類9（スコアUP）はステータスではなくスコア直接加算なのでここではスキップ
      if (rb.broach.broach_type === 9) continue;
      const mult = rb.multiplier ?? 1;
      bShout += (rb.broach.shout || 0) * mult;
      bBeat += (rb.broach.beat || 0) * mult;
      bMelody += (rb.broach.melody || 0) * mult;
    }
    // 共有ブローチ加算
    if (sharedBroachSelections?.[i]) {
      for (const sbId of sharedBroachSelections[i]) {
        if (!sbId) continue;
        const sb = SHARED_BROACHS.find(s => s.id === sbId);
        if (!sb) continue;
        if (sb.targetAttribute) {
          // 条件付き: 対象属性のカード枚数 × ブローチ値を装着カードに加算
          const count = attrCounts[sb.targetAttribute] || 0;
          bShout += sb.shout * count;
          bBeat += sb.beat * count;
          bMelody += sb.melody * count;
        } else {
          bShout += sb.shout;
          bBeat += sb.beat;
          bMelody += sb.melody;
        }
      }
    }

    broachShoutTotal += bShout;
    broachBeatTotal += bBeat;
    broachMelodyTotal += bMelody;

    cards.push({
      cardId: card.ID || 0,
      cardID: card.cardID || 0,
      cardname: card.cardname || '',
      name: card.name || '',
      rarity: card.rarity || '',
      attribute: normalizeAttribute(card.attribute),
      shout_max: s,
      beat_max: b,
      melody_max: m,
      skill: parseSkill(card, i, skillLevels?.[i] ?? 5),
      broachShout: bShout,
      broachBeat: bBeat,
      broachMelody: bMelody,
      slotIndex: i,
      bonusMultiplier: bonusMult,
    });
  }

  // センター/フレンドのセンタースキルボーナス（docs/score_calc_spec.md §3-5 / §3-6 準拠）
  // センター分とフレンド分はそれぞれ独立に floor する（合算 floor ではない）
  const centerAttr = deck[0] ? normalizeAttribute(deck[0].attribute) : null;
  const friendAttr = deck[5] ? normalizeAttribute(deck[5].attribute) : null;
  const centerRate = deck[0] ? getCenterSkillRate(deck[0].rarity) : 0;
  const friendRate = deck[5] ? getCenterSkillRate(deck[5].rarity) : 0;

  const baseShout = rawShout + broachShoutTotal;
  const baseBeat = rawBeat + broachBeatTotal;
  const baseMelody = rawMelody + broachMelodyTotal;
  const centerShout  = centerAttr === 'Shout'  ? Math.floor(baseShout  * centerRate / 100) : 0;
  const centerBeat   = centerAttr === 'Beat'   ? Math.floor(baseBeat   * centerRate / 100) : 0;
  const centerMelody = centerAttr === 'Melody' ? Math.floor(baseMelody * centerRate / 100) : 0;
  const friendShout  = friendAttr === 'Shout'  ? Math.floor(baseShout  * friendRate / 100) : 0;
  const friendBeat   = friendAttr === 'Beat'   ? Math.floor(baseBeat   * friendRate / 100) : 0;
  const friendMelody = friendAttr === 'Melody' ? Math.floor(baseMelody * friendRate / 100) : 0;

  const teamShout  = baseShout  + centerShout  + friendShout;
  const teamBeat   = baseBeat   + centerBeat   + friendBeat;
  const teamMelody = baseMelody + centerMelody + friendMelody;

  return {
    Shout: teamShout,
    Beat: teamBeat,
    Melody: teamMelody,
    cards,
    songDuration: song.duration || 0,
    rawShout, rawBeat, rawMelody,
    broachShout: broachShoutTotal,
    broachBeat: broachBeatTotal,
    broachMelody: broachMelodyTotal,
    broachScoreBonus,
  };
}
