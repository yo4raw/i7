import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FixedBroach } from '../../../src/lib/data/fetchFixedBroachsJson';
import { computeTeam, getCenterSkillRate } from '../../../src/lib/score/engine';
import { parseSkill } from '../../../src/lib/score/teamBuilder';
import type { RabbitNoteMap } from '../../../src/lib/data/rabbitNote';
import { findCardById, findSongById } from '../../fixtures';

/** MONSTER GENERATiON */
const song = findSongById(2);

/** 10th Anniversary 四葉環 (UR / Beat) */
const tenthTamaki = findCardById(2484);
/** UR / Shout (和泉一織) — center 倍率を Shout 方向に効かせる */
const urShout = findCardById(406);
/** UR / Melody (和泉三月) — center 倍率を Melody 方向に効かせる */
const urMelody = findCardById(408);
/** SR / Melody (百) — CENTER_SKILL_RATES 非掲載レアリティ */
const srCard = findCardById(1622);
/** type9 ブローチ (MEMORiES MELODiES, score 1000) を持つ UR/Beat カード IDOLiSH7 */
const type9Card = findCardById(959);

const empty: (Card | null)[] = [null, null, null, null, null, null];

describe('getCenterSkillRate のフォールバック分岐', () => {
  it('CENTER_SKILL_RATES に無いレアリティ (SR) は DEFAULT_CENTER_SKILL_RATE(6) を返す', () => {
    expect(getCenterSkillRate('SR')).toBe(6);
  });
});

describe('parseSkill: 使用可能なスキルレベルが一つも無い場合 null を返す (line 31)', () => {
  it('全レベル count=0 の判定ガード(MISS→Perfect) カードは skill=null', () => {
    // ID180 (cardID 368): ap_skill_type=判定ガード(MISS→Perfect) かつ全レベル count=0
    const guardCard = findCardById(368);
    expect(guardCard.ap_skill_type).toBe('判定ガード(MISS→Perfect)');
    expect(parseSkill(guardCard, 0)).toBeNull();
  });
});

describe('parseSkill: 縮小スキルで rate(縮小倍率) が無いレベルは使用不可 (L64 isShrink && !rate)', () => {
  it('全レベル rate=0 の判定縮小カードは usable level 無しで skill=null', () => {
    // count/per/value はそろっているが rate が 0 → 縮小として使用不可
    const shrinkNoRate = {
      ID: 0, cardID: 0, cardname: '', name: '', rarity: 'UR', attribute: 'Shout',
      shout_max: 1000, beat_max: 0, melody_max: 0,
      ap_skill_type: '判定縮小（Perfect）',
      ap_skill_1_count: 20, ap_skill_1_per: 40, ap_skill_1_value: 4, ap_skill_1_rate: 0,
      ap_skill_2_count: 20, ap_skill_2_per: 40, ap_skill_2_value: 4, ap_skill_2_rate: 0,
      ap_skill_3_count: 20, ap_skill_3_per: 40, ap_skill_3_value: 4, ap_skill_3_rate: 0,
      ap_skill_4_count: 20, ap_skill_4_per: 40, ap_skill_4_value: 4, ap_skill_4_rate: 0,
      ap_skill_5_count: 20, ap_skill_5_per: 40, ap_skill_5_value: 4, ap_skill_5_rate: 0,
      sp_time: 0,
    } as unknown as Card;
    expect(parseSkill(shrinkNoRate, 0)).toBeNull();
  });

  it('rate が有効な判定縮小カードは shrink スキルとして採用される (L64 false 側)', () => {
    const memorialTamaki = findCardById(2268); // 記念日2024 環 / 縮小 rate=1.6
    const skill = parseSkill(memorialTamaki, 5);
    expect(skill).not.toBeNull();
    expect(skill!.isShrink).toBe(true);
    expect(skill!.rate).toBeGreaterThan(0);
  });
});

describe('computeTeam: 未特訓 (trained=false) 時の自属性 sp_time×sp_value 減算分岐 (line 135/137, spec v1.0.7 §6-3 AM20-21)', () => {
  it('Shout 属性 UR を未特訓にすると Shout のみ sp_time×sp_value(1500) 減算される', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, null];
    const trained = [false, false, false, false, false, false];
    const team = computeTeam(deck, [], song, undefined, trained);
    // urShout (cardID 406): sp_time=6 × sp_value=250 = 1500
    expect(urShout.sp_time! * urShout.sp_value!).toBe(1500);
    expect(team.rawShout).toBe((urShout.shout_max ?? 0) - 1500);
    // 他属性は減算なし
    expect(team.rawBeat).toBe(urShout.beat_max);
    expect(team.rawMelody).toBe(urShout.melody_max);
  });

  it('Melody 属性 UR を未特訓にすると Melody のみ sp_time×sp_value(1500) 減算される', () => {
    const deck: (Card | null)[] = [urMelody, null, null, null, null, null];
    const trained = [false, false, false, false, false, false];
    const team = computeTeam(deck, [], song, undefined, trained);
    // urMelody (cardID 408): sp_time=6 × sp_value=250 = 1500
    expect(urMelody.sp_time! * urMelody.sp_value!).toBe(1500);
    expect(team.rawMelody).toBe((urMelody.melody_max ?? 0) - 1500);
    expect(team.rawShout).toBe(urMelody.shout_max);
    expect(team.rawBeat).toBe(urMelody.beat_max);
  });
});

describe('computeTeam: ラビットノート加算 (line 140 / rn truthy 分岐)', () => {
  it('カード名に一致するラビットノートが各属性へ加算される (イベント倍率前)', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, null];
    const notes: RabbitNoteMap = {
      [urShout.name ?? '']: { shout: 100, beat: 200, melody: 300 },
    };
    const team = computeTeam(
      deck, [], song,
      undefined, undefined, undefined, undefined, undefined,
      notes,
    );
    expect(team.rawShout).toBe((urShout.shout_max ?? 0) + 100);
    expect(team.rawBeat).toBe((urShout.beat_max ?? 0) + 200);
    expect(team.rawMelody).toBe((urShout.melody_max ?? 0) + 300);
  });
});

describe('computeTeam: 種類9(スコアUP)ブローチはステータス加算せずスキップ (line 154)', () => {
  it('type9 ブローチは broachShout/Beat/Melody に影響せず broachScoreBonus にのみ反映される', () => {
    const deck: (Card | null)[] = [type9Card, null, null, null, null, null];
    const broachs = [findBroach9()];
    const team = computeTeam(deck, broachs, song);
    expect(team.broachShout).toBe(0);
    expect(team.broachBeat).toBe(0);
    expect(team.broachMelody).toBe(0);
    expect(team.broachScoreBonus).toBe(1000);
  });

  it('曲名が一致しない場合 type9 ブローチは発動しない (broachScoreBonus=0)', () => {
    const deck: (Card | null)[] = [type9Card, null, null, null, null, null];
    const otherSong = findSongById(60); // Binary Vampire
    const team = computeTeam(deck, [findBroach9()], otherSong);
    expect(team.broachScoreBonus).toBe(0);
  });
});

describe('computeTeam: 共有ブローチ選択の各分岐 (line 161-176)', () => {
  it('無条件共有ブローチ (ALL750) が装着カードへ加算される', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, null];
    const sel: number[][] = [[1], [], [], [], [], []]; // id=1 ALL750
    const team = computeTeam(deck, [], song, undefined, undefined, undefined, sel);
    expect(team.broachShout).toBe(750);
    expect(team.broachBeat).toBe(750);
    expect(team.broachMelody).toBe(750);
  });

  it('条件付き共有ブローチ (S属性枚数分Shout+300, id=24) はデッキ内 Shout 枚数倍で加算される', () => {
    // Shout カード 2 枚 (slot0, slot1) → 倍率 2
    const deck: (Card | null)[] = [urShout, urShout, null, null, null, null];
    const sel: number[][] = [[24], [], [], [], [], []];
    const team = computeTeam(deck, [], song, undefined, undefined, undefined, sel);
    expect(team.broachShout).toBe(300 * 2);
    expect(team.broachBeat).toBe(0);
    expect(team.broachMelody).toBe(0);
  });

  it('falsy な共有ブローチ ID (0) は無視される (line 163 continue)', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, null];
    const sel: number[][] = [[0], [], [], [], [], []];
    const team = computeTeam(deck, [], song, undefined, undefined, undefined, sel);
    expect(team.broachShout).toBe(0);
    expect(team.broachBeat).toBe(0);
    expect(team.broachMelody).toBe(0);
  });

  it('存在しない共有ブローチ ID (9999) は無視される (line 165 continue)', () => {
    const deck: (Card | null)[] = [urShout, null, null, null, null, null];
    const sel: number[][] = [[9999], [], [], [], [], []];
    const team = computeTeam(deck, [], song, undefined, undefined, undefined, sel);
    expect(team.broachShout).toBe(0);
  });
});

describe('computeTeam: song.duration が falsy のとき 0 を返す (line 229)', () => {
  it('duration を 0 にした楽曲では songDuration=0', () => {
    const noDurationSong = { ...song, duration: 0 };
    const team = computeTeam([urShout, null, null, null, null, null], [], noDurationSong);
    expect(team.songDuration).toBe(0);
  });
});

describe('computeTeam: falsy なカードフィールドのフォールバック (L131-134 / L140 / L185-189)', () => {
  // ID/cardID/name/cardname/rarity/*_max がすべて falsy な合成カード
  const blankCard = {
    ID: 0, cardID: 0, cardname: '', name: '', rarity: null,
    attribute: 'Shout',
    shout_max: 0, beat_max: 0, melody_max: 0,
    ap_skill_type: null, sp_time: 0,
  } as unknown as Card;

  it('全フィールド falsy のカードでも例外なく 0/空文字へフォールバックする', () => {
    const team = computeTeam([blankCard, null, null, null, null, null], [], song);
    expect(team.rawShout).toBe(0);
    expect(team.rawBeat).toBe(0);
    expect(team.rawMelody).toBe(0);
    expect(team.cards).toHaveLength(1);
    const dc = team.cards[0];
    expect(dc.cardId).toBe(0);
    expect(dc.cardID).toBe(0);
    expect(dc.cardname).toBe('');
    expect(dc.name).toBe('');
    expect(dc.rarity).toBe('');
  });

  it('sp_time/sp_value が未設定 (falsy) かつ未特訓でも自属性の減算は 0 ((sp_time||0)*(sp_value||0))', () => {
    const trained = [false, false, false, false, false, false];
    const team = computeTeam([blankCard, null, null, null, null, null], [], song, undefined, trained);
    expect(team.rawShout).toBe(0); // shoutMax 0 - 0 = 0
  });

  it('card.name が空文字でもラビットノート参照は安全 (L140 || \'\')', () => {
    const notes: RabbitNoteMap = { '': { shout: 50, beat: 0, melody: 0 } };
    const team = computeTeam(
      [blankCard, null, null, null, null, null], [], song,
      undefined, undefined, undefined, undefined, undefined, notes,
    );
    // name='' をキーにしたエントリが拾われる
    expect(team.rawShout).toBe(50);
  });
});

describe('computeTeam: 条件付き共有ブローチの対象属性枚数が 0 のとき加算 0 (L168 || 0)', () => {
  it('S属性枚数分Shout+300 を Beat 単独デッキに付けると Shout 枚数 0 で加算 0', () => {
    // tenthTamaki は Beat。Shout カードは 0 枚 → attrCounts.Shout=0
    const deck: (Card | null)[] = [tenthTamaki, null, null, null, null, null];
    const sel: number[][] = [[24], [], [], [], [], []]; // id24 targetAttribute=Shout
    const team = computeTeam(deck, [], song, undefined, undefined, undefined, sel);
    expect(team.broachShout).toBe(0);
  });
});

describe('isUsableSkillLevel 経由: shrink でない通常スキルは全レベル走査でも採用される (L64 両アーム)', () => {
  it('スコアアップ（コンボ）カードは Lv5 が有効ならそのまま採用 (L64 false 側)', () => {
    const comboCard = findCardById(410); // 屋外フェス2 壮五 / スコアアップコンボ Lv5 有効
    const team = computeTeam([comboCard, null, null, null, null, null], [], song);
    expect(team.cards[0].skill).not.toBeNull();
    expect(team.cards[0].skill!.skillType).toBe('scoreUp');
  });
});

describe('computeTeam: 空デッキは加算ループを通らない (空スロット continue 分岐)', () => {
  it('全 null デッキは全属性 0', () => {
    const team = computeTeam(empty, [], song);
    expect(team.Shout).toBe(0);
    expect(team.Beat).toBe(0);
    expect(team.Melody).toBe(0);
    expect(team.cards).toHaveLength(0);
  });
});

/** type9 ブローチ (id=646 相当, MEMORiES MELODiES / score 1000) をフィクスチャから手で組む */
function findBroach9(): FixedBroach {
  return {
    id: 646,
    card_id: type9Card.cardID,
    card_name: type9Card.cardname,
    name: 'type9-test',
    name_other: null,
    shout: null, beat: null, melody: null,
    attribute: null, idol: null, group: null,
    auto: null,
    song: 'MONSTER GENERATiON',
    score: 1000,
    limit: null,
    broach_type: 9,
    condition: null,
  };
}
