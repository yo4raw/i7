import type { Song, SongNoteGroup } from '../data/fetchSongsJson';
import type { ComputedTeam } from './types';
import { ATTRS } from '../constants';
import { LIGHT_MULTIPLIER } from './constants';

/**
 * 縮小スキル先頭除外仕様。
 * デッキ内縮小スキル群の最大発動周期 (count) を基準に、低倍率グループから累積して除外する。
 */
export interface ShrinkExclusion {
  /** 完全除外されるグループ名 (低倍率側から累積) */
  fullGroups: Set<string>;
  /** 部分除外されるグループ (fullGroups 直後の 1 つ)。partialCount が 0 のときは undefined */
  partialGroup?: string;
  /** partialGroup 内で先頭から除外するノート数 (1 以上、そのグループ総数未満) */
  partialCount: number;
  /** 除外される総ノート数 (sum(fullGroups) + partialCount) */
  totalExcluded: number;
}

const SUFFIXES = ['white', 'color'] as const;

/**
 * 楽曲のグループ別ノート数を集計する。
 * LIGHT_MULTIPLIER のキーごとに (属性×タイプ) の総数を合算。
 */
export function computeGroupSizes(song: Song): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const groupKey of Object.keys(LIGHT_MULTIPLIER)) {
    const group = song[groupKey] as SongNoteGroup | undefined;
    if (!group) {
      sizes[groupKey] = 0;
      continue;
    }
    let sum = 0;
    for (const attr of ATTRS) {
      for (const suffix of SUFFIXES) {
        const v = group[`${attr.key}_${suffix}` as keyof SongNoteGroup];
        if (typeof v === 'number') sum += v;
      }
    }
    sizes[groupKey] = sum;
  }
  return sizes;
}

/**
 * デッキ内の縮小スキル群と楽曲ノート構成から、縮小発動判定対象外の先頭ノート仕様を算出する。
 *
 * 仕様:
 * - デッキ内縮小スキル count の最大値 (最も発動の遅いスキル) を基準にする
 * - 下限として notes_20 全ノートは常に除外 (最大 count が notes_20 サイズ未満でも notes_20 全除外は維持)
 * - LIGHT_MULTIPLIER のキー順 (低倍率→高倍率) に累積して除外対象グループ/部分数を決定
 * - 縮小スキルが 0 枚のときは空仕様 (totalExcluded: 0) を返す
 */
export function computeShrinkExclusion(
  team: ComputedTeam,
  groupSizes: Record<string, number>,
): ShrinkExclusion {
  const empty: ShrinkExclusion = {
    fullGroups: new Set(),
    partialCount: 0,
    totalExcluded: 0,
  };

  const shrinkCounts: number[] = [];
  for (const dc of team.cards) {
    const skill = dc.skill;
    if (skill?.isShrink && skill.count > 0) shrinkCounts.push(skill.count);
  }
  if (shrinkCounts.length === 0) return empty;

  const maxCount = Math.max(...shrinkCounts);
  const notes20Size = groupSizes.notes_20 ?? 0;
  const target = Math.max(notes20Size, maxCount);

  const fullGroups = new Set<string>();
  let partialGroup: string | undefined;
  let partialCount = 0;
  let cumulative = 0;

  for (const groupKey of Object.keys(LIGHT_MULTIPLIER)) {
    const size = groupSizes[groupKey] ?? 0;
    if (size <= 0) continue;

    const remaining = target - cumulative;
    if (remaining <= 0) break;

    if (size <= remaining) {
      fullGroups.add(groupKey);
      cumulative += size;
    } else {
      partialGroup = groupKey;
      partialCount = remaining;
      cumulative += remaining;
      break;
    }
  }

  return {
    fullGroups,
    partialGroup,
    partialCount,
    totalExcluded: cumulative,
  };
}
