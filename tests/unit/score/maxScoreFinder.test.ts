import { describe, it, expect } from 'vitest';

import {
  binomial,
  multichoose,
  countMultisetsWithLimits,
  multisetIndices,
  multisetIndicesOrEmpty,
  isShrinkCard,
} from '../../../src/lib/score/maxScoreFinder';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import { allCards } from '../../fixtures';

describe('組合せ数学ユーティリティ', () => {
  it('binomial: C(5,2)=10, C(4,0)=1, C(3,5)=0, C(-1,0)=0', () => {
    expect(binomial(5, 2)).toBe(10);
    expect(binomial(4, 0)).toBe(1);
    expect(binomial(3, 5)).toBe(0);
    expect(binomial(-1, 0)).toBe(0);
  });

  it('multichoose: H(3,2)=6, H(7,4)=210, H(1,4)=1', () => {
    expect(multichoose(3, 2)).toBe(6);
    expect(multichoose(7, 4)).toBe(210);
    expect(multichoose(1, 4)).toBe(1);
  });

  it('countMultisetsWithLimits: 上限付き多重集合の数え上げ', () => {
    // 各 1 枚ずつ 3 種から 2 枚 → {a,b},{a,c},{b,c} の 3 通り
    expect(countMultisetsWithLimits([1, 1, 1], 2)).toBe(3);
    // a×2, b×1 から 2 枚 → {a,a},{a,b} の 2 通り
    expect(countMultisetsWithLimits([2, 1], 2)).toBe(2);
    // 上限なし相当 (上限 ≥ k) なら multichoose と一致
    expect(countMultisetsWithLimits([4, 4, 4], 4)).toBe(multichoose(3, 4));
    // 合計上限が k 未満なら 0
    expect(countMultisetsWithLimits([1, 1], 3)).toBe(0);
  });

  it('multisetIndices: 列挙数が multichoose と一致し非減少列のみ', () => {
    const seen: string[] = [];
    for (const idx of multisetIndices(4, 3)) {
      // ジェネレーターは同一配列を破壊的に再利用するため必ずコピーする
      seen.push([...idx].join(','));
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
    }
    expect(seen.length).toBe(multichoose(4, 3));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('multisetIndices: N=0 または k=0 では何も yield しない', () => {
    expect([...multisetIndices(0, 2)].length).toBe(0);
    expect([...multisetIndices(3, 0)].length).toBe(0);
  });

  it('multisetIndicesOrEmpty: k=0 のとき空配列を 1 回だけ yield する', () => {
    const out = [...multisetIndicesOrEmpty(3, 0)].map((a) => [...a]);
    expect(out).toEqual([[]]);
    expect([...multisetIndicesOrEmpty(3, 2)].length).toBe(multichoose(3, 2));
  });
});

describe('isShrinkCard', () => {
  it('フィクスチャに判定縮小持ちと非縮小の UR が両方存在する', () => {
    const ur = allCards.filter((c) => c.rarity === 'UR' && c.ap_skill_type);
    expect(ur.some((c) => isShrinkCard(c))).toBe(true);
    expect(ur.some((c) => !isShrinkCard(c))).toBe(true);
  });

  it('null は false', () => {
    expect(isShrinkCard(null)).toBe(false);
  });

  it('スキルタイプ文字列で判定する', () => {
    const fake = (t: string | null) => ({ ap_skill_type: t }) as unknown as Card;
    expect(isShrinkCard(fake('判定縮小スコアアップ'))).toBe(true);
    expect(isShrinkCard(fake('判定縮小（タイマー）'))).toBe(true);
    expect(isShrinkCard(fake('スコアアップ'))).toBe(false);
    expect(isShrinkCard(fake(null))).toBe(false);
  });
});
