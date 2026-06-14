import type { Song, SongNoteGroup } from '../data/fetchSongsJson';
import { SONG_NOTE_GROUP_KEYS } from '../data/fetchSongsJson';
import { SHARED_BROACHS } from '../data/sharedBroachs';
import type { AttributeName } from './types';
import { calcNoteScore } from './simulation';

export type BroachAttrTag = AttributeName | 'All';

export interface BroachRankingEntry {
  id: number;
  name: string;
  score: number;
  /** バー色分け用。単一属性ブローチはその属性、複数属性は 'All' */
  attribute: BroachAttrTag;
}

const ATTR_FIELDS: { name: AttributeName; field: 'shout' | 'beat' | 'melody' }[] = [
  { name: 'Shout', field: 'shout' },
  { name: 'Beat', field: 'beat' },
  { name: 'Melody', field: 'melody' },
];
const TYPES: ('white' | 'color')[] = ['white', 'color'];
const TOP_N = 10;

function broachTag(shout: number, beat: number, melody: number): BroachAttrTag {
  const vals = { shout, beat, melody };
  const nonZero = ATTR_FIELDS.filter(a => vals[a.field] > 0);
  return nonZero.length === 1 ? nonZero[0].name : 'All';
}

/**
 * 楽曲ごとの共通ブローチ単独スコア寄与を計算し、寄与降順の上位 TOP_N を返す。
 * 寄与 = Σ_(group,attr,type) count(group,attr,type) × calcNoteScore(broach[attr], {type, group})。
 * デッキ枚数でスケールする targetAttribute 付きブローチ（id 24-26）は対象外。
 */
export function buildBroachRanking(song: Song): BroachRankingEntry[] {
  const entries: BroachRankingEntry[] = [];

  for (const broach of SHARED_BROACHS) {
    if (broach.targetAttribute) continue;

    let score = 0;
    for (const groupKey of SONG_NOTE_GROUP_KEYS) {
      const group = song[groupKey] as SongNoteGroup | undefined;
      if (!group) continue;
      for (const attr of ATTR_FIELDS) {
        const appeal = broach[attr.field];
        if (!appeal) continue;
        for (const type of TYPES) {
          const count = (group[`${attr.field}_${type}` as keyof SongNoteGroup] as number) ?? 0;
          if (!count) continue;
          score += count * calcNoteScore(appeal, {
            attribute: attr.name,
            type,
            group: groupKey,
            excluded: false,
          });
        }
      }
    }

    if (score > 0) {
      entries.push({
        id: broach.id,
        name: broach.name,
        score,
        attribute: broachTag(broach.shout, broach.beat, broach.melody),
      });
    }
  }

  entries.sort((a, b) => b.score - a.score);
  return entries.slice(0, TOP_N);
}
