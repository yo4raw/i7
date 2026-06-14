import { describe, it, expect } from 'vitest';
import { isHighScoreEvent } from '../../src/lib/data/eventBonusTiers';

describe('isHighScoreEvent', () => {
  it('ハイスコアライブイベントは true', () => {
    expect(isHighScoreEvent('ハイスコアライブイベント')).toBe(true);
  });
  it('「ハイスコア」を含めば true（表記揺れ吸収）', () => {
    expect(isHighScoreEvent('ハイスコア')).toBe(true);
  });
  it('他のイベント種別は false', () => {
    expect(isHighScoreEvent('ポイントライブイベント')).toBe(false);
    expect(isHighScoreEvent('ミッションイベント')).toBe(false);
  });
  it('空・null・undefined は false', () => {
    expect(isHighScoreEvent('')).toBe(false);
    expect(isHighScoreEvent(null)).toBe(false);
    expect(isHighScoreEvent(undefined)).toBe(false);
  });
});
