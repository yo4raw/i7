import { describe, it, expect } from 'vitest';
import {
  classifyEventStatus,
  eventStartMs,
  eventEndMs,
  formatEventEnd,
  formatEventPeriod,
  formatDuration,
} from '../../../src/lib/data/eventPeriod';

const T = (iso: string) => Date.parse(iso);

describe('eventStartMs / eventEndMs', () => {
  it('日付を 17:00 JST として解釈する', () => {
    expect(eventStartMs('2026-06-01')).toBe(T('2026-06-01T17:00:00+09:00'));
    expect(eventEndMs('2026-06-08')).toBe(T('2026-06-08T17:00:00+09:00'));
  });

  it('前後の空白を許容する', () => {
    expect(eventStartMs(' 2026-06-01 ')).toBe(T('2026-06-01T17:00:00+09:00'));
  });

  it.each(['', '   ', '0000-00-00', 'not-a-date'])('未入力・不正な日付 (%s) は null', (d) => {
    expect(eventEndMs(d)).toBeNull();
    expect(eventStartMs(d)).toBeNull();
  });
});

describe('classifyEventStatus', () => {
  const start = '2026-06-01';
  const end = '2026-06-08';

  it('開始前は upcoming', () => {
    expect(classifyEventStatus(start, end, T('2026-06-01T17:00:00+09:00') - 1)).toBe('upcoming');
  });

  it('開始時刻ちょうど (17:00 JST) は live', () => {
    expect(classifyEventStatus(start, end, T('2026-06-01T17:00:00+09:00'))).toBe('live');
  });

  it('開始日の 17:00 より前（当日 0:00）はまだ upcoming', () => {
    expect(classifyEventStatus(start, end, T('2026-06-01T00:00:00+09:00'))).toBe('upcoming');
  });

  it('期間中は live', () => {
    expect(classifyEventStatus(start, end, T('2026-06-05T12:00:00+09:00'))).toBe('live');
  });

  it('終了時刻ちょうど (17:00 JST) は past（排他的境界）', () => {
    expect(classifyEventStatus(start, end, T('2026-06-08T17:00:00+09:00'))).toBe('past');
  });

  it('終了 1ms 前は live', () => {
    expect(classifyEventStatus(start, end, T('2026-06-08T17:00:00+09:00') - 1)).toBe('live');
  });

  it('終了日が未入力で開始済みなら live（終了未定の開催中）', () => {
    expect(classifyEventStatus(start, '0000-00-00', T('2030-01-01T00:00:00+09:00'))).toBe('live');
    expect(classifyEventStatus(start, '', T('2026-06-05T12:00:00+09:00'))).toBe('live');
  });

  it('終了日が未入力でも開始前なら upcoming', () => {
    expect(classifyEventStatus(start, '0000-00-00', T('2026-05-01T00:00:00+09:00'))).toBe('upcoming');
  });

  it('開始日がパース不可なら past（判定不能）', () => {
    expect(classifyEventStatus('0000-00-00', end, T('2026-06-05T12:00:00+09:00'))).toBe('past');
    expect(classifyEventStatus('', '', T('2026-06-05T12:00:00+09:00'))).toBe('past');
  });
});

describe('表示フォーマット', () => {
  it('終了日時は「日付 17:00」、未入力なら「未定」', () => {
    expect(formatEventEnd('2026-06-08')).toBe('2026-06-08 17:00');
    expect(formatEventEnd('0000-00-00')).toBe('未定');
    expect(formatEventEnd('')).toBe('未定');
  });

  it('期間表示は開始〜終了 (JST)', () => {
    expect(formatEventPeriod('2026-06-01', '2026-06-08')).toBe('2026-06-01 17:00 〜 2026-06-08 17:00 (JST)');
    expect(formatEventPeriod('2026-07-07', '0000-00-00')).toBe('2026-07-07 17:00 〜 未定 (JST)');
  });
});

describe('formatDuration', () => {
  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('0 以下は空文字', () => {
    expect(formatDuration(0, 'second')).toBe('');
    expect(formatDuration(-1, 'minute')).toBe('');
  });

  it("unit 'second' は残りの大きさで単位を落とす", () => {
    expect(formatDuration(3 * DAY + 2 * HOUR + 4 * MIN + 5 * SEC, 'second')).toBe('3日 2時間 4分 5秒');
    expect(formatDuration(2 * HOUR + 4 * MIN + 5 * SEC, 'second')).toBe('2時間 4分 5秒');
    expect(formatDuration(4 * MIN + 5 * SEC, 'second')).toBe('4分 5秒');
    expect(formatDuration(5 * SEC, 'second')).toBe('5秒');
  });

  it("unit 'minute' は秒を切り捨てて 3 形態を取る", () => {
    expect(formatDuration(3 * DAY + 2 * HOUR + 4 * MIN + 59 * SEC, 'minute')).toBe('3日 2時間');
    expect(formatDuration(2 * HOUR + 4 * MIN + 59 * SEC, 'minute')).toBe('2時間 4分');
    expect(formatDuration(4 * MIN + 59 * SEC, 'minute')).toBe('4分');
  });

  it('接頭辞は付けない（呼び出し側の責務）', () => {
    expect(formatDuration(5 * SEC, 'second')).not.toContain('残り');
    expect(formatDuration(5 * MIN, 'minute')).not.toContain('残り');
  });
});
