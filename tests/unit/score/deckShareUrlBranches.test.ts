import { describe, it, expect } from 'vitest';

import {
  encodeDeckToParams,
  decodeParamsToDeck,
  buildShareUrl,
  isDeckEmpty,
  type DeckShareState,
} from '../../../src/lib/score/deckShareUrl';

function baseState(overrides: Partial<DeckShareState> = {}): DeckShareState {
  return {
    songId: 2,
    deckIds: [101, 102, null, null, null, null],
    bonusTiers: ['gold', 'silver', 'bronze', 'none', 'none', 'none'],
    trained: [true, true, true, true, true, true],
    sharedBroachs: [[1, 2], [], [], [], [], []],
    skillLevels: [5, 5, 5, 5, 5, 5],
    ...overrides,
  };
}

describe('encodeDeckToParams: 欠損要素のフォールバック分岐', () => {
  it('bonusTiers が不足するスロットは none (n) に補完される (line 59 ?? none)', () => {
    const state = baseState({ bonusTiers: ['gold'] });
    const params = encodeDeckToParams(state);
    expect(params.get('tiers')).toBe('g.n.n.n.n.n');
  });

  it('skillLevels が範囲外 (0 や 6) の場合 5 に補正される (line 71 cond-expr false 分岐)', () => {
    const state = baseState({ skillLevels: [0, 6, 3, 5, 5, 5] });
    const params = encodeDeckToParams(state);
    expect(params.get('lv')).toBe('553555');
  });

  it('sharedBroachs が不足するスロットは空文字に補完される (line 77 ?? [])', () => {
    const state = baseState({ sharedBroachs: [[1, 2]] });
    const params = encodeDeckToParams(state);
    expect(params.get('sb')).toBe('1,2_____');
  });

  it('songId が null のとき song パラメータは出力されない', () => {
    const params = encodeDeckToParams(baseState({ songId: null }));
    expect(params.has('song')).toBe(false);
  });
});

describe('decodeParamsToDeck: バージョン/各フィールドの分岐', () => {
  it('dv が一致しないとき null を返す', () => {
    const p = new URLSearchParams('dv=2');
    expect(decodeParamsToDeck(p)).toBeNull();
  });

  it('dv が無いとき null を返す', () => {
    const p = new URLSearchParams('cards=1.2.3.4.5.6');
    expect(decodeParamsToDeck(p)).toBeNull();
  });

  it('song パラメータが空文字のとき songId=null になる (line 92-94 else if 分岐)', () => {
    const p = new URLSearchParams('dv=1&song=');
    const result = decodeParamsToDeck(p);
    expect(result).not.toBeNull();
    expect(result!.songId).toBeNull();
  });

  it('song が 0 以下の無効値のとき songId は未設定 (n>0 を満たさず set されない)', () => {
    const p = new URLSearchParams('dv=1&song=0');
    const result = decodeParamsToDeck(p)!;
    expect(result.songId).toBeUndefined();
  });

  it('song が有効な正の数のとき songId に設定される', () => {
    const p = new URLSearchParams('dv=1&song=36');
    expect(decodeParamsToDeck(p)!.songId).toBe(36);
  });

  it('cards の要素数が SLOTS(6) と異なるとき deckIds はセットされない', () => {
    const p = new URLSearchParams('dv=1&cards=1.2.3');
    expect(decodeParamsToDeck(p)!.deckIds).toBeUndefined();
  });

  it('cards の 0 や非数値は null スロットに変換される', () => {
    const p = new URLSearchParams('dv=1&cards=101.0.x.103.0.0');
    expect(decodeParamsToDeck(p)!.deckIds).toEqual([101, null, null, 103, null, null]);
  });

  it('tiers の要素数が 6 でないとき bonusTiers はセットされない', () => {
    const p = new URLSearchParams('dv=1&tiers=g.s.b');
    expect(decodeParamsToDeck(p)!.bonusTiers).toBeUndefined();
  });

  it('tiers の未知文字は none に変換される (line 111 ?? none)', () => {
    const p = new URLSearchParams('dv=1&tiers=g.s.b.n.z.q');
    expect(decodeParamsToDeck(p)!.bonusTiers).toEqual(['gold', 'silver', 'bronze', 'none', 'none', 'none']);
  });

  it('tr が長さ 6 でない/不正文字を含むとき trained はセットされない', () => {
    expect(decodeParamsToDeck(new URLSearchParams('dv=1&tr=11111'))!.trained).toBeUndefined();
    expect(decodeParamsToDeck(new URLSearchParams('dv=1&tr=11112x'))!.trained).toBeUndefined();
  });

  it('tr が有効なとき boolean 配列に変換される', () => {
    expect(decodeParamsToDeck(new URLSearchParams('dv=1&tr=101010'))!.trained)
      .toEqual([true, false, true, false, true, false]);
  });

  it('lv が長さ 6 でない/範囲外文字を含むとき skillLevels はセットされない', () => {
    expect(decodeParamsToDeck(new URLSearchParams('dv=1&lv=555'))!.skillLevels).toBeUndefined();
    expect(decodeParamsToDeck(new URLSearchParams('dv=1&lv=555560'))!.skillLevels).toBeUndefined();
  });

  it('lv が有効なとき number 配列に変換される', () => {
    expect(decodeParamsToDeck(new URLSearchParams('dv=1&lv=543215'))!.skillLevels)
      .toEqual([5, 4, 3, 2, 1, 5]);
  });

  it('sb のスロット数が 6 でないとき sharedBroachs はセットされない', () => {
    expect(decodeParamsToDeck(new URLSearchParams('dv=1&sb=1,2_3'))!.sharedBroachs).toBeUndefined();
  });

  it('sb の空スロットは空配列、無効値はフィルタされる', () => {
    const p = new URLSearchParams('dv=1&sb=1,2_3___0,4_x');
    expect(decodeParamsToDeck(p)!.sharedBroachs).toEqual([[1, 2], [3], [], [], [4], []]);
  });
});

describe('encode → decode ラウンドトリップ', () => {
  it('encode した state を decode で復元できる', () => {
    const state = baseState();
    const decoded = decodeParamsToDeck(encodeDeckToParams(state))!;
    expect(decoded.songId).toBe(2);
    expect(decoded.deckIds).toEqual([101, 102, null, null, null, null]);
    expect(decoded.bonusTiers).toEqual(['gold', 'silver', 'bronze', 'none', 'none', 'none']);
    expect(decoded.trained).toEqual([true, true, true, true, true, true]);
    expect(decoded.skillLevels).toEqual([5, 5, 5, 5, 5, 5]);
    expect(decoded.sharedBroachs).toEqual([[1, 2], [], [], [], [], []]);
  });
});

describe('buildShareUrl / isDeckEmpty', () => {
  it('buildShareUrl はベース URL にクエリを付与する', () => {
    const url = buildShareUrl(baseState({ songId: 2, deckIds: [1, null, null, null, null, null] }), 'https://example.com/score-calc/');
    expect(url.startsWith('https://example.com/score-calc/?')).toBe(true);
    expect(url).toContain('dv=1');
    expect(url).toContain('song=2');
  });

  it('isDeckEmpty: songId があれば false', () => {
    expect(isDeckEmpty(baseState({ songId: 2 }))).toBe(false);
  });

  it('isDeckEmpty: songId null かつ全 deckIds が null なら true', () => {
    expect(isDeckEmpty(baseState({ songId: null, deckIds: [null, null, null, null, null, null] }))).toBe(true);
  });

  it('isDeckEmpty: songId null だが deckIds に非 null があれば false', () => {
    expect(isDeckEmpty(baseState({ songId: null, deckIds: [101, null, null, null, null, null] }))).toBe(false);
  });
});
