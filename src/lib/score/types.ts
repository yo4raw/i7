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
  /** 縮小スキルの発動判定・効果適用の対象外フラグ (flattenNotes で ShrinkExclusion から付与) */
  excluded: boolean;
}

export interface CardSkill {
  cardIndex: number;
  skillType: 'scoreUp' | 'timerScoreUp' | 'shrink' | 'none';
  /** 表示用スキル種別（正規化後の ap_skill_type をそのまま保持） */
  originalType: string | null;
  count: number;
  per: number;
  value: number;
  /** 判定縮小スキルの倍率（Lv 毎に 1.2〜1.6）。非縮小スキルは 0。 */
  rate: number;
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
  shrinkScores: number[];
  scoreUpScores: number[];
}

export interface ScoreOptions {
  scoreUpAssist: boolean;
  /** スコアアップバッジの倍率（%）。例: 15 → ×1.15。0 / undefined ならバッジなし */
  scoreUpBadgeRate?: number;
  /**
   * true のとき MC シミュレーションで縮小スキルの確率判定を常に成功扱いにする。
   * 縮小カバー率が理論最大値となる前提のスコア分布を算出する。
   * 期待値計算・理論最高/最低スコアには影響しない。
   */
  maxShrinkCoverage?: boolean;
}

export interface CardSkillStats {
  cardIndex: number;
  cardname: string;
  skillType: string;
  avgActivations: number;
  theoreticalRate: number;
  avgScoreContribution: number;
}

/** 算術期待値計算の結果（外部サイト準拠の単純期待値） */
export interface ExpectedScore {
  /** 属性値による楽曲スコア（スキル全不発時の素点合計） */
  baseScore: number;
  /** スコアアップスキル期待値の合計 */
  scoreUpExpected: number;
  /** 判定縮小スキル期待値 */
  shrinkExpected: number;
  /** ライブ終了時スコア（baseScore + scoreUpExpected + shrinkExpected） */
  liveEndScore: number;
  /** バッジ適用後の最終リザルト */
  finalScore: number;
}
