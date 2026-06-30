import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FixedBroach } from '../../../src/lib/data/fetchFixedBroachsJson';
import type { Song } from '../../../src/lib/data/fetchSongsJson';
import {
  buildCardStrengthEntry,
  calcBaseScore,
  calcCardStrengthAppeal,
} from '../../../src/lib/score/cardStrength';

const EMPTY_GROUP = {
  shout_white: 0, shout_color: 0, beat_white: 0, beat_color: 0, melody_white: 0, melody_color: 0,
};

/** 全グループそろった基本曲 */
function makeSong(over: Partial<Song> = {}): Song {
  return {
    id: 999, song_name: 'テスト曲', difficulty: 'EXPERT', duration: 113, notes_count: 493,
    notes_20: { ...EMPTY_GROUP, shout_white: 10, melody_color: 20 },
    light_2: { ...EMPTY_GROUP }, light_3: { ...EMPTY_GROUP }, light_4: { ...EMPTY_GROUP },
    light_5: { ...EMPTY_GROUP }, light_6: { ...EMPTY_GROUP },
    chorus_light_5: { ...EMPTY_GROUP },
    chorus_light_6: { ...EMPTY_GROUP, melody_white: 5 },
    ...over,
  } as unknown as Song;
}

function makeCard(over: Partial<Card> = {}): Card {
  return {
    ID: 1, cardID: 9001, cardname: 'テスト衣装', name: '九条天', rarity: 'UR', attribute: 'Melody',
    shout_max: 1000, beat_max: 1000, melody_max: 4000,
    ap_skill_type: 'スコアアップ（コンボ）',
    ap_skill_5_count: 25, ap_skill_5_per: 40, ap_skill_5_value: 5200, ap_skill_5_rate: 0,
    sp_time: 0,
    ...over,
  } as unknown as Card;
}

function makeBroach(over: Partial<FixedBroach> = {}): FixedBroach {
  return {
    id: 501, card_id: 9001, broach_type: 1,
    shout: 0, beat: 0, melody: 0, score: 0,
    group: null, idol: null, attribute: null, song: null, limit: null,
    ...over,
  } as unknown as FixedBroach;
}

describe('calcBaseScore: グループキーが欠落した曲はスキップする (line 76 !group continue)', () => {
  it('一部グループ (light_3 等) が undefined の曲でも例外なく計算できる', () => {
    // notes_20 と chorus_light_6 のみ存在、その他グループは未定義
    const sparse = {
      id: 1, song_name: 'sparse', duration: 100, notes_count: 100,
      notes_20: { ...EMPTY_GROUP, shout_white: 4 },
      chorus_light_6: { ...EMPTY_GROUP, melody_white: 2 },
    } as unknown as Song;
    const appeal = { Shout: 1000, Beat: 1000, Melody: 4000 };
    // shout_white: floor(1000*0.025)=25 ×1.0 ×4 = 100
    // melody_white: floor(4000*0.025)=100 ×3.0 ×2 = 600
    expect(calcBaseScore(appeal, sparse)).toBe(100 + 600);
  });
});

describe('calcCardStrengthAppeal: id が null のブローチはスキップ (line 115 br.id == null continue)', () => {
  it('id=null ブローチは無視され素ステータスのまま', () => {
    const broach = makeBroach({ id: null, melody: 9999 });
    const { appeal } = calcCardStrengthAppeal(makeCard(), [broach], makeSong());
    expect(appeal.Melody).toBe(4000);
  });
});

describe('calcCardStrengthAppeal: 非 UR カード + ブローチで resolved.get(0) が空 (line 119 ?? [])', () => {
  it('SR カードのブローチは resolveDeckBroachs で UR 限定のため発動せず素ステータスのまま', () => {
    const sr = makeCard({ rarity: 'SR' });
    const broach = makeBroach({ melody: 5000 });
    const { appeal, broachScoreBonus } = calcCardStrengthAppeal(sr, [broach], makeSong());
    expect(appeal.Melody).toBe(4000);
    expect(broachScoreBonus).toBe(0);
  });
});

describe('calcCardStrengthAppeal: 非アクティブ / 種類9 ブローチは属性加算しない (line 121)', () => {
  it('発動条件を満たさない種類8 (オート専用) ブローチは属性に加算されない (rb.active=false)', () => {
    // 種類8 は常に無効 (スコープ外) なので加算されない。
    // 種類7 は ADR 0035 でベストケース前提として常時発動扱いに変わったため非アクティブ検証には使えない
    const broach = makeBroach({ broach_type: 8, melody: 9000 });
    const { appeal } = calcCardStrengthAppeal(makeCard(), [broach], makeSong());
    expect(appeal.Melody).toBe(4000);
  });

  it('種類9 (スコアUP) ブローチは属性に加算せず broachScoreBonus にのみ反映 (rb.broach_type===9)', () => {
    const broach = makeBroach({ broach_type: 9, song: 'テスト曲', score: 1500, melody: 0 });
    const { appeal, broachScoreBonus } = calcCardStrengthAppeal(makeCard(), [broach], makeSong());
    expect(appeal.Melody).toBe(4000);
    expect(broachScoreBonus).toBe(1500);
  });
});

describe('buildCardStrengthEntry: 分母が 0 のときスキル値は算出されない (line 153 ?? 0)', () => {
  it('コンボ型でも notes_count=0 なら maxActivations=0', () => {
    const entry = buildCardStrengthEntry(makeCard(), [], makeSong({ notes_count: 0 }));
    expect(entry.maxActivations).toBe(0);
    expect(entry.skillExpected).toBe(0);
    expect(entry.skillMax).toBe(0);
  });

  it('タイマー型でも duration=0 なら maxActivations=0', () => {
    const timer = makeCard({
      ap_skill_type: 'スコアアップ（タイマー）',
      ap_skill_5_count: 15, ap_skill_5_per: 50, ap_skill_5_value: 4800,
    });
    const entry = buildCardStrengthEntry(timer, [], makeSong({ duration: 0 }));
    expect(entry.maxActivations).toBe(0);
    expect(entry.skillExpected).toBe(0);
  });
});
