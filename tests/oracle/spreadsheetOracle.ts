import type { OracleInput, OracleMode, OracleResult } from './oracleTypes';
import { computeAttributeScore } from './attributeScore';
import { computeScoreUp } from './scoreUpSkill';
import { computeShrink } from './shrinkSkill';

export function runOracle(input: OracleInput, mode: OracleMode): OracleResult {
  const attr = computeAttributeScore(input);
  const scoreUp = computeScoreUp(input, mode);
  const shrink = computeShrink(input, mode, attr);
  const liveEnd = attr + scoreUp + shrink;
  const final = input.badgeRate > 0
    ? Math.floor(liveEnd * (1 + input.badgeRate / 100))
    : liveEnd;
  return { attr, scoreUp, shrink, liveEnd, final };
}
