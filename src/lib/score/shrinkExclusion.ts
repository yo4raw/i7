import type { Song, SongNoteGroup } from '../data/fetchSongsJson';
import type { ComputedTeam } from './types';
import { ATTRS } from '../constants';
import { LIGHT_MULTIPLIER } from './constants';
import { SKILL_TYPE } from '../data/fetchCardsJson';

/**
 * 縮小スキル先頭除外仕様。
 * デッキ内縮小スキル群の最小発動周期 (count) を基準に、低倍率グループから累積して除外する。
 * 最初に発動可能な（= count が最小の）スキルが判定開始できるノートまでを除外領域とする。
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
 * 仕様（docs/shrink-skill-spec.md §2）:
 * - デッキ内縮小スキル count の最小値 (最も早く発動可能なスキル) を基準にする
 * - 下限として notes_20 全ノートは常に除外 (minCount が notes_20 サイズ未満でも notes_20 全除外は維持)
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

  const notesCount = Object.values(groupSizes).reduce((sum, size) => sum + size, 0);
  const shrinkFirstTriggerNotes: number[] = [];
  for (const dc of team.cards) {
    const skill = dc.skill;
    if (!skill?.isShrink || skill.count <= 0) continue;
    if (skill.originalType === SKILL_TYPE.SHRINK_TIMER) {
      if (team.songDuration > 0 && notesCount > 0) {
        shrinkFirstTriggerNotes.push(Math.floor((skill.count / team.songDuration) * notesCount));
      }
    } else {
      shrinkFirstTriggerNotes.push(skill.count);
    }
  }
  if (shrinkFirstTriggerNotes.length === 0) return empty;

  const minCount = Math.min(...shrinkFirstTriggerNotes);
  const notes20Size = groupSizes.notes_20 ?? 0;
  const target = Math.max(notes20Size, minCount);

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
