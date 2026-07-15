/**
 * 衣装比較ページ用: 1枚あたりの強さ指標計算（デッキ非依存の純粋関数）。
 *
 * 前提条件 (docs/adr/0007 / docs/superpowers/specs/2026-06-11-card-compare-design.md):
 * - UR 限定 / 全ノーツ Perfect 前提 / センタースキル無視 / 固有ブローチ装備込み
 * - スコアアップ系: 期待スコア = 属性値由来スコア + スキル期待値
 * - 判定縮小系: 曲全体のカバー秒数で比較（最大カバー秒数 = 発動回数×秒数 / 期待カバー秒数 = ×確率）
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
  /** スコアアップ最大値 = maxActivations × value（100%発動時。縮小・判定補助系・スキルなしは 0） */
  skillMax: number;
  /** 期待スコア合計 = baseScore + skillExpected */
  totalScore: number;
  /** 最大スコア合計 = baseScore + skillMax */
  maxTotalScore: number;
  /** 選択曲での最大発動回数 = floor(発動機会 ÷ count) */
  maxActivations: number;
  /** 判定縮小系のみ: 最大カバー秒数 = maxActivations × 縮小秒数（100%発動前提の上限）。縮小以外は 0 */
  maxCoverSec: number;
  /** 判定縮小系のみ: 期待カバー秒数 = maxCoverSec × (per/100)。縮小以外は 0 */
  expectedCoverSec: number;
  skill: CardSkill | null;
  broachScoreBonus: number;
  /** 採用された固有ブローチ（属性値由来スコアが最大のもの）。ブローチ無しが最良なら null */
  appliedBroach: FixedBroach | null;
}

/** 判定縮小タブのソートキー: 属性値由来スコア / 最大カバー率 / 期待カバー率 */
export type ShrinkSortKey = 'attr' | 'max' | 'expected';

/** スコアアップタブのソートキー: 期待スコア合計 / 最大スコア合計 */
export type ScoreUpSortKey = 'expected' | 'max';

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
): { appeal: CardAppeal; broachScoreBonus: number; appliedBroach: FixedBroach | null } {
  const s = Math.round((card.shout_max || 0) * bonusMultiplier);
  const b = Math.round((card.beat_max || 0) * bonusMultiplier);
  const m = Math.round((card.melody_max || 0) * bonusMultiplier);

  let best: { appeal: CardAppeal; broachScoreBonus: number; appliedBroach: FixedBroach | null } = {
    appeal: { Shout: s, Beat: b, Melody: m },
    broachScoreBonus: 0,
    appliedBroach: null,
  };
  let bestScore = calcBaseScore(best.appeal, song);

  const deck: (Card | null)[] = [card, null, null, null, null, null];
  const cardBroachs = allBroachs.filter((br) => br.card_id === card.cardID);
  for (const br of cardBroachs) {
    if (br.id === null) continue;
    // 比較はベストケース前提のため、種類7（全属性編成）は常に発動扱いにする
    const resolved = resolveDeckBroachs(
      deck, cardBroachs, song, [br.id, null, null, null, null, null], { assumeAllAttributes: true },
    );
    const broachScoreBonus = calcBroachScoreBonus(resolved);
    let aS = s, aB = b, aM = m;
    for (const rb of resolved.get(0) ?? []) {
      if (!rb.active || rb.broach.broach_type === 9) continue;
      /* v8 ignore next -- resolveDeckBroachs が multiplier を常に number 設定するため ?? 1 へ到達しない */
      const mult = rb.multiplier ?? 1;
      aS += (rb.broach.shout || 0) * mult;
      aB += (rb.broach.beat || 0) * mult;
      aM += (rb.broach.melody || 0) * mult;
    }
    const appeal = { Shout: aS, Beat: aB, Melody: aM };
    const score = calcBaseScore(appeal, song) + broachScoreBonus;
    if (score > bestScore) {
      best = { appeal, broachScoreBonus, appliedBroach: br };
      bestScore = score;
    }
  }
  return best;
}

/**
 * 採用された固有ブローチの発動前提を表す注記文を返す（衣装比較の詳細パネル用）。
 * デッキ構成・楽曲に依存する条件を持つ種類のみ前提文を返し、無条件（種類1/6）や
 * ブローチ無し（null）は null。
 */
export function broachPremiseNote(broach: FixedBroach | null): string | null {
  switch (broach?.broach_type) {
    case 4:
      return '同グループ編成が前提';
    case 5:
      return '同アイドル・同属性編成が前提（比較では1枚分のみ加算）';
    case 7:
      return '全属性編成が前提';
    case 9:
      return '対象楽曲でのみ発動';
    default:
      return null;
  }
}

/** 1枚分の強さエントリを構築する */
export function buildCardStrengthEntry(
  card: Card,
  allBroachs: FixedBroach[],
  song: Song,
  bonusMultiplier = 1,
): CardStrengthEntry {
  const { appeal, broachScoreBonus, appliedBroach } = calcCardStrengthAppeal(card, allBroachs, song, bonusMultiplier);
  const skill = parseSkill(card, 0);
  const baseScore = calcBaseScore(appeal, song) + broachScoreBonus;

  let skillExpected = 0;
  let skillMax = 0;
  let maxActivations = 0;
  let maxCoverSec = 0;
  let expectedCoverSec = 0;
  if (skill && skill.count > 0) {
    const denom = skill.isTimer ? (song.duration || 0) : (song.notes_count || 0);
    if (denom > 0) {
      maxActivations = Math.floor(denom / skill.count);
      if (skill.isShrink) {
        // skill.value は 1 発動あたりの縮小秒数
        maxCoverSec = maxActivations * skill.value;
        expectedCoverSec = maxCoverSec * (skill.per / 100);
      } else {
        skillExpected = Math.floor(maxActivations * (skill.per / 100) * skill.value);
        skillMax = maxActivations * skill.value;
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
    skillMax,
    totalScore: baseScore + skillExpected,
    maxTotalScore: baseScore + skillMax,
    maxActivations,
    maxCoverSec,
    expectedCoverSec,
    skill,
    broachScoreBonus,
    appliedBroach,
  };
}

/**
 * スコアアップ系のソート比較関数を生成する。
 * 指定キー（期待スコア合計 / 最大スコア合計）の降順、同値は属性値由来スコアの降順。
 */
export function compareScoreUpBy(key: ScoreUpSortKey): (a: CardStrengthEntry, b: CardStrengthEntry) => number {
  return (a, b) => {
    const av = key === 'max' ? a.maxTotalScore : a.totalScore;
    const bv = key === 'max' ? b.maxTotalScore : b.totalScore;
    if (av !== bv) return bv - av;
    return b.baseScore - a.baseScore;
  };
}

/**
 * 判定縮小系のソート比較関数を生成する。
 * - 'attr': 選択曲での属性値由来スコア (baseScore) 降順、同値は期待カバー率（expectedCoverSec）降順
 * - 'max' / 'expected': カバー率（= カバー秒数 ÷ 曲尺。曲固定のため並び順は秒数と一致）降順、
 *   同値は選択曲での属性値由来スコア (baseScore) 降順
 * baseScore はチャート・詳細パネルに表示される「属性」値と同一定義のため、表示と並び順が一致する。
 */
export function compareShrinkBy(key: ShrinkSortKey): (a: CardStrengthEntry, b: CardStrengthEntry) => number {
  return (a, b) => {
    if (key === 'attr') {
      if (a.baseScore !== b.baseScore) return b.baseScore - a.baseScore;
      return b.expectedCoverSec - a.expectedCoverSec;
    }
    const av = key === 'max' ? a.maxCoverSec : a.expectedCoverSec;
    const bv = key === 'max' ? b.maxCoverSec : b.expectedCoverSec;
    if (av !== bv) return bv - av;
    return b.baseScore - a.baseScore;
  };
}

/** スコアの省略表記（1万以上は「12.3万」、未満はカンマ区切り） */
export function formatScore(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return v.toLocaleString('ja-JP');
}
