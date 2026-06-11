/**
 * 衣装比較ページ用: 1枚あたりの強さ指標計算（デッキ非依存の純粋関数）。
 *
 * 前提条件 (docs/adr/0007 / docs/superpowers/specs/2026-06-11-card-compare-design.md):
 * - UR 限定 / 全ノーツ Perfect 前提 / センタースキル無視 / 固有ブローチ装備込み
 * - スコアアップ系: 期待スコア = 属性値由来スコア + スキル期待値
 * - 判定縮小系: 期待スコア化せず多段ソート（秒数 → 最大発動回数 → 確率 → 属性値合計）
 */
import type { Card } from '../data/fetchCardsJson';
import { SKILL_TYPE } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { Song, SongNoteGroup } from '../data/fetchSongsJson';
import { SONG_NOTE_GROUP_KEYS } from '../data/fetchSongsJson';
import { ATTRS } from '../constants';
import { normalizeAttribute, type AttributeName, type CardSkill } from './types';
import { LIGHT_MULTIPLIER, NOTE_RATE } from './constants';
import { parseSkill } from './teamBuilder';
import { calcBroachScoreBonus, resolveDeckBroachs } from './broachResolver';

export interface CardAppeal {
  Shout: number;
  Beat: number;
  Melody: number;
}

export interface CardStrengthEntry {
  card: Card;
  attribute: AttributeName;
  /** 特効・固有ブローチ適用後の属性値 */
  appeal: CardAppeal;
  appealTotal: number;
  /** 属性値由来スコア（種類9ブローチのスコアボーナス込み） */
  baseScore: number;
  /** スコアアップ期待値（縮小・判定補助系・スキルなしは 0） */
  skillExpected: number;
  totalScore: number;
  /** 選択曲での最大発動回数 = floor(発動機会 ÷ count) */
  maxActivations: number;
  skill: CardSkill | null;
  broachScoreBonus: number;
}

export type CompareGroup = 'scoreUp' | 'shrink';

/** スキル種別の比較グループ判定。縮小系以外（判定補助・スキルなし含む）は scoreUp 扱い */
export function classifyCard(card: Card): CompareGroup {
  const t = card.ap_skill_type;
  if (t && (t === SKILL_TYPE.SHRINK || t.startsWith(SKILL_TYPE.SHRINK_PREFIX))) return 'shrink';
  return 'scoreUp';
}

/**
 * 属性値から選択曲の属性値由来スコアを計算する。
 * 1ノーツのスコアは属性・白色・グループのみで決まるため、シャッフル不要で
 * グループ別カウント × 1ノーツ基底値を決定的に合算できる (simulation.ts calcNoteScore と同式)。
 */
export function calcBaseScore(appeal: CardAppeal, song: Song): number {
  let total = 0;
  for (const groupKey of SONG_NOTE_GROUP_KEYS) {
    const group = song[groupKey] as SongNoteGroup | undefined;
    if (!group) continue;
    const mult = LIGHT_MULTIPLIER[groupKey];
    for (const attr of ATTRS) {
      for (const t of ['white', 'color'] as const) {
        const count = group[`${attr.key}_${t}` as keyof SongNoteGroup] || 0;
        if (!count) continue;
        const perNote = Math.floor(Math.floor(appeal[attr.name] * NOTE_RATE[t]) * mult);
        total += perNote * count;
      }
    }
  }
  return total;
}

/**
 * 特効・固有ブローチ適用後の属性値を計算する。
 * カードに複数ブローチがある場合は、1個ずつ装備した時の
 * (属性値由来スコア + 種類9スコアボーナス) が最大になるブローチを選ぶ。
 * 条件判定は単独デッキ [card, null×5] で resolveDeckBroachs を再利用する。
 */
export function calcCardStrengthAppeal(
  card: Card,
  allBroachs: FixedBroach[],
  song: Song,
  bonusMultiplier = 1,
): { appeal: CardAppeal; broachScoreBonus: number } {
  const s = Math.round((card.shout_max || 0) * bonusMultiplier);
  const b = Math.round((card.beat_max || 0) * bonusMultiplier);
  const m = Math.round((card.melody_max || 0) * bonusMultiplier);

  let best: { appeal: CardAppeal; broachScoreBonus: number } = {
    appeal: { Shout: s, Beat: b, Melody: m },
    broachScoreBonus: 0,
  };
  let bestScore = calcBaseScore(best.appeal, song);

  const deck: (Card | null)[] = [card, null, null, null, null, null];
  const cardBroachs = allBroachs.filter((br) => br.card_id === card.cardID);
  for (const br of cardBroachs) {
    if (br.id == null) continue;
    const resolved = resolveDeckBroachs(deck, cardBroachs, song, [br.id, null, null, null, null, null]);
    const broachScoreBonus = calcBroachScoreBonus(resolved);
    let aS = s, aB = b, aM = m;
    for (const rb of resolved.get(0) ?? []) {
      if (!rb.active || rb.broach.broach_type === 9) continue;
      const mult = rb.multiplier ?? 1;
      aS += (rb.broach.shout || 0) * mult;
      aB += (rb.broach.beat || 0) * mult;
      aM += (rb.broach.melody || 0) * mult;
    }
    const appeal = { Shout: aS, Beat: aB, Melody: aM };
    const score = calcBaseScore(appeal, song) + broachScoreBonus;
    if (score > bestScore) {
      best = { appeal, broachScoreBonus };
      bestScore = score;
    }
  }
  return best;
}

/** 1枚分の強さエントリを構築する */
export function buildCardStrengthEntry(
  card: Card,
  allBroachs: FixedBroach[],
  song: Song,
  bonusMultiplier = 1,
): CardStrengthEntry {
  const { appeal, broachScoreBonus } = calcCardStrengthAppeal(card, allBroachs, song, bonusMultiplier);
  const skill = parseSkill(card, 0);
  const baseScore = calcBaseScore(appeal, song) + broachScoreBonus;

  let skillExpected = 0;
  let maxActivations = 0;
  if (skill && skill.count > 0) {
    const denom = skill.isTimer ? (song.duration || 0) : (song.notes_count || 0);
    if (denom > 0) {
      maxActivations = Math.floor(denom / skill.count);
      if (!skill.isShrink) {
        skillExpected = Math.floor(maxActivations * (skill.per / 100) * skill.value);
      }
    }
  }

  return {
    card,
    attribute: normalizeAttribute(card.attribute),
    appeal,
    appealTotal: appeal.Shout + appeal.Beat + appeal.Melody,
    baseScore,
    skillExpected,
    totalScore: baseScore + skillExpected,
    maxActivations,
    skill,
    broachScoreBonus,
  };
}

/** 判定縮小系の多段ソート比較関数: ①効果秒数 → ②最大発動回数 → ③確率 → ④属性値合計（すべて優位が先） */
export function compareShrink(a: CardStrengthEntry, b: CardStrengthEntry): number {
  const av = a.skill?.value ?? 0;
  const bv = b.skill?.value ?? 0;
  if (av !== bv) return bv - av;
  if (a.maxActivations !== b.maxActivations) return b.maxActivations - a.maxActivations;
  const ap = a.skill?.per ?? 0;
  const bp = b.skill?.per ?? 0;
  if (ap !== bp) return bp - ap;
  return b.appealTotal - a.appealTotal;
}

/** 縦積み同率判定キー（秒数・最大発動回数・確率が一致 = 同率） */
export function shrinkTieKey(e: CardStrengthEntry): string {
  return `${e.skill?.value ?? 0}|${e.maxActivations}|${e.skill?.per ?? 0}`;
}

/** スコアの省略表記（1万以上は「12.3万」、未満はカンマ区切り） */
export function formatScore(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return v.toLocaleString('ja-JP');
}
