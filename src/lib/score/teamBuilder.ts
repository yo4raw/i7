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
} from './constants';
import { EVENT_BONUS_MULTIPLIER, type EventBonusTier } from '../data/eventBonusTiers';
import { resolveDeckBroachs, calcBroachScoreBonus } from './broachResolver';
import { broachCapacity } from './broachAssignment';
import { SKILL_TYPE } from '../data/fetchCardsJson';
import { SHARED_BROACHS } from '../data/sharedBroachs';
import type { RabbitNoteMap } from '../data/rabbitNote';

/** カードからスキル情報を解析する */
export function parseSkill(card: Card, slotIndex: number, skillLevel: 1 | 2 | 3 | 4 | 5 = 5): CardSkill | null {
  const type = card.ap_skill_type;
  // 判定補助系スキル（判定ガード・スコアダウン含む）はスコアに影響しないため null を返す (ADR 0037)
  if (
    !type
    || type === SKILL_TYPE.MISS_TO_GOOD
    || type === SKILL_TYPE.BAD_TO_PERFECT
    || type === SKILL_TYPE.MISS_TO_PERFECT
    || type === SKILL_TYPE.SCORE_DOWN
  ) return null;

  const isShrink = type === SKILL_TYPE.SHRINK || type.startsWith(SKILL_TYPE.SHRINK_PREFIX);
  const resolvedSkillLevel = resolveEffectiveSkillLevel(card, skillLevel, isShrink);
  if (resolvedSkillLevel == null) return null;

  const sl = getApSkillLevel(card, resolvedSkillLevel);
  const count = sl.count;
  const per = sl.per;
  const value = sl.value;
  const rate = sl.rate;

  /* v8 ignore next -- resolveEffectiveSkillLevel が count/per truthy のレベルのみ返すため null 到達不能 */
  if (count == null || per == null) return null;

  const isTimer = type === SKILL_TYPE.SCOREUP_TIMER || type === SKILL_TYPE.SHRINK_TIMER;

  let skillType: CardSkill['skillType'] = 'scoreUp';
  if (isShrink) skillType = 'shrink';
  else if (isTimer) skillType = 'timerScoreUp';

  return {
    cardIndex: slotIndex,
    skillType,
    originalType: type,
    // per は入力ミスデータ (per>100) への防御として 100 にクランプする (ADR 0037)
    /* v8 ignore next 3 -- count/per/value は usable レベルで truthy 保証済みのため || 0 の偽側へ到達しない */
    count: count || 0,
    per: Math.min(per || 0, 100),
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
    /* v8 ignore next -- normalizeAttribute の戻り型が全て attrCounts のキーのため else 到達不能 */
    if (a in attrCounts) attrCounts[a]++;
  }

  // ラビットノート加算の重複防止: キャラ初出スロット(0-4)にのみ帰属させる
  const rabbitSeen = new Set<string>();

  for (let i = 0; i < 6; i++) {
    const card = deck[i];
    if (!card) continue;

    const bonusTier = bonusTiers?.[i] || 'none';
    const bonusMult = EVENT_BONUS_MULTIPLIER[bonusTier];
    const trained = trainedFlags?.[i] ?? true;

    // 未特訓は自属性のみカード別実データの sp_time×sp_value を引いた値、他属性と特訓済みは *_max をそのまま使う
    // (spec v1.0.7 §6-3 AM20-21。レアリティ別固定値ではなくカードごとの sp_time/sp_value を使用)
    const cardAttr = normalizeAttribute(card.attribute);
    const trainBonus = (card.sp_time || 0) * (card.sp_value || 0);
    const shoutMax = card.shout_max || 0;
    const beatMax = card.beat_max || 0;
    const melodyMax = card.melody_max || 0;
    const baseShout = shoutMax - (trained || cardAttr !== 'Shout' ? 0 : trainBonus);
    const baseBeat = beatMax - (trained || cardAttr !== 'Beat' ? 0 : trainBonus);
    const baseMelody = melodyMax - (trained || cardAttr !== 'Melody' ? 0 : trainBonus);

    // ラビットノート加算: スロット0-4(フレンド除外)のキャラ初出スロットにのみ1回、
    // 特効倍率を掛けないフラット加算 (spec §6-4 AN67→AN68 / §6-7 AU26)
    let rnS = 0, rnB = 0, rnM = 0;
    if (rabbitNotes && i < 5 && card.name && !rabbitSeen.has(card.name)) {
      rabbitSeen.add(card.name);
      const rn = rabbitNotes[card.name];
      if (rn) { rnS = rn.shout || 0; rnB = rn.beat || 0; rnM = rn.melody || 0; }
    }
    const s = Math.round(baseShout * bonusMult) + rnS;
    const b = Math.round(baseBeat * bonusMult) + rnB;
    const m = Math.round(baseMelody * bonusMult) + rnM;
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
      /* v8 ignore next -- resolveDeckBroachs が multiplier を常に number 設定するため ?? 1 へ到達しない */
      const mult = rb.multiplier ?? 1;
      bShout += (rb.broach.shout || 0) * mult;
      bBeat += (rb.broach.beat || 0) * mult;
      bMelody += (rb.broach.melody || 0) * mult;
    }
    // 共有ブローチ加算（容量ルール適用: 非 UR=0 / 固有持ち UR=1 / それ以外 UR=2。ADR 0039）
    if (sharedBroachSelections?.[i]) {
      const capacity = broachCapacity(card, c => allBroachs.some(br => br.card_id === c.cardID));
      for (const sbId of sharedBroachSelections[i].slice(0, capacity)) {
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
    centerShout, centerBeat, centerMelody,
    friendShout, friendBeat, friendMelody,
  };
}
