import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FixedBroach } from '../../../src/lib/data/fetchFixedBroachsJson';
import type { Song } from '../../../src/lib/data/fetchSongsJson';
import {
  buildCardStrengthEntry,
  calcBaseScore,
  classifyCard,
  compareShrink,
  formatScore,
  shrinkTieKey,
} from '../../../src/lib/score/cardStrength';
import { calcExpectedScore, computeTeam, flattenNotes } from '../../../src/lib/score/engine';
import { findCardById, findSongById } from '../../fixtures';

const EMPTY_GROUP = {
  shout_white: 0, shout_color: 0, beat_white: 0, beat_color: 0, melody_white: 0, melody_color: 0,
};

/** notes_20: shout_white 10 / melody_color 20、chorus_light_6: melody_white 5 の合成曲 */
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

describe('calcBaseScore (属性値由来スコア)', () => {
  it('グループ別カウント × 1ノーツ基底値の決定的合算と一致する', () => {
    // shout_white: floor(1000*0.025)=25, ×1.0 → 25 × 10 = 250
    // melody_color: floor(4000*0.03)=120, ×1.0 → 120 × 20 = 2400
    // chorus melody_white: floor(4000*0.025)=100, ×3.0 → 300 × 5 = 1500
    const appeal = { Shout: 1000, Beat: 1000, Melody: 4000 };
    expect(calcBaseScore(appeal, makeSong())).toBe(250 + 2400 + 1500);
  });

  it('既存エンジン (calcExpectedScore) の baseScore と一致する（フィクスチャ実データ・非センター配置）', () => {
    const card = findCardById(2484);
    const song = findSongById(2);
    // slot 1 (非センター) に1枚だけ配置 → センタースキルなしのチーム属性値 = カード素値
    const team = computeTeam([null, card, null, null, null, null], [], song);
    const notes = flattenNotes(song, 42);
    const engineBase = calcExpectedScore(team, notes, song.notes_count || 0).baseScore;
    const appeal = { Shout: card.shout_max || 0, Beat: card.beat_max || 0, Melody: card.melody_max || 0 };
    expect(calcBaseScore(appeal, song)).toBe(engineBase);
  });
});

describe('buildCardStrengthEntry (スコアアップ系)', () => {
  it('コンボ型: 発動機会はノーツ数、期待値 = floor(floor(493/25) × 0.4 × 5200)', () => {
    const entry = buildCardStrengthEntry(makeCard(), [], makeSong());
    expect(entry.maxActivations).toBe(19);
    expect(entry.skillExpected).toBe(Math.floor(19 * 0.4 * 5200)); // 39520
    expect(entry.totalScore).toBe(entry.baseScore + entry.skillExpected);
  });

  it('タイマー型: 発動機会は曲秒数', () => {
    const card = makeCard({
      ap_skill_type: 'スコアアップ（タイマー）',
      ap_skill_5_count: 15, ap_skill_5_per: 50, ap_skill_5_value: 4800,
    });
    const entry = buildCardStrengthEntry(card, [], makeSong());
    expect(entry.maxActivations).toBe(7); // floor(113/15)
    expect(entry.skillExpected).toBe(16800); // floor(7 × 0.5 × 4800)
  });

  it('判定補助系 (MISS→Good) はスキル期待値 0・属性値のみ', () => {
    const entry = buildCardStrengthEntry(makeCard({ ap_skill_type: 'MISS→Good' }), [], makeSong());
    expect(entry.skill).toBeNull();
    expect(entry.skillExpected).toBe(0);
    expect(entry.totalScore).toBe(entry.baseScore);
  });

  it('特効倍率は素ステータスに round 適用される', () => {
    const plain = buildCardStrengthEntry(makeCard({ ap_skill_type: null }), [], makeSong());
    const boosted = buildCardStrengthEntry(makeCard({ ap_skill_type: null }), [], makeSong(), 2.0);
    expect(boosted.appeal.Melody).toBe(8000);
    expect(boosted.appealTotal).toBe(plain.appealTotal * 2);
  });
});

describe('固有ブローチ', () => {
  it('種類1 (無条件属性アップ) は単独デッキで有効', () => {
    const broach = makeBroach({ melody: 4500 });
    const entry = buildCardStrengthEntry(makeCard(), [broach], makeSong());
    expect(entry.appeal.Melody).toBe(8500);
  });

  it('種類7 (3属性条件) は単独デッキでは発動しない', () => {
    const broach = makeBroach({ broach_type: 7, melody: 9000, limit: 2 });
    const entry = buildCardStrengthEntry(makeCard(), [broach], makeSong());
    expect(entry.appeal.Melody).toBe(4000);
  });

  it('複数ブローチからスコアが最大になる1個を選ぶ (Melody 偏重曲では melody ブローチ)', () => {
    const shoutBr = makeBroach({ id: 501, shout: 5000 });
    const melodyBr = makeBroach({ id: 502, melody: 4500 });
    const entry = buildCardStrengthEntry(makeCard(), [shoutBr, melodyBr], makeSong());
    expect(entry.appeal.Melody).toBe(8500);
    expect(entry.appeal.Shout).toBe(1000);
  });
});

describe('判定縮小系', () => {
  const shrinkCard = (over: Partial<Card> = {}) => makeCard({
    ap_skill_type: '判定縮小（コンボ）',
    ap_skill_5_count: 30, ap_skill_5_per: 40, ap_skill_5_value: 8, ap_skill_5_rate: 1.5,
    ...over,
  });

  it('classifyCard が shrink を判別する', () => {
    expect(classifyCard(shrinkCard())).toBe('shrink');
    expect(classifyCard(makeCard())).toBe('scoreUp');
    expect(classifyCard(makeCard({ ap_skill_type: null }))).toBe('scoreUp');
  });

  it('縮小はスキル期待値 0・最大発動回数のみ算出', () => {
    const entry = buildCardStrengthEntry(shrinkCard(), [], makeSong());
    expect(entry.skillExpected).toBe(0);
    expect(entry.maxActivations).toBe(16); // floor(493/30)
  });

  it('compareShrink: 秒数 → 最大発動回数 → 確率 → 属性値合計の辞書式', () => {
    const song = makeSong();
    const e9sec = buildCardStrengthEntry(shrinkCard({ ap_skill_5_value: 9 }), [], song);
    const e8sec = buildCardStrengthEntry(shrinkCard(), [], song);
    expect(compareShrink(e9sec, e8sec)).toBeLessThan(0); // 9秒が先

    const eCombo25 = buildCardStrengthEntry(shrinkCard({ ap_skill_5_count: 25 }), [], song);
    expect(compareShrink(eCombo25, e8sec)).toBeLessThan(0); // 同秒数 → 発動回数 19 > 16

    const ePer50 = buildCardStrengthEntry(shrinkCard({ ap_skill_5_per: 50 }), [], song);
    expect(compareShrink(ePer50, e8sec)).toBeLessThan(0); // 同秒数・同回数 → 確率 50 > 40

    const eHighAppeal = buildCardStrengthEntry(shrinkCard({ melody_max: 5000 }), [], song);
    expect(compareShrink(eHighAppeal, e8sec)).toBeLessThan(0); // 全同 → 属性値合計
  });

  it('shrinkTieKey: 秒数・発動回数・確率が同じなら同率', () => {
    const song = makeSong();
    const a = buildCardStrengthEntry(shrinkCard(), [], song);
    const b = buildCardStrengthEntry(shrinkCard({ melody_max: 5000 }), [], song);
    const c = buildCardStrengthEntry(shrinkCard({ ap_skill_5_per: 50 }), [], song);
    expect(shrinkTieKey(a)).toBe(shrinkTieKey(b)); // 属性値違いは同率
    expect(shrinkTieKey(a)).not.toBe(shrinkTieKey(c));
  });
});

describe('formatScore', () => {
  it('1万以上は万表記、未満はカンマ区切り', () => {
    expect(formatScore(152340)).toBe('15.2万');
    expect(formatScore(9999)).toBe('9,999');
  });
});
