import { describe, it, expect } from 'vitest';
import {
  achievableBonusPcts,
  defaultBonusPcts,
  isPointEvent,
  pickDefaultEvent,
  type PointEventSummary,
} from '../../../src/lib/pointCalc/bonusPresets';
import { FALLBACK_BONUS_PCTS } from '../../../src/lib/pointCalc/constants';

const ev = (o?: Partial<PointEventSummary>): PointEventSummary => ({
  id: 1, eventname: 'テスト', start_date: '2026-06-01', end_date: '2026-06-08', gptUps: [50, 20, 5], ...o,
});

// 2026-06-05 12:00 JST
const DURING = Date.parse('2026-06-05T12:00:00+09:00');
// 2026-07-01 12:00 JST
const AFTER = Date.parse('2026-07-01T12:00:00+09:00');

describe('isPointEvent', () => {
  it('ポイント系イベントを判定する', () => {
    expect(isPointEvent('ポイントライブイベント')).toBe(true);
    expect(isPointEvent('ポイントミッションイベント')).toBe(true);
  });

  it('ポイント系でないものは false', () => {
    expect(isPointEvent('ハイスコアライブイベント')).toBe(false);
    expect(isPointEvent('ミッションイベント')).toBe(false);
    expect(isPointEvent('')).toBe(false);
    expect(isPointEvent(null)).toBe(false);
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(isPointEvent(undefined)).toBe(false);
  });
});

describe('achievableBonusPcts', () => {
  it('0 を必ず含み昇順で返す', () => {
    const r = achievableBonusPcts([50, 20, 5]);
    expect(r[0]).toBe(0);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
  });

  it('6 スロット分の組合せを列挙する（50/20/5 なら 300% まで到達）', () => {
    const r = achievableBonusPcts([50, 20, 5]);
    expect(r).toContain(300); // 50 × 6
    expect(r).toContain(130); // 20 × 4 + 50
    expect(r).toContain(60);  // 20 × 2 + 5 × 4
  });

  it('上限を超える値は含まない', () => {
    for (const p of achievableBonusPcts([50, 20, 5])) expect(p).toBeLessThanOrEqual(300);
  });

  it('0 の段階は無視する（未設定のティア）', () => {
    expect(achievableBonusPcts([50, 0, 0])).toEqual([0, 50, 100, 150, 200, 250, 300]);
  });

  it('全ティアが 0 なら [0] のみ', () => {
    expect(achievableBonusPcts([0, 0, 0])).toEqual([0]);
  });

  it('スロット数と上限を変えられる', () => {
    expect(achievableBonusPcts([50], 2, 300)).toEqual([0, 50, 100]);
    expect(achievableBonusPcts([50], 6, 100)).toEqual([0, 50, 100]);
  });
});

describe('pickDefaultEvent', () => {
  it('開催中のイベントを選ぶ', () => {
    const events = [ev({ id: 1, start_date: '2026-05-01', end_date: '2026-05-08' }), ev({ id: 2 })];
    expect(pickDefaultEvent(events, DURING)?.id).toBe(2);
  });

  it('開催中が無ければ開始日が最も新しいものを選ぶ', () => {
    const events = [ev({ id: 1, start_date: '2026-05-01', end_date: '2026-05-08' }), ev({ id: 2 })];
    expect(pickDefaultEvent(events, AFTER)?.id).toBe(2);
  });

  it('特効が全て 0 のイベントは選ばない', () => {
    const events = [ev({ id: 1 }), ev({ id: 2, start_date: '2026-06-20', end_date: '2026-06-27', gptUps: [0, 0, 0] })];
    expect(pickDefaultEvent(events, AFTER)?.id).toBe(1);
  });

  it('候補が無ければ null', () => {
    expect(pickDefaultEvent([], DURING)).toBeNull();
    expect(pickDefaultEvent([ev({ gptUps: [0, 0, 0] })], DURING)).toBeNull();
  });
});

describe('defaultBonusPcts', () => {
  it('選ばれたイベントの達成可能段階を返す', () => {
    expect(defaultBonusPcts([ev()], DURING)).toEqual(achievableBonusPcts([50, 20, 5]));
  });

  it('イベントが無ければフォールバックを返す', () => {
    expect(defaultBonusPcts([], DURING)).toEqual([...FALLBACK_BONUS_PCTS]);
  });
});
