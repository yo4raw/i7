import { describe, it, expect } from 'vitest';
import { isEventLive, buildLiveTierMap, buildTierMapForEvent, parseBonusMembers, isBonusMember, type EventForBonus } from '../../../src/lib/data/eventBonusTiers';

const T = (iso: string) => Date.parse(iso);

describe('isEventLive (開催判定の境界値)', () => {
  // 開催期間: 2026-06-01 17:00 JST 〜 2026-06-08 17:00 JST
  const start = '2026-06-01';
  const end = '2026-06-08';

  it('開始時刻ちょうど (17:00:00 JST) は開催中', () => {
    expect(isEventLive(start, end, T('2026-06-01T17:00:00+09:00'))).toBe(true);
  });

  it('開始 1ms 前は開催前', () => {
    expect(isEventLive(start, end, T('2026-06-01T17:00:00+09:00') - 1)).toBe(false);
  });

  it('終了時刻ちょうど (17:00:00 JST) は終了扱い (排他的境界)', () => {
    expect(isEventLive(start, end, T('2026-06-08T17:00:00+09:00'))).toBe(false);
  });

  it('終了 1ms 前は開催中', () => {
    expect(isEventLive(start, end, T('2026-06-08T17:00:00+09:00') - 1)).toBe(true);
  });

  it('終了日が未入力 (0000-00-00) で開始済みなら開催中', () => {
    expect(isEventLive(start, '0000-00-00', T('2030-01-01T00:00:00+09:00'))).toBe(true);
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

  it('終了日が未入力の開始済みイベントも特効がマップされる', () => {
    const openEnded: EventForBonus = {
      id: 4,
      start_date: '2026-06-01',
      end_date: '0000-00-00',
      gold: [500],
      silver: [],
      bronze: [],
    };
    const map = buildLiveTierMap([openEnded], now);
    expect(map.get(500)).toBe('gold');
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

describe('buildTierMapForEvent (単一イベントの特効ティアマップ)', () => {
  it('金/銀/銅をそれぞれのティアに割り当てる', () => {
    const map = buildTierMapForEvent({ gold: [1], silver: [2], bronze: [3] });
    expect(map.get(1)).toBe('gold');
    expect(map.get(2)).toBe('silver');
    expect(map.get(3)).toBe('bronze');
    expect(map.get(99)).toBeUndefined();
  });

  it('同一カードが複数ティアにある場合は上位（金>銀>銅）を採用する', () => {
    const map = buildTierMapForEvent({ gold: [5], silver: [5], bronze: [5] });
    expect(map.get(5)).toBe('gold');
  });

  it('開催期間に関係なくマップを生成する（live 判定をしない）', () => {
    const map = buildTierMapForEvent({ gold: [7], silver: [], bronze: [] });
    expect(map.get(7)).toBe('gold');
  });
});

describe('bronzeMembers (special3_member によるメンバー衣装の銅特効)', () => {
  const cards = [
    { ID: 1, name: '八乙女楽', groupname: 'TRIGGER' },
    { ID: 2, name: '九条天', groupname: 'TRIGGER' },
    { ID: 3, name: 'TRIGGER', groupname: null },   // グループ衣装
    { ID: 4, name: '七瀬陸', groupname: 'IDOLiSH7' },
    { ID: null, name: '十龍之介', groupname: 'TRIGGER' },
  ];

  it('parseBonusMembers は 、 と , で区切りトリムする', () => {
    expect(parseBonusMembers('TRIGGER')).toEqual(['TRIGGER']);
    expect(parseBonusMembers('四葉環、九条天')).toEqual(['四葉環', '九条天']);
    expect(parseBonusMembers(' 百 , 千 ')).toEqual(['百', '千']);
    expect(parseBonusMembers('')).toEqual([]);
    expect(parseBonusMembers(null)).toEqual([]);
  });

  it('isBonusMember はグループ名・キャラ名のどちらでも一致する', () => {
    expect(isBonusMember(cards[0], ['TRIGGER'])).toBe(true);
    expect(isBonusMember(cards[2], ['TRIGGER'])).toBe(true);
    expect(isBonusMember(cards[1], ['九条天'])).toBe(true);
    expect(isBonusMember(cards[3], ['TRIGGER'])).toBe(false);
  });

  it('グループ記念日: メンバー衣装は金銀でなければ銅になる', () => {
    const map = buildTierMapForEvent({ gold: [1], silver: [], bronze: [], bronzeMembers: ['TRIGGER'] }, new Map(), cards);
    expect(map.get(1)).toBe('gold');
    expect(map.get(2)).toBe('bronze');
    expect(map.get(3)).toBe('bronze');
    expect(map.get(4)).toBeUndefined();
    expect(map.size).toBe(3);
  });

  it('bronzeMembers が空・未指定なら衣装リストを渡しても何も足さない', () => {
    expect(buildTierMapForEvent({ gold: [], silver: [], bronze: [], bronzeMembers: [] }, new Map(), cards).size).toBe(0);
    expect(buildTierMapForEvent({ gold: [], silver: [], bronze: [] }, new Map(), cards).size).toBe(0);
  });

  it('buildLiveTierMap も開催中イベントのメンバー衣装を銅にする', () => {
    const now = T('2026-09-19T12:00:00+09:00');
    const ev: EventForBonus = { id: 241, start_date: '2026-09-18', end_date: '2026-09-25', gold: [], silver: [2], bronze: [], bronzeMembers: ['TRIGGER'] };
    const map = buildLiveTierMap([ev], now, cards);
    expect(map.get(1)).toBe('bronze');
    expect(map.get(2)).toBe('silver');
  });
});
