import { ATTRIBUTE_MAP } from '../constants';

export type AttributeName = 'Shout' | 'Beat' | 'Melody';

/** Card.attribute を AttributeName に正規化 */
export function normalizeAttribute(attr: string | number | null): AttributeName {
  if (typeof attr === 'number') return (ATTRIBUTE_MAP[attr] as AttributeName) || 'Shout';
  if (attr === 'Shout' || attr === 'Beat' || attr === 'Melody') return attr;
  const num = Number(attr);
  if (!isNaN(num) && ATTRIBUTE_MAP[num]) return ATTRIBUTE_MAP[num] as AttributeName;
  return 'Shout';
}

export interface FlatNote {
  attribute: AttributeName;
  type: 'white' | 'color';
  group: string;
}

export interface CardSkill {
  cardIndex: number;
  skillType: 'scoreUp' | 'timerScoreUp' | 'shrink' | 'none';
  count: number;
  per: number;
  value: number;
  isTimer: boolean;
  isShrink: boolean;
  spTime: number;
}

export interface DeckCard {
  cardId: number;
  cardID: number;
  cardname: string;
  name: string;
  rarity: string;
  attribute: AttributeName;
  shout_max: number;
  beat_max: number;
  melody_max: number;
  skill: CardSkill | null;
  broachShout: number;
  broachBeat: number;
  broachMelody: number;
  slotIndex: number;
  bonusMultiplier: number;
}

export interface ComputedTeam {
  Shout: number;
  Beat: number;
  Melody: number;
  cards: DeckCard[];
  songDuration: number;
  rawShout: number;
  rawBeat: number;
  rawMelody: number;
  broachShout: number;
  broachBeat: number;
  broachMelody: number;
  broachScoreBonus: number;
}

export interface SimulationResult {
  minScore: number;
  maxScore: number;
  scores: number[];
  mean: number;
  median: number;
  stddev: number;
  p90: number;
  mcMin: number;
  mcMax: number;
  cardStats: CardSkillStats[];
}

export interface ScoreOptions {
  scoreUpAssist: boolean;
  scoreUpBadge: boolean;
}

export interface CardSkillStats {
  cardIndex: number;
  cardname: string;
  skillType: string;
  avgActivations: number;
  theoreticalRate: number;
  avgScoreContribution: number;
}
