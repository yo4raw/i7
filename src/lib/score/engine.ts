import type { Card } from '../data/fetchCardsJson';
import { getApSkillLevel } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { Song } from '../data/fetchSongsJson';
import {
  normalizeAttribute,
  type AttributeName, type FlatNote, type CardSkill, type DeckCard,
  type ComputedTeam, type SimulationResult, type CardSkillStats, type ScoreOptions,
} from './types';
import {
  NOTE_RATE, LIGHT_MULTIPLIER, SHRINK_MULTIPLIER,
  SCOREUP_ASSIST_MULTIPLIER, SCOREUP_BADGE_RATE,
  MC_CHUNK_SIZE, CENTER_SKILL_RATES, DEFAULT_CENTER_SKILL_RATE,
  EVENT_BONUS_MULTIPLIER,
} from './constants';
import type { EventBonusTier } from './constants';
import { XorShift128Plus } from './rng';
import { flattenNotes } from './noteFlattener';
import { resolveDeckBroachs, calcBroachScoreBonus } from './broachResolver';
import { SHARED_BROACHS } from '../data/sharedBroachs';
import type { RabbitNoteMap } from '../data/rabbitNote';

/** カードからスキル情報を解析する */
function parseSkill(card: Card, slotIndex: number, skillLevel: 1 | 2 | 3 | 4 | 5 = 5): CardSkill | null {
  const type = card.ap_skill_type;
  if (!type || type === 'MISS→Good') return null;

  const sl = getApSkillLevel(card, skillLevel);
  const count = sl.count;
  const per = sl.per;
  const value = sl.value;

  if (count == null || per == null) return null;

  const isTimer = type === 'スコアアップ（タイマー）';
  const isShrink = type === '判定縮小スコアアップ';

  let skillType: CardSkill['skillType'] = 'scoreUp';
  if (isTimer) skillType = 'timerScoreUp';
  else if (isShrink) skillType = 'shrink';

  return {
    cardIndex: slotIndex,
    skillType,
    count: count || 0,
    per: per || 0,
    value: value || 0,
    isTimer,
    isShrink,
    spTime: card.sp_time || 0,
  };
}

/** センタースキルの増加率を解析する */
export function parseCenterSkillRate(ctSkill: string | null): number {
  if (!ctSkill) return 0;
  for (const [keyword, rate] of Object.entries(CENTER_SKILL_RATES)) {
    if (ctSkill.includes(keyword)) return rate;
  }
  return DEFAULT_CENTER_SKILL_RATE;
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

    const baseShout = trained ? (card.shout_max || 0) : (card.shout_min || 0);
    const baseBeat = trained ? (card.beat_max || 0) : (card.beat_min || 0);
    const baseMelody = trained ? (card.melody_max || 0) : (card.melody_min || 0);

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
      bShout += rb.broach.shout || 0;
      bBeat += rb.broach.beat || 0;
      bMelody += rb.broach.melody || 0;
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

  // センター/フレンドのセンタースキルボーナス
  let shoutRate = 0, beatRate = 0, melodyRate = 0;
  const centerAttr = deck[0] ? normalizeAttribute(deck[0].attribute) : null;
  const friendAttr = deck[5] ? normalizeAttribute(deck[5].attribute) : null;
  const centerRate = deck[0] ? parseCenterSkillRate(deck[0].ct_skill) : 0;
  const friendRate = deck[5] ? parseCenterSkillRate(deck[5].ct_skill) : 0;

  if (centerAttr === 'Shout') shoutRate += centerRate;
  if (centerAttr === 'Beat') beatRate += centerRate;
  if (centerAttr === 'Melody') melodyRate += centerRate;
  if (friendAttr === 'Shout') shoutRate += friendRate;
  if (friendAttr === 'Beat') beatRate += friendRate;
  if (friendAttr === 'Melody') melodyRate += friendRate;

  const teamShout = Math.floor((rawShout + broachShoutTotal) * (100 + shoutRate) / 100);
  const teamBeat = Math.floor((rawBeat + broachBeatTotal) * (100 + beatRate) / 100);
  const teamMelody = Math.floor((rawMelody + broachMelodyTotal) * (100 + melodyRate) / 100);

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

/** スキル全不発の最低スコア */
export function calcMinScore(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): number {
  const assistMult = options?.scoreUpAssist ? SCOREUP_ASSIST_MULTIPLIER : 1.0;
  const badgeMult = options?.scoreUpBadge ? (1 + SCOREUP_BADGE_RATE) : 1.0;
  let total = 0;
  for (const note of notes) {
    total += team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group] * assistMult;
  }
  return Math.floor(Math.floor(total) * badgeMult) + team.broachScoreBonus;
}

/** スキル全発動の最高スコア */
export function calcMaxScore(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): number {
  const assistMult = options?.scoreUpAssist ? SCOREUP_ASSIST_MULTIPLIER : 1.0;
  const badgeMult = options?.scoreUpBadge ? (1 + SCOREUP_BADGE_RATE) : 1.0;
  const N = notes.length;

  // タイマースキル: 全タイミングで必ず発動
  const timerBonus = new Array<number>(N).fill(0);
  for (const dc of team.cards) {
    const skill = dc.skill;
    if (!skill || !skill.isTimer || skill.count <= 0) continue;

    const maxAct = Math.floor(team.songDuration / skill.count);
    for (let a = 1; a <= maxAct; a++) {
      const t = a * skill.count;
      const startNote = Math.floor((t / team.songDuration) * N);
      const endNote = Math.min(Math.floor(((t + skill.spTime) / team.songDuration) * N), N);
      for (let n = startNote; n < endNote; n++) {
        timerBonus[n] += skill.value;
      }
    }
  }

  // 通常スキル: 全タイミングで必ず発動
  let total = 0;
  const counters = team.cards.map(() => 0);
  const shrinkEndNotes = team.cards.map(() => 0);

  for (let n = 0; n < N; n++) {
    const note = notes[n];
    let scoreUpSum = timerBonus[n];

    for (let c = 0; c < team.cards.length; c++) {
      const skill = team.cards[c].skill;
      if (!skill || skill.isTimer) continue;
      if (skill.count <= 0) continue;

      counters[c]++;
      if (counters[c] >= skill.count) {
        counters[c] = 0;
        if (skill.isShrink) {
          const noteTime = n / N * team.songDuration;
          const endNote = Math.min(
            Math.floor(((noteTime + skill.spTime) / team.songDuration) * N),
            N,
          );
          shrinkEndNotes[c] = Math.max(shrinkEndNotes[c], endNote);
        } else {
          scoreUpSum += skill.value;
        }
      }
    }

    let shrinkActive = false;
    for (let c = 0; c < team.cards.length; c++) {
      if (shrinkEndNotes[c] > n) { shrinkActive = true; break; }
    }

    const base = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group];
    const assistedBase = base * assistMult;
    const shrinkExtra = (shrinkActive && note.group !== 'notes_20') ? base * (SHRINK_MULTIPLIER - 1.0) : 0;
    total += assistedBase + shrinkExtra + scoreUpSum;
  }

  return Math.floor(Math.floor(total) * badgeMult) + team.broachScoreBonus;
}

interface RunOnceResult {
  score: number;
  activations: number[];
  contributions: number[];
}

/** MC 1回分の実行 */
function runOnce(team: ComputedTeam, notes: FlatNote[], rng: XorShift128Plus, options?: ScoreOptions): RunOnceResult {
  const assistMult = options?.scoreUpAssist ? SCOREUP_ASSIST_MULTIPLIER : 1.0;
  const badgeMult = options?.scoreUpBadge ? (1 + SCOREUP_BADGE_RATE) : 1.0;
  const N = notes.length;
  const cardCount = team.cards.length;
  const activations = new Array<number>(cardCount).fill(0);
  const contributions = new Array<number>(cardCount).fill(0);

  // Phase 1: タイマースキル
  const timerBonus = new Array<number>(N).fill(0);
  for (let c = 0; c < cardCount; c++) {
    const skill = team.cards[c].skill;
    if (!skill || !skill.isTimer || skill.count <= 0) continue;

    const maxAct = Math.floor(team.songDuration / skill.count);
    for (let a = 1; a <= maxAct; a++) {
      if (rng.next() * 100 < skill.per) {
        activations[c]++;
        const t = a * skill.count;
        const startNote = Math.floor((t / team.songDuration) * N);
        const endNote = Math.min(Math.floor(((t + skill.spTime) / team.songDuration) * N), N);
        for (let n = startNote; n < endNote; n++) {
          timerBonus[n] += skill.value;
          contributions[c] += skill.value;
        }
      }
    }
  }

  // Phase 2: ノート順処理
  let totalScore = 0;
  const counters = new Array<number>(cardCount).fill(0);
  const shrinkEndNotes = new Array<number>(cardCount).fill(0);

  for (let n = 0; n < N; n++) {
    const note = notes[n];
    let scoreUpSum = timerBonus[n];

    for (let c = 0; c < cardCount; c++) {
      const skill = team.cards[c].skill;
      if (!skill || skill.isTimer) continue;
      if (skill.count <= 0) continue;

      counters[c]++;
      if (counters[c] >= skill.count) {
        counters[c] = 0;
        if (rng.next() * 100 < skill.per) {
          activations[c]++;
          if (skill.isShrink) {
            const noteTime = n / N * team.songDuration;
            const endNote = Math.min(
              Math.floor(((noteTime + skill.spTime) / team.songDuration) * N),
              N,
            );
            shrinkEndNotes[c] = Math.max(shrinkEndNotes[c], endNote);
          } else {
            scoreUpSum += skill.value;
            contributions[c] += skill.value;
          }
        }
      }
    }

    // 判定縮小スキルのアクティブ判定（spTime 持続時間ベース）
    let shrinkActive = false;
    for (let c = 0; c < cardCount; c++) {
      if (shrinkEndNotes[c] > n) { shrinkActive = true; break; }
    }

    const base = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group];
    const assistedBase = base * assistMult;
    const shrinkExtra = (shrinkActive && note.group !== 'notes_20') ? base * (SHRINK_MULTIPLIER - 1.0) : 0;
    const noteScore = assistedBase + shrinkExtra + scoreUpSum;
    totalScore += noteScore;

    // 判定縮小スキルのスコア寄与を発動中のカードに按分（notes_20は対象外）
    if (shrinkActive && note.group !== 'notes_20') {
      const extra = base * (SHRINK_MULTIPLIER - 1.0);
      let activeShrinkCount = 0;
      for (let c = 0; c < cardCount; c++) {
        if (shrinkEndNotes[c] > n) activeShrinkCount++;
      }
      for (let c = 0; c < cardCount; c++) {
        if (shrinkEndNotes[c] > n) {
          contributions[c] += extra / activeShrinkCount;
        }
      }
    }
  }

  return { score: Math.floor(Math.floor(totalScore) * badgeMult) + team.broachScoreBonus, activations, contributions };
}

/** MC シミュレーション実行（チャンク分割） */
export async function runSimulation(
  team: ComputedTeam,
  notes: FlatNote[],
  iterations: number,
  onProgress?: (pct: number) => void,
  seed?: number,
  options?: ScoreOptions,
): Promise<SimulationResult> {
  const minScore = calcMinScore(team, notes, options);
  const maxScore = calcMaxScore(team, notes, options);

  const rng = new XorShift128Plus(seed ?? Date.now());
  const scores: number[] = [];
  const cardCount = team.cards.length;
  const totalActivations = new Array<number>(cardCount).fill(0);
  const totalContributions = new Array<number>(cardCount).fill(0);

  for (let i = 0; i < iterations; i += MC_CHUNK_SIZE) {
    const end = Math.min(i + MC_CHUNK_SIZE, iterations);
    for (let j = i; j < end; j++) {
      const result = runOnce(team, notes, rng, options);
      scores.push(result.score);
      for (let c = 0; c < cardCount; c++) {
        totalActivations[c] += result.activations[c];
        totalContributions[c] += result.contributions[c];
      }
    }
    onProgress?.(end / iterations);
    await new Promise<void>(r => setTimeout(r, 0));
  }

  // 統計計算
  const sorted = [...scores].sort((a, b) => a - b);
  const sum = scores.reduce((a, b) => a + b, 0);
  const mean = sum / scores.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];

  // カードごとのスキル発動統計
  const cardStats: CardSkillStats[] = team.cards
    .filter(dc => dc.skill && dc.skill.skillType !== 'none')
    .map((dc, _, arr) => {
      const c = team.cards.indexOf(dc);
      return {
        cardIndex: dc.slotIndex,
        cardname: dc.cardname,
        skillType: dc.skill!.skillType === 'timerScoreUp' ? 'スコアアップ（タイマー）'
          : dc.skill!.isShrink ? '判定縮小スコアアップ'
          : 'スコアアップ',
        avgActivations: totalActivations[c] / iterations,
        theoreticalRate: dc.skill!.per,
        avgScoreContribution: totalContributions[c] / iterations,
      };
    });

  return {
    minScore,
    maxScore,
    scores,
    mean: Math.round(mean),
    median: Math.round(median),
    stddev: Math.round(stddev),
    p90: Math.round(p90),
    mcMin: sorted[0],
    mcMax: sorted[sorted.length - 1],
    cardStats,
  };
}

export { flattenNotes } from './noteFlattener';
