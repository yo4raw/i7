import { describe, it, expect } from 'vitest';

import { flattenNotes } from '../../../src/lib/score/noteFlattener';
import { computeGroupSizes, type ShrinkExclusion } from '../../../src/lib/score/shrinkExclusion';
import { LIGHT_MULTIPLIER } from '../../../src/lib/score/constants';
import { findSongById } from '../../fixtures';

/** MONSTER GENERATiON (EXPERT+ / 428 ノーツ) */
const monsterGenerationSong = findSongById(2);
/** Binary Vampire (EXPERT+ / 461 ノーツ) */
const binaryVampireSong = findSongById(60);

const GROUP_ORDER = Object.keys(LIGHT_MULTIPLIER);

describe('flattenNotes (グループ内シャッフル)', () => {
  it('ステージグループの順序 (LIGHT_MULTIPLIER キー順) が保持される', () => {
    const notes = flattenNotes(monsterGenerationSong, 42);
    let prevGroupIndex = 0;
    for (const note of notes) {
      const idx = GROUP_ORDER.indexOf(note.group);
      expect(idx, `グループ ${note.group} の出現位置が逆行しない`).toBeGreaterThanOrEqual(prevGroupIndex);
      prevGroupIndex = idx;
    }
  });

  it('グループ × 属性 × 白色 のノーツ数構成は楽曲データと一致する', () => {
    const notes = flattenNotes(binaryVampireSong, 42);
    const sizes = computeGroupSizes(binaryVampireSong);
    const counted: Record<string, number> = {};
    for (const note of notes) {
      counted[note.group] = (counted[note.group] ?? 0) + 1;
    }
    for (const groupKey of GROUP_ORDER) {
      expect(counted[groupKey] ?? 0, `${groupKey} のノーツ数`).toBe(sizes[groupKey]);
    }
    expect(notes).toHaveLength(binaryVampireSong.notes_count!);
  });

  it('同一シードで決定論的に同じ並びを返す', () => {
    const a = flattenNotes(monsterGenerationSong, 42);
    const b = flattenNotes(monsterGenerationSong, 42);
    expect(b).toEqual(a);
  });

  it('異なるシードでは並びが変わる (構成は同一)', () => {
    const a = flattenNotes(monsterGenerationSong, 42);
    const b = flattenNotes(monsterGenerationSong, 43);
    expect(b).not.toEqual(a);
    expect(b).toHaveLength(a.length);
  });

  describe('縮小先頭除外フラグ (excluded は曲先頭からの連続区間)', () => {
    // notes_20 全除外 + 次グループの先頭 2 ノーツ部分除外 (count=22 縮小スキル相当)
    const sizes = computeGroupSizes(monsterGenerationSong);
    const notes20Size = sizes.notes_20;
    const exclusion: ShrinkExclusion = {
      fullGroups: new Set(['notes_20']),
      partialGroup: 'light_2',
      partialCount: 2,
      totalExcluded: notes20Size + 2,
    };
    const notes = flattenNotes(monsterGenerationSong, 42, exclusion);

    it('excluded ノーツ数は totalExcluded と一致する', () => {
      expect(notes.filter((n) => n.excluded)).toHaveLength(exclusion.totalExcluded);
    });

    it('excluded ノーツは配列先頭から連続し、非 excluded の後に excluded は現れない', () => {
      const firstEligible = notes.findIndex((n) => !n.excluded);
      expect(firstEligible).toBe(exclusion.totalExcluded);
      for (let i = firstEligible; i < notes.length; i++) {
        expect(notes[i].excluded, `index ${i} は非除外`).toBe(false);
      }
    });

    it('部分除外グループ (light_2) では先頭 partialCount 個のみ除外される', () => {
      const light2Notes = notes.filter((n) => n.group === 'light_2');
      expect(light2Notes.filter((n) => n.excluded)).toHaveLength(2);
      expect(light2Notes[0].excluded).toBe(true);
      expect(light2Notes[1].excluded).toBe(true);
      expect(light2Notes[2].excluded).toBe(false);
    });

    it('exclusion 未指定時は全ノーツ excluded=false', () => {
      const plain = flattenNotes(monsterGenerationSong, 42);
      expect(plain.every((n) => !n.excluded)).toBe(true);
    });
  });
});
