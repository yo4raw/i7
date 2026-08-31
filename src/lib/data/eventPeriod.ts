/**
 * イベント期間の判定・表示を集約するモジュール。
 *
 * ゲーム内のイベント切替時刻に合わせ、開始・終了とも当該日の 17:00 (JST) を境界とする。
 * 終了日が未入力（空文字 / `0000-00-00` / パース不可）のイベントは「終了時刻が未定の開催中」として扱う。
 */

export type EventStatus = 'live' | 'upcoming' | 'past';

/** イベントの切替時刻（JST）。start_date / end_date ともこの時刻を境界にする。 */
const EVENT_BOUNDARY_TIME = 'T17:00:00+09:00';

/** 終了日が未定であることを示す表示ラベル */
export const EVENT_END_UNDETERMINED_LABEL = '未定';

function parseEventDate(date: string): number | null {
  const d = (date || '').trim();
  if (!d) return null;
  const ms = Date.parse(`${d}${EVENT_BOUNDARY_TIME}`);
  return Number.isNaN(ms) ? null : ms;
}

/** 開始日時 (ms)。未入力・パース不可なら null。 */
export function eventStartMs(start_date: string): number | null {
  return parseEventDate(start_date);
}

/** 終了日時 (ms)。終了日が未入力（`0000-00-00` 等）なら null = 終了未定。 */
export function eventEndMs(end_date: string): number | null {
  return parseEventDate(end_date);
}

/** 終了日が未入力かどうか（= 開始済みなら実施中として扱う）。 */
export function isOpenEndedEvent(end_date: string): boolean {
  return eventEndMs(end_date) === null;
}

/**
 * イベントの開催状態を判定する。
 * 開始日がパース不可な行は判定不能なため `past` に倒す（従来挙動を踏襲）。
 */
export function classifyEventStatus(
  start_date: string,
  end_date: string,
  now: number = Date.now(),
): EventStatus {
  const start = eventStartMs(start_date);
  if (start === null) return 'past';
  if (now < start) return 'upcoming';
  const end = eventEndMs(end_date);
  if (end === null) return 'live';
  return now >= end ? 'past' : 'live';
}

/** 終了日時の表示。未定なら「未定」。 */
export function formatEventEnd(end_date: string): string {
  return eventEndMs(end_date) === null
    ? EVENT_END_UNDETERMINED_LABEL
    : `${end_date.trim()} 17:00`;
}

/** 開始日時の表示。 */
export function formatEventStart(start_date: string): string {
  return `${(start_date || '').trim()} 17:00`;
}

/** 「2026-07-07 17:00 〜 未定 (JST)」形式の期間表示。 */
export function formatEventPeriod(start_date: string, end_date: string): string {
  return `${formatEventStart(start_date)} 〜 ${formatEventEnd(end_date)} (JST)`;
}
