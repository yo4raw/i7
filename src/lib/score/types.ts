export type AttributeName = 'Shout' | 'Beat' | 'Melody';

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

export interface CardSkillStats {
  cardIndex: number;
  cardname: string;
  skillType: string;
  avgActivations: number;
  theoreticalRate: number;
  avgScoreContribution: number;
}
