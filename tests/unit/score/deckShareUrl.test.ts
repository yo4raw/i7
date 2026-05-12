import { describe, it, expect } from 'vitest';
import {
  encodeDeckToParams,
  decodeParamsToDeck,
  buildShareUrl,
  isDeckEmpty,
  type DeckShareState,
} from '../../../src/lib/score/deckShareUrl';

function makeState(overrides: Partial<DeckShareState> = {}): DeckShareState {
  return {
    songId: null,
    deckIds: [null, null, null, null, null, null],
    bonusTiers: ['none', 'none', 'none', 'none', 'none', 'none'],
    trained: [true, true, true, true, true, true],
    sharedBroachs: [[], [], [], [], [], []],
    skillLevels: [5, 5, 5, 5, 5, 5],
    ...overrides,
  };
}

describe('deckShareUrl', () => {
  describe('encode → decode round-trip', () => {
    it('空デッキ (songId null, 全スロット null) を可逆に encode/decode できる', () => {
      const state = makeState();
      const params = encodeDeckToParams(state);
      const decoded = decodeParamsToDeck(params);
      expect(decoded).not.toBeNull();
      expect(decoded!.deckIds).toEqual(state.deckIds);
      expect(decoded!.bonusTiers).toEqual(state.bonusTiers);
      expect(decoded!.trained).toEqual(state.trained);
      expect(decoded!.skillLevels).toEqual(state.skillLevels);
      expect(decoded!.sharedBroachs).toEqual(state.sharedBroachs);
    });

    it('フル装填デッキ (楽曲 + 衣装 6 枚 + ティア混合 + スキルレベル混合) を可逆に round-trip できる', () => {
      const state = makeState({
        songId: 10025,
        deckIds: [1234, 5678, 9012, 3456, 7890, 11111],
        bonusTiers: ['gold', 'silver', 'bronze', 'none', 'gold', 'silver'],
        trained: [true, true, false, true, false, true],
        skillLevels: [5, 4, 3, 5, 2, 1],
      });
      const params = encodeDeckToParams(state);
      const decoded = decodeParamsToDeck(params);
      expect(decoded).not.toBeNull();
      expect(decoded!.songId).toBe(10025);
      expect(decoded!.deckIds).toEqual(state.deckIds);
      expect(decoded!.bonusTiers).toEqual(state.bonusTiers);
      expect(decoded!.trained).toEqual(state.trained);
      expect(decoded!.skillLevels).toEqual(state.skillLevels);
    });

    it('共有ブローチ配列を含むデッキを round-trip できる', () => {
      const state = makeState({
        songId: 10001,
        deckIds: [1001, 1002, 1003, 1004, 1005, 1006],
        sharedBroachs: [[101, 102], [201], [], [], [301, 302, 303], []],
      });
      const params = encodeDeckToParams(state);
      const decoded = decodeParamsToDeck(params);
      expect(decoded).not.toBeNull();
      expect(decoded!.sharedBroachs).toEqual(state.sharedBroachs);
    });

    it('部分的に欠けたスロットでも他フィールドが空でなければ復元できる', () => {
      const state = makeState({
        songId: 555,
        deckIds: [1001, null, 1003, null, 1005, null],
      });
      const params = encodeDeckToParams(state);
      const decoded = decodeParamsToDeck(params);
      expect(decoded!.deckIds).toEqual([1001, null, 1003, null, 1005, null]);
    });
  });

  describe('decodeParamsToDeck', () => {
    it('dv が無いと null を返す', () => {
      const params = new URLSearchParams('cards=1.2.3.4.5.6');
      expect(decodeParamsToDeck(params)).toBeNull();
    });

    it('dv が想定外の値だと null を返す', () => {
      const params = new URLSearchParams('dv=99&cards=1.2.3.4.5.6');
      expect(decodeParamsToDeck(params)).toBeNull();
    });

    it('cards の長さが 6 でなければそのフィールドのみスキップする', () => {
      const params = new URLSearchParams('dv=1&cards=1.2.3&tr=111110');
      const decoded = decodeParamsToDeck(params);
      expect(decoded).not.toBeNull();
      expect(decoded!.deckIds).toBeUndefined();
      expect(decoded!.trained).toEqual([true, true, true, true, true, false]);
    });

    it('tr に 0/1 以外の文字が含まれているとそのフィールドだけスキップする', () => {
      const params = new URLSearchParams('dv=1&tr=11x110&lv=555555');
      const decoded = decodeParamsToDeck(params);
      expect(decoded).not.toBeNull();
      expect(decoded!.trained).toBeUndefined();
      expect(decoded!.skillLevels).toEqual([5, 5, 5, 5, 5, 5]);
    });

    it('未知の tier 文字は none にフォールバックする', () => {
      const params = new URLSearchParams('dv=1&tiers=g.s.b.n.x.z');
      const decoded = decodeParamsToDeck(params);
      expect(decoded!.bonusTiers).toEqual(['gold', 'silver', 'bronze', 'none', 'none', 'none']);
    });
  });

  describe('buildShareUrl', () => {
    it('指定 URL に ? と params を連結する', () => {
      const state = makeState({ songId: 100, deckIds: [1, 2, 3, 4, 5, 6] });
      const url = buildShareUrl(state, 'https://example.com/score-calc/');
      expect(url.startsWith('https://example.com/score-calc/?')).toBe(true);
      expect(url).toContain('dv=1');
      expect(url).toContain('song=100');
      expect(url).toContain('cards=1.2.3.4.5.6');
    });
  });

  describe('isDeckEmpty', () => {
    it('songId null かつ全スロット null なら空判定', () => {
      expect(isDeckEmpty(makeState())).toBe(true);
    });

    it('songId だけ設定されている場合は非空', () => {
      expect(isDeckEmpty(makeState({ songId: 1 }))).toBe(false);
    });

    it('衣装 1 枚でも入っていれば非空', () => {
      expect(isDeckEmpty(makeState({ deckIds: [1, null, null, null, null, null] }))).toBe(false);
    });
  });
});
