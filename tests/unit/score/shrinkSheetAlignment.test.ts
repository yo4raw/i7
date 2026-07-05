import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import {
  computeTeam,
  computeGroupSizes,
  computeShrinkExclusion,
  flattenNotes,
  calcExpectedScore,
} from '../../../src/lib/score/engine';
import { calcNoteScore } from '../../../src/lib/score/simulation';
import { SCOREUP_ASSIST_RATE } from '../../../src/lib/score/constants';
import { findBroachsByCardId, findCardById, findSongById } from '../../fixtures';

const FLATTEN_SEED = 42;

/** 10th Anniversary 四葉環 (UR / Beat / BAD→Perfect スキル。縮小スキルは持たない) */
const tenthTamakiMainCard = findCardById(2484);
/** 記念日2024 四葉環 (UR / Melody / 判定縮小Perfect スキル。デッキ内で唯一の縮小スキル所持カード) */
const memorialTamakiCard = findCardById(2268);
/** MONSTER GENERATiON (EXPERT+ / 428 ノーツ) */
const monsterGenerationSong = findSongById(2);
const tenthTamakiBroachs = findBroachsByCardId(2484);

// センター: 10th 環 (縮小スキルなし) / フレンド: 記念日2024 環 (判定縮小 Perfect)
// 単一の縮小スキル所持カードのみの非飽和・単純ケース (docs/spreadsheet-spec-v1.0.7.md §6-5 BN22 / §6-6 H39)
const deck: (Card | null)[] = [
  tenthTamakiMainCard, null, null, null, null, memorialTamakiCard,
];

describe('縮小期待値: H39 小数保持 + BN22 アシスト剥離 (B6/B7)', () => {
  it('縮小期待値: H39 小数保持 + BN22 アシスト剥離 (B6/B7)', () => {
    const team = computeTeam(deck, tenthTamakiBroachs, monsterGenerationSong);
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(monsterGenerationSong));
    const notes = flattenNotes(monsterGenerationSong, FLATTEN_SEED, exclusion);
    const notesCount = monsterGenerationSong.notes_count!;

    const options = { scoreUpAssist: true, scoreUpBadgeRate: 0 };
    const exp = calcExpectedScore(team, notes, notesCount, options);

    // デッキ内で縮小スキルを持つのは記念日2024 環 (フレンド) の 1 枚のみ
    const shrinkCard = team.cards.find((dc) => dc.skill?.isShrink);
    expect(shrinkCard).toBeDefined();
    const skill = shrinkCard!.skill!;

    // eligibleBaseScore: excluded ノート除外 (ADR 0040 / I1) + assist ON の appeal 適用
    const excludedCount = notes.filter((n) => n.excluded).length;
    let eligibleBaseScore = 0;
    for (const note of notes) {
      if (note.excluded) continue;
      const raw = team[note.attribute];
      const appeal = Math.floor(raw * (1 + SCOREUP_ASSIST_RATE));
      eligibleBaseScore += calcNoteScore(appeal, note);
    }

    // BN22: 縮小基準スコアはアシスト剥離後 (assist ON なら floor(eligibleBase / 1.2))
    const strippedBase = Math.floor(eligibleBaseScore / 1.2);

    // H39: denom/count を小数のまま per/100 × value と乗算し、1 回だけ floor する
    const eligDenom = notesCount - excludedCount;
    const expSec = Math.floor((eligDenom / skill.count) * (skill.per / 100) * skill.value);

    // effectiveSeconds / capSeconds は calcShrinkCoverage の返り値を使わず、
    // 仕様書 §6-6 と ADR 0036 の定義からテスト内で独立に再計算する
    const headSeconds = (excludedCount / notesCount) * team.songDuration;
    const effectiveSeconds = team.songDuration - headSeconds;
    const headCapSeconds = (skill.count / notesCount) * team.songDuration;
    const capSeconds = Math.max(0, effectiveSeconds - headCapSeconds);

    const coverage = Math.min(expSec, capSeconds) / effectiveSeconds;
    const expected = Math.floor(strippedBase * coverage * (skill.rate - 1));

    expect(exp.shrinkExpected).toBe(expected);
  });
});
