import type { Card } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { Song } from '../data/fetchSongsJson';
import type {
  AttributeName, FlatNote, CardSkill, DeckCard,
  ComputedTeam, SimulationResult, CardSkillStats,
} from './types';
import {
  NOTE_RATE, LIGHT_MULTIPLIER, SHRINK_MULTIPLIER,
  MC_CHUNK_SIZE, CENTER_FRIEND_BONUS_RATE,
  EVENT_BONUS_MULTIPLIER,
} from './constants';
import type { EventBonusTier } from './constants';
import { XorShift128Plus } from './rng';
import { flattenNotes } from './noteFlattener';
import { ATTRIBUTE_MAP } from '../constants';

/** Card.attribute を AttributeName に正規化 */
function normalizeAttribute(attr: string | number | null): AttributeName {
  if (typeof attr === 'number') return (ATTRIBUTE_MAP[attr] as AttributeName) || 'Shout';
  if (attr === 'Shout' || attr === 'Beat' || attr === 'Melody') return attr;
  // 数値文字列のケース
  const num = Number(attr);
  if (!isNaN(num) && ATTRIBUTE_MAP[num]) return ATTRIBUTE_MAP[num] as AttributeName;
  return 'Shout';
}

/** カードからLv5のスキル情報を解析する */
function parseSkill(card: Card, slotIndex: number): CardSkill | null {
  const type = card.ap_skill_type;
  if (!type || type === 'MISS→Good') return null;

  const count = card.ap_skill_5_count;
  const per = card.ap_skill_5_per;
  const value = card.ap_skill_5_value;

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

/** チームアピール値を計算する */
export function computeTeam(
  deck: (Card | null)[],
  allBroachs: FixedBroach[],
  song: Song,
  bonusTiers?: EventBonusTier[],
  trainedFlags?: boolean[],
): ComputedTeam {
  const cards: DeckCard[] = [];

  let rawShout = 0;
  let rawBeat = 0;
  let rawMelody = 0;
  let broachShoutTotal = 0;
  let broachBeatTotal = 0;
  let broachMelodyTotal = 0;

  for (let i = 0; i < 6; i++) {
    const card = deck[i];
    if (!card) continue;

    const bonusTier = bonusTiers?.[i] || 'none';
    const bonusMult = EVENT_BONUS_MULTIPLIER[bonusTier];
    const trained = trainedFlags?.[i] ?? true;

    const baseShout = trained ? (card.shout_max || 0) : (card.shout_min || 0);
    const baseBeat = trained ? (card.beat_max || 0) : (card.beat_min || 0);
    const baseMelody = trained ? (card.melody_max || 0) : (card.melody_min || 0);

    const s = Math.floor(baseShout * bonusMult);
    const b = Math.floor(baseBeat * bonusMult);
    const m = Math.floor(baseMelody * bonusMult);
    rawShout += s;
    rawBeat += b;
    rawMelody += m;

    // ブローチ加算（スロット0-4のみ）
    let bShout = 0, bBeat = 0, bMelody = 0;
    if (i < 5) {
      const cardBroachs = allBroachs.filter(br => br.card_id === card.cardID);
      for (const br of cardBroachs) {
        bShout += br.shout || 0;
        bBeat += br.beat || 0;
        bMelody += br.melody || 0;
      }
      broachShoutTotal += bShout;
      broachBeatTotal += bBeat;
      broachMelodyTotal += bMelody;
    }

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
      skill: parseSkill(card, i),
      broachShout: bShout,
      broachBeat: bBeat,
      broachMelody: bMelody,
      slotIndex: i,
      bonusMultiplier: bonusMult,
    });
  }

  // センター/フレンド同属性ボーナス
  let shoutRate = 0, beatRate = 0, melodyRate = 0;
  const centerAttr = deck[0] ? normalizeAttribute(deck[0].attribute) : null;
  const friendAttr = deck[5] ? normalizeAttribute(deck[5].attribute) : null;

  if (centerAttr === 'Shout') shoutRate += CENTER_FRIEND_BONUS_RATE;
  if (centerAttr === 'Beat') beatRate += CENTER_FRIEND_BONUS_RATE;
  if (centerAttr === 'Melody') melodyRate += CENTER_FRIEND_BONUS_RATE;
  if (friendAttr === 'Shout') shoutRate += CENTER_FRIEND_BONUS_RATE;
  if (friendAttr === 'Beat') beatRate += CENTER_FRIEND_BONUS_RATE;
  if (friendAttr === 'Melody') melodyRate += CENTER_FRIEND_BONUS_RATE;

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
  };
}

/** スキル全不発の最低スコア */
export function calcMinScore(team: ComputedTeam, notes: FlatNote[]): number {
  let total = 0;
  for (const note of notes) {
    total += team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group];
  }
  return Math.floor(total);
}

/** スキル全発動の最高スコア */
export function calcMaxScore(team: ComputedTeam, notes: FlatNote[]): number {
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

  for (let n = 0; n < N; n++) {
    const note = notes[n];
    let shrinkActive = false;
    let scoreUpSum = timerBonus[n];

    for (let c = 0; c < team.cards.length; c++) {
      const skill = team.cards[c].skill;
      if (!skill || skill.isTimer) continue;
      if (skill.count <= 0) continue;

      counters[c]++;
      if (counters[c] >= skill.count) {
        counters[c] = 0;
        if (skill.isShrink) shrinkActive = true;
        else scoreUpSum += skill.value;
      }
    }

    const base = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group];
    const shrinkMult = shrinkActive ? SHRINK_MULTIPLIER : 1.0;
    total += base * shrinkMult + scoreUpSum;
  }

  return Math.floor(total);
}

interface RunOnceResult {
  score: number;
  activations: number[];
  contributions: number[];
}

/** MC 1回分の実行 */
function runOnce(team: ComputedTeam, notes: FlatNote[], rng: XorShift128Plus): RunOnceResult {
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

  for (let n = 0; n < N; n++) {
    const note = notes[n];
    let shrinkActive = false;
    let shrinkCardIdx = -1;
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
            shrinkActive = true;
            shrinkCardIdx = c;
          } else {
            scoreUpSum += skill.value;
            contributions[c] += skill.value;
          }
        }
      }
    }

    const base = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group];
    const shrinkMult = shrinkActive ? SHRINK_MULTIPLIER : 1.0;
    const noteScore = base * shrinkMult + scoreUpSum;
    totalScore += noteScore;

    // 判定縮小スキルのスコア寄与 = base * (1.6 - 1.0)
    if (shrinkActive && shrinkCardIdx >= 0) {
      contributions[shrinkCardIdx] += base * (SHRINK_MULTIPLIER - 1.0);
    }
  }

  return { score: Math.floor(totalScore), activations, contributions };
}

/** MC シミュレーション実行（チャンク分割） */
export async function runSimulation(
  team: ComputedTeam,
  notes: FlatNote[],
  iterations: number,
  onProgress?: (pct: number) => void,
  seed?: number,
): Promise<SimulationResult> {
  const minScore = calcMinScore(team, notes);
  const maxScore = calcMaxScore(team, notes);

  const rng = new XorShift128Plus(seed ?? Date.now());
  const scores: number[] = [];
  const cardCount = team.cards.length;
  const totalActivations = new Array<number>(cardCount).fill(0);
  const totalContributions = new Array<number>(cardCount).fill(0);

  for (let i = 0; i < iterations; i += MC_CHUNK_SIZE) {
    const end = Math.min(i + MC_CHUNK_SIZE, iterations);
    for (let j = i; j < end; j++) {
      const result = runOnce(team, notes, rng);
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
