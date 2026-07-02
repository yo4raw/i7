import { describe, it, expect } from 'vitest';
import { computeTeam } from '../../../src/lib/score/teamBuilder';
import { SHARED_BROACHS } from '../../../src/lib/data/sharedBroachs';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FixedBroach } from '../../../src/lib/data/fetchFixedBroachsJson';
import type { Song } from '../../../src/lib/data/fetchSongsJson';

const song = { song_name: 'test', duration: 100 } as unknown as Song;

function makeCard(over: Record<string, unknown>): Card {
  return {
    ID: 1, cardID: 101, cardname: 'テスト', name: 'アイドル', rarity: 'UR', attribute: 'Shout',
    shout_max: 1000, beat_max: 1000, melody_max: 1000, sp_time: 0,
    ...over,
  } as unknown as Card;
}

// 無条件 (targetAttribute なし) の共通ブローチを使う
const plain = SHARED_BROACHS.find(sb => !sb.targetAttribute)!;

describe('computeTeam の共有ブローチ容量ルール (ADR 0039)', () => {
  it('非 UR カードには共有ブローチが加算されない', () => {
    const deck = [makeCard({ rarity: 'SSR' }), null, null, null, null, null];
    const team = computeTeam(deck, [], song, undefined, undefined, undefined,
      [[plain.id, plain.id], [], [], [], [], []]);
    expect(team.broachShout + team.broachBeat + team.broachMelody).toBe(0);
  });

  it('固有ブローチなしの UR は 2 個まで加算される', () => {
    const deck = [makeCard({}), null, null, null, null, null];
    const team = computeTeam(deck, [], song, undefined, undefined, undefined,
      [[plain.id, plain.id, plain.id], [], [], [], [], []]);
    expect(team.broachShout).toBe(plain.shout * 2);
    expect(team.broachBeat).toBe(plain.beat * 2);
    expect(team.broachMelody).toBe(plain.melody * 2);
  });

  it('固有ブローチ持ちの UR は 1 個まで加算される', () => {
    const fixed = { id: 1, card_id: 101, broach_type: 1, shout: 0, beat: 0, melody: 0 } as unknown as FixedBroach;
    const deck = [makeCard({}), null, null, null, null, null];
    const team = computeTeam(deck, [fixed], song, undefined, undefined, undefined,
      [[plain.id, plain.id], [], [], [], [], []]);
    // 共有ブローチ分は 1 個分のみ (固有ブローチ自体の属性値は 0 に設定済み)
    expect(team.broachShout).toBe(plain.shout * 1);
  });
});
