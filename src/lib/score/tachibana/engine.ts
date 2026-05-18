/**
 * たちばなさんロジック スコア計算エンジン
 *
 * 公開スプレッドシート (https://docs.google.com/spreadsheets/d/1st1aSskGKKKl4H-XLFsTQ8zMnwrGRjqgFgdDs5bhLns/)
 * の「スコア計算」シートの計算式を忠実に再現する。
 *
 * 計算フロー:
 *   1. デッキ集約属性値 (AN72/AP72/AR72) = Σ(card.shout_max + card.broachShout) × center/friend boost × 1.2 (特効ON時)
 *   2. 属性値スコア (D20) = Σ_8sections Σ_6subkeys (deck_attr × 0.025 or 0.030 × note_count × section_multiplier)
 *   3. スコアアップスキル (D21) = Σ_cards (denom / count × probability × score)
 *   4. 縮小スキル     (D22) = 縮小フル発動オプションと縮小カバー率に応じた分配計算
 *   5. ライブ終了時 (D23) = D20 + D21 + D22
 *   6. 最終リザルト (D24) = D23 × (1 + SCOREUPバッジ%)
 */

import type { ComputedTeam, DeckCard, AttributeName } from '../types';
import type { Song, SongNoteGroup } from '../../data/fetchSongsJson';
import type { TachibanaCardBreakdown, TachibanaOptions, TachibanaResult } from './types';
import { TACHIBANA_SONG_SECTIONS, TACHIBANA_CENTER_FRIEND_BOOST } from './constants';
import { SKILL_TYPE } from '../../data/fetchCardsJson';

const NOTE_RATE_WHITE = 0.025;
const NOTE_RATE_COLOR = 0.030;
const SPECIAL_EFFECT_MULTIPLIER = 1.2; // シート式の AN72 で固定的に掛けられる値 (I6=TRUE 時)

/** スキル種別を spreadsheet の H31 表記 (`スコアアップ` / `判定領域縮小` / その他) に正規化 */
function classifySkill(card: DeckCard): 'scoreUp' | 'shrink' | 'none' {
  const s = card.skill;
  if (!s) return 'none';
  if (s.skillType === 'scoreUp' || s.skillType === 'timerScoreUp') return 'scoreUp';
  if (s.skillType === 'shrink') return 'shrink';
  return 'none';
}

/** スキル発動条件を H33 表記 (`Perfect` / `コンボ` / `タイマー`) に正規化 */
function skillRequirement(card: DeckCard): 'Perfect' | 'コンボ' | 'タイマー' | 'other' {
  const s = card.skill;
  if (!s) return 'other';
  if (s.skillType === 'timerScoreUp') return 'タイマー';
  const t = s.originalType ?? '';
  if (t.includes('（タイマー）')) return 'タイマー';
  if (t.includes('（コンボ）')) return 'コンボ';
  if (t.includes('（Perfect）')) return 'Perfect';
  return 'other';
}

/** 属性別の center/friend ブースト (+0.1 if matched) */
function attrBoost(attr: AttributeName, centerAttr: AttributeName | null, friendAttr: AttributeName | null): number {
  let boost = 1;
  if (centerAttr === attr) boost += TACHIBANA_CENTER_FRIEND_BOOST;
  if (friendAttr === attr) boost += TACHIBANA_CENTER_FRIEND_BOOST;
  return boost;
}

/** AN72 / AP72 / AR72: デッキ集約属性値（全 6 枚 + ラビットノート + center/friend boost + 特効 ×1.2） */
function computeDeckTotals(
  team: ComputedTeam,
  options: TachibanaOptions,
  centerAttr: AttributeName | null,
  friendAttr: AttributeName | null,
): { shout: number; beat: number; melody: number } {
  // 6 枚のカードの (post-train + post-rabbit-note + post-event-bonus) + broach
  let shout = 0, beat = 0, melody = 0;
  for (const card of team.cards) {
    shout  += card.shout_max  + card.broachShout;
    beat   += card.beat_max   + card.broachBeat;
    melody += card.melody_max + card.broachMelody;
  }
  // center/friend boost (AN71 / AP71 / AR71)
  shout  = Math.floor(shout  * attrBoost('Shout', centerAttr, friendAttr));
  beat   = Math.floor(beat   * attrBoost('Beat',  centerAttr, friendAttr));
  melody = Math.floor(melody * attrBoost('Melody', centerAttr, friendAttr));
  // 特効 ×1.2 (AN72 / AP72 / AR72)
  if (options.specialEffectActive) {
    shout  = Math.floor(shout  * SPECIAL_EFFECT_MULTIPLIER);
    beat   = Math.floor(beat   * SPECIAL_EFFECT_MULTIPLIER);
    melody = Math.floor(melody * SPECIAL_EFFECT_MULTIPLIER);
  }
  return { shout, beat, melody };
}

/** BA11..BF11 base + per-section scaled (BA12..BF17): 6 属性サブキー × 8 セクション の係数行列 */
function computeAttrCoefficients(deckTotals: { shout: number; beat: number; melody: number }) {
  // 行 = 8 セクション (multiplier 1.0, 1.0, 1.1, 1.2, 1.3, 1.5, 2.6, 3.0)
  // 列 = 6 サブキー (shout_white, shout_color, beat_white, beat_color, melody_white, melody_color)
  const base = {
    shout_white:  Math.floor(deckTotals.shout  * NOTE_RATE_WHITE),
    shout_color:  Math.floor(deckTotals.shout  * NOTE_RATE_COLOR),
    beat_white:   Math.floor(deckTotals.beat   * NOTE_RATE_WHITE),
    beat_color:   Math.floor(deckTotals.beat   * NOTE_RATE_COLOR),
    melody_white: Math.floor(deckTotals.melody * NOTE_RATE_WHITE),
    melody_color: Math.floor(deckTotals.melody * NOTE_RATE_COLOR),
  };
  return TACHIBANA_SONG_SECTIONS.map(({ multiplier }) => {
    if (multiplier === 1.0) return base;
    return {
      shout_white:  Math.floor(base.shout_white  * multiplier),
      shout_color:  Math.floor(base.shout_color  * multiplier),
      beat_white:   Math.floor(base.beat_white   * multiplier),
      beat_color:   Math.floor(base.beat_color   * multiplier),
      melody_white: Math.floor(base.melody_white * multiplier),
      melody_color: Math.floor(base.melody_color * multiplier),
    };
  });
}

/** D20: 属性値スコア = Σ over 8 sections × 6 subkeys (coeff × note_count) */
function computeAttributeScore(coeffs: ReturnType<typeof computeAttrCoefficients>, song: Song): number {
  let total = 0;
  for (let i = 0; i < TACHIBANA_SONG_SECTIONS.length; i++) {
    const { key } = TACHIBANA_SONG_SECTIONS[i];
    const g = song[key] as SongNoteGroup;
    const c = coeffs[i];
    total += c.shout_white  * (g.shout_white  ?? 0)
           + c.shout_color  * (g.shout_color  ?? 0)
           + c.beat_white   * (g.beat_white   ?? 0)
           + c.beat_color   * (g.beat_color   ?? 0)
           + c.melody_white * (g.melody_white ?? 0)
           + c.melody_color * (g.melody_color ?? 0);
  }
  return total;
}

/** カード 1 枚分のスコアアップスキル期待値 (H38) */
function computeCardScoreUp(card: DeckCard, song: Song, options: TachibanaOptions): number {
  if (classifySkill(card) !== 'scoreUp') return 0;
  const s = card.skill!;
  const req = skillRequirement(card);
  if (req === 'other') return 0;
  if (s.count === 0) return 0;
  const denom = req === 'タイマー' ? (song.duration ?? 0) : (song.notes_count ?? 0);
  let probMult: number;
  if (options.scoreUpFullActivation) {
    probMult = 1;
  } else if (options.scoreUpProbabilityBoost) {
    probMult = (s.per + options.scoreUpProbabilityBoostValue) / 100;
  } else {
    probMult = s.per / 100;
  }
  return Math.floor((denom / s.count) * probMult * s.value);
}

/** カード 1 枚分の縮小スキル base/秒 (H39) */
function computeCardShrinkPerSecond(card: DeckCard, song: Song, options: TachibanaOptions): number {
  if (classifySkill(card) !== 'shrink') return 0;
  const s = card.skill!;
  const req = skillRequirement(card);
  if (req === 'other') return 0;
  if (s.count === 0) return 0;
  const denom = req === 'タイマー' ? (song.duration ?? 0) : (song.notes_count ?? 0);
  const probMult = options.shrinkFullActivation ? 1 : (s.per / 100);
  return Math.floor((denom / s.count) * probMult * s.value);
}

/** D21: スコアアップスキル合計 */
function computeScoreUpScore(team: ComputedTeam, song: Song, options: TachibanaOptions): number[] {
  return team.cards.map((c) => computeCardScoreUp(c, song, options));
}

/** D22: 縮小スキル合計（per-card 配列を返す） */
function computeShrinkScores(
  team: ComputedTeam,
  song: Song,
  options: TachibanaOptions,
  attributeScore: number,
): { perCard: number[]; total: number; coverage: number } {
  const perSecond = team.cards.map((c) => computeCardShrinkPerSecond(c, song, options));
  const sumPerSecond = perSecond.reduce((a, b) => a + b, 0);
  const duration = song.duration ?? 0;
  const coverage = duration > 0 ? sumPerSecond / duration : 0;

  // BN22 = "without 特効" baseline attribute score
  // BN23 = "without notes_20" baseline
  // 特効 ON で属性値スコアは既に ×1.2 されているので、ベースは ÷1.2 で「特効なし」相当に戻す
  const withoutSpecial = options.specialEffectActive
    ? Math.floor(attributeScore / SPECIAL_EFFECT_MULTIPLIER)
    : attributeScore;
  // BN23 (20ノーツなし): notes_20 セクションを除いた合計
  let notes20Contribution = 0;
  if (options.excludeNotes20) {
    notes20Contribution = computeNotes20Contribution(team, song, options);
  }
  const withoutSpecialMinusNotes20 = options.specialEffectActive
    ? Math.floor((attributeScore - notes20Contribution) / SPECIAL_EFFECT_MULTIPLIER)
    : (attributeScore - notes20Contribution);

  const perCard = team.cards.map((c, i) => {
    if (classifySkill(c) !== 'shrink') return 0;
    const s = c.skill!;
    const rate = s.rate; // H37: 縮小倍率 (1.6 など)
    if (rate <= 1) return 0;
    const factor = rate - 1; // H37 - 1
    const sec = perSecond[i];
    if (coverage >= 1) {
      // フル発動時間オーバー: per-card 重み付け正規化
      const pool = options.excludeNotes20 ? withoutSpecialMinusNotes20 : withoutSpecial;
      const weight = sumPerSecond > 0 ? sec / sumPerSecond : 0;
      return Math.floor(pool * weight * factor);
    } else {
      // 通常: pool × (sec/duration) × factor
      return Math.floor(withoutSpecial * (duration > 0 ? sec / duration : 0) * factor);
    }
  });
  return {
    perCard,
    total: perCard.reduce((a, b) => a + b, 0),
    coverage,
  };
}

/** notes_20 セクションの寄与（excludeNotes20 オプション用） */
function computeNotes20Contribution(team: ComputedTeam, song: Song, options: TachibanaOptions): number {
  const centerAttr = team.cards[0]?.attribute ?? null;
  const friendAttr = team.cards[5]?.attribute ?? null;
  const deck = computeDeckTotals(team, options, centerAttr, friendAttr);
  const coeffs = computeAttrCoefficients(deck);
  const c = coeffs[0]; // notes_20 セクション
  const g = song.notes_20;
  return c.shout_white  * (g.shout_white  ?? 0)
       + c.shout_color  * (g.shout_color  ?? 0)
       + c.beat_white   * (g.beat_white   ?? 0)
       + c.beat_color   * (g.beat_color   ?? 0)
       + c.melody_white * (g.melody_white ?? 0)
       + c.melody_color * (g.melody_color ?? 0);
}

/**
 * たちばなさんロジックでスコアを計算する。
 * `computeTeam` の戻り値をそのまま `team` に渡す。
 */
export function computeTachibanaResult(team: ComputedTeam, song: Song, options: TachibanaOptions): TachibanaResult {
  const centerAttr = team.cards[0]?.attribute ?? null;
  const friendAttr = team.cards[5]?.attribute ?? null;

  const deckTotals = computeDeckTotals(team, options, centerAttr, friendAttr);
  const coeffs = computeAttrCoefficients(deckTotals);

  const attributeScore = computeAttributeScore(coeffs, song);
  const scoreUpPerCard = computeScoreUpScore(team, song, options);
  const scoreUpTotal = scoreUpPerCard.reduce((a, b) => a + b, 0);
  const shrink = computeShrinkScores(team, song, options, attributeScore);

  const liveEndScore = attributeScore + scoreUpTotal + shrink.total;
  const finalScore = options.scoreUpBadgeRate > 0
    ? Math.floor(liveEndScore * (1 + options.scoreUpBadgeRate / 100))
    : liveEndScore;

  // per-card attribute score (AM74 シート式) — 表示用
  const cardBreakdown: TachibanaCardBreakdown[] = team.cards.map((c, i) => {
    const shoutPost = c.shout_max + c.broachShout;
    const beatPost  = c.beat_max  + c.broachBeat;
    const melodyPost = c.melody_max + c.broachMelody;
    // BB33 / BD33 / BF33: 各属性の楽曲全体係数
    const coeffSum = TACHIBANA_SONG_SECTIONS.reduce(
      (acc, { key, multiplier }) => {
        const g = song[key] as SongNoteGroup;
        acc.shout  += multiplier * ((g.shout_white  ?? 0) * NOTE_RATE_WHITE + (g.shout_color  ?? 0) * NOTE_RATE_COLOR);
        acc.beat   += multiplier * ((g.beat_white   ?? 0) * NOTE_RATE_WHITE + (g.beat_color   ?? 0) * NOTE_RATE_COLOR);
        acc.melody += multiplier * ((g.melody_white ?? 0) * NOTE_RATE_WHITE + (g.melody_color ?? 0) * NOTE_RATE_COLOR);
        return acc;
      },
      { shout: 0, beat: 0, melody: 0 },
    );
    const cardAttrScore = Math.floor(
      shoutPost  * attrBoost('Shout',  centerAttr, friendAttr) * coeffSum.shout +
      beatPost   * attrBoost('Beat',   centerAttr, friendAttr) * coeffSum.beat +
      melodyPost * attrBoost('Melody', centerAttr, friendAttr) * coeffSum.melody,
    );
    return {
      slotIndex: i,
      cardName: c.cardname,
      attribute: c.attribute,
      attributeScore: cardAttrScore,
      scoreUpScore: scoreUpPerCard[i],
      shrinkScore: shrink.perCard[i],
      skillTypeLabel: c.skill?.originalType ?? '',
      skillReqLabel: c.skill?.originalType?.match(/（(.+?)）/)?.[1] ?? '',
    };
  });

  return {
    attributeScore,
    scoreUpScore: scoreUpTotal,
    shrinkScore: shrink.total,
    liveEndScore,
    finalScore,
    cards: cardBreakdown,
    shrinkCoverage: shrink.coverage,
  };
}

// 既存のスキル種別文字列定数を参照したい場合に外部公開
export { SKILL_TYPE };
