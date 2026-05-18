import { describe, it, expect } from 'vitest';

import type { Card } from '../../../../src/lib/data/fetchCardsJson';
import { computeTeam } from '../../../../src/lib/score/engine';
import { computeTachibanaResult, TACHIBANA_DEFAULT_OPTIONS } from '../../../../src/lib/score/tachibana';
import { findCardById, findSongById, findBroachsByCardId } from '../../../fixtures';

/**
 * 公開スプレッドシート (https://docs.google.com/spreadsheets/d/1st1aSskGKKKl4H-XLFsTQ8zMnwrGRjqgFgdDs5bhLns/)
 * の「スコア計算」シートの参照値と一致することを検証する。
 *
 * デッキ構成:
 *   - 1枚目, 2枚目: 百[記念日2024] (cardID 2237, Beat, 判定縮小 Perfect, lv5)
 *   - 3枚目(センター): 百[7th Anniversary] (cardID 1805, Beat, スコアアップ コンボ, lv5)
 *   - 4枚目, 5枚目, 6枚目(フレンド): 千[記念日2021] (cardID 1488, Beat, スコアアップ Perfect, lv5)
 *
 * 楽曲: Binary Vampire (id 60, Re:vale, ノーツ 461, 92 秒)
 *
 * オプション:
 *   - 特効: 銀 (per-card) + 特効ON (deck-level ×1.2)
 *   - スコアアップフル発動 ON, 縮小フル発動 ON
 *   - SCOREUPバッジ 16%
 *
 * 期待値（シートの D20..D24 セル）:
 *   - 属性値スコア D20 = 1,876,289
 *   - スコアアップスキル D21 = 747,118
 *   - 縮小スキル D22 = 938,144
 *   - ライブ終了時 D23 = 3,561,551
 *   - 最終リザルト D24 = 4,131,399
 */
describe('computeTachibanaResult — 公開シート参照値の再現', () => {
  const card2237 = findCardById(2237); // 百[記念日2024] Beat 判定縮小Perfect
  const card1805 = findCardById(1805); // 百[7th Anniversary] Beat スコアアップコンボ
  const card1488 = findCardById(1488); // 千[記念日2021] Beat スコアアップPerfect
  const song = findSongById(60);       // Binary Vampire

  const deck: (Card | null)[] = [card2237, card2237, card1805, card1488, card1488, card1488];
  // 百[7th Anniversary] には Beat +800 の固定ブローチが紐づいている
  const broachs = findBroachsByCardId(1805);
  const team = computeTeam(
    deck,
    broachs,
    song,
    ['silver', 'silver', 'silver', 'silver', 'silver', 'silver'], // 全カード銀特効
    [true, true, true, true, true, true],
    undefined,
    undefined,
    [5, 5, 5, 5, 5, 5],
    {},
  );

  const result = computeTachibanaResult(team, song, {
    ...TACHIBANA_DEFAULT_OPTIONS,
    specialEffectActive: true,  // I6 = TRUE
    scoreUpBadgeRate: 16,       // K6 = TRUE, バッジ 16%
  });

  it('属性値スコア (D20) = 1,876,289', () => {
    expect(result.attributeScore).toBe(1876289);
  });

  it('スコアアップスキル (D21) = 747,118', () => {
    expect(result.scoreUpScore).toBe(747118);
  });

  it('縮小スキル (D22) = 938,144', () => {
    expect(result.shrinkScore).toBe(938144);
  });

  it('ライブ終了時 (D23) = 3,561,551', () => {
    expect(result.liveEndScore).toBe(3561551);
  });

  it('最終リザルト (D24) = 4,131,399', () => {
    expect(result.finalScore).toBe(4131399);
  });

  it('縮小カバー率 (M6) ≈ 1.804', () => {
    expect(result.shrinkCoverage).toBeCloseTo(1.804347826, 3);
  });
});

describe('computeTachibanaResult — SCOREUPバッジ無効時', () => {
  const card1488 = findCardById(1488);
  const song = findSongById(60);
  const deck: (Card | null)[] = [card1488, card1488, card1488, card1488, card1488, card1488];
  const team = computeTeam(deck, [], song, undefined, undefined, undefined, undefined, [5, 5, 5, 5, 5, 5], {});

  it('SCOREUPバッジ 0% のとき finalScore = liveEndScore', () => {
    const result = computeTachibanaResult(team, song, {
      ...TACHIBANA_DEFAULT_OPTIONS,
      scoreUpBadgeRate: 0,
    });
    expect(result.finalScore).toBe(result.liveEndScore);
  });
});
