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
 * ノート順序は不明のため Fisher-Yates シャッフルで近似する。
 *
 * @param exclusion 縮小スキル発動判定対象外とするノート仕様 (省略時は全ノート excluded=false)
 */
export function flattenNotes(
  song: Song,
  seed?: number,
  exclusion?: ShrinkExclusion,
): FlatNote[] {
  const notes: FlatNote[] = [];

  for (const groupKey of Object.keys(LIGHT_MULTIPLIER)) {
    const group = song[groupKey] as SongNoteGroup | undefined;
    if (!group) continue;

    const isFullExcluded = exclusion?.fullGroups.has(groupKey) ?? false;
    const isPartial = exclusion?.partialGroup === groupKey;
    const partialLimit = isPartial ? exclusion!.partialCount : 0;
    let partialEmitted = 0;

    for (const attr of ATTRS) {
      for (const t of TYPES) {
        const count = group[`${attr.key}_${t.suffix}` as keyof SongNoteGroup] || 0;
        for (let i = 0; i < count; i++) {
          let excluded = false;
          if (isFullExcluded) {
            excluded = true;
          } else if (isPartial && partialEmitted < partialLimit) {
            excluded = true;
            partialEmitted++;
          }
          notes.push({ attribute: attr.name, type: t.type, group: groupKey, excluded });
        }
      }
    }
  }

  // Fisher-Yates シャッフル
  const rng = new XorShift128Plus(seed ?? Date.now());
  for (let i = notes.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [notes[i], notes[j]] = [notes[j], notes[i]];
  }

  return notes;
}
