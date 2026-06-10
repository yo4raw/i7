// 互換レイヤー: チーム計算は teamBuilder、スコア計算・シミュレーションは simulation に分割されている。
// 既存の import パス（engine からの一括 import）を維持するための re-export。
export { getCenterSkillRate, computeTeam } from './teamBuilder';
export {
  calcShrinkCoverage,
  calcMinScore,
  calcMaxScore,
  calcExpectedScore,
  calcCardSkillExpected,
  calcCardSkillMaxActivations,
  calcCardSkillMax,
  runSimulation,
} from './simulation';
export { flattenNotes } from './noteFlattener';
export {
  computeGroupSizes,
  computeShrinkExclusion,
  type ShrinkExclusion,
} from './shrinkExclusion';
