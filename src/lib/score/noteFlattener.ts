import type { Song, SongNoteGroup } from '../data/fetchSongsJson';
import type { FlatNote } from './types';
import { ATTRS } from '../constants';
import { LIGHT_MULTIPLIER } from './constants';
import { XorShift128Plus } from './rng';
import type { ShrinkExclusion } from './shrinkExclusion';

const TYPES: { suffix: 'white' | 'color'; type: 'white' | 'color' }[] = [
  { suffix: 'white', type: 'white' },
  { suffix: 'color', type: 'color' },
];

/**
 * 楽曲の8ノートグループ×6サブキーを1次元のFlatNote配列に展開する。
 *
 * ステージグループの順序 (LIGHT_MULTIPLIER キー順 = notes_20 → light_2 → … →
 * chorus_light_6) はライブ進行に対応するため固定し、グループ内の属性・白色の
 * 並びのみ Fisher-Yates シャッフルで近似する。
 *
 * 除外フラグはグループ内シャッフルの後に先頭から付与するため、excluded ノーツは
 * 常に「配列先頭からの連続区間」になる (docs/shrink-skill-spec.md §2 の先頭除外と整合)。
 *
 * @param exclusion 縮小スキル発動判定対象外とするノート仕様 (省略時は全ノート excluded=false)
 */
export function flattenNotes(
  song: Song,
  seed?: number,
  exclusion?: ShrinkExclusion,
): FlatNote[] {
  const notes: FlatNote[] = [];
  const rng = new XorShift128Plus(seed ?? Date.now());

  for (const groupKey of Object.keys(LIGHT_MULTIPLIER)) {
    const group = song[groupKey] as SongNoteGroup | undefined;
    if (!group) continue;

    const groupNotes: FlatNote[] = [];
    for (const attr of ATTRS) {
      for (const t of TYPES) {
        const count = group[`${attr.key}_${t.suffix}` as keyof SongNoteGroup] || 0;
        for (let i = 0; i < count; i++) {
          groupNotes.push({ attribute: attr.name, type: t.type, group: groupKey, excluded: false });
        }
      }
    }

    // グループ内のみ Fisher-Yates シャッフル (ステージ順は保持)
    for (let i = groupNotes.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [groupNotes[i], groupNotes[j]] = [groupNotes[j], groupNotes[i]];
    }

    // 除外フラグはシャッフル後に先頭から付与 (excluded = 曲先頭からの連続区間)
    const isFullExcluded = exclusion?.fullGroups.has(groupKey) ?? false;
    const partialLimit = exclusion?.partialGroup === groupKey ? exclusion.partialCount : 0;
    for (let i = 0; i < groupNotes.length; i++) {
      if (isFullExcluded || i < partialLimit) groupNotes[i].excluded = true;
    }

    notes.push(...groupNotes);
  }

  return notes;
}
