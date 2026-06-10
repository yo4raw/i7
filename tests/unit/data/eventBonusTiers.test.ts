import { describe, it, expect } from 'vitest';
import { isEventLive, buildLiveTierMap, type EventForBonus } from '../../../src/lib/data/eventBonusTiers';

const T = (iso: string) => Date.parse(iso);

describe('isEventLive (開催判定の境界値)', () => {
  // 開催期間: 2026-06-01 00:00 JST 〜 2026-06-08 17:00 JST
  const start = '2026-06-01';
  const end = '2026-06-08';

  it('開始時刻ちょうど (00:00:00 JST) は開催中', () => {
    expect(isEventLive(start, end, T('2026-06-01T00:00:00+09:00'))).toBe(true);
  });

  it('開始 1ms 前は開催前', () => {
    expect(isEventLive(start, end, T('2026-06-01T00:00:00+09:00') - 1)).toBe(false);
  });

  it('終了時刻ちょうど (17:00:00 JST) は終了扱い (排他的境界)', () => {
    expect(isEventLive(start, end, T('2026-06-08T17:00:00+09:00'))).toBe(false);
  });

  it('終了 1ms 前は開催中', () => {
    expect(isEventLive(start, end, T('2026-06-08T17:00:00+09:00') - 1)).toBe(true);
  });
});

describe('buildLiveTierMap (開催中イベントの特効ティアマップ)', () => {
  const liveEvent: EventForBonus = {
    id: 1,
    start_date: '2026-06-01',
    end_date: '2026-06-08',
    gold: [100],
    silver: [200],
    bronze: [300],
  };
  const endedEvent: EventForBonus = {
    id: 2,
    start_date: '2026-05-01',
    end_date: '2026-05-08',
    gold: [400],
    silver: [],
    bronze: [],
  };
  const now = T('2026-06-05T12:00:00+09:00');

  it('開催中イベントの gold/silver/bronze がマップされる', () => {
    const map = buildLiveTierMap([liveEvent], now);
    expect(map.get(100)).toBe('gold');
    expect(map.get(200)).toBe('silver');
    expect(map.get(300)).toBe('bronze');
    expect(map.get(999)).toBeUndefined();
  });

  it('開催期間外のイベントは無視される', () => {
    const map = buildLiveTierMap([endedEvent], now);
    expect(map.size).toBe(0);
  });

  it('同一カードが複数イベントに該当する場合は上位ティアが優先される', () => {
    const overlapping: EventForBonus = {
      id: 3,
      start_date: '2026-06-01',
      end_date: '2026-06-08',
      gold: [],
      silver: [100],
      bronze: [200],
    };
    const map = buildLiveTierMap([overlapping, liveEvent], now);
    expect(map.get(100)).toBe('gold');   // silver < gold
    expect(map.get(200)).toBe('silver'); // bronze < silver
  });
});
