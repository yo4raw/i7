import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FixedBroach } from '../../../src/lib/data/fetchFixedBroachsJson';
import { resolveDeckBroachs, calcBroachScoreBonus } from '../../../src/lib/score/broachResolver';
import { findCardById, findSongById } from '../../fixtures';

const song = findSongById(2); // MONSTER GENERATiON

/** UR / Beat (IDOLiSH7) */
const urCard = findCardById(959);

/** 任意の broach_type / フィールドを差し込んだテスト用ブローチ生成 */
function makeBroach(partial: Partial<FixedBroach>): FixedBroach {
  return {
    id: 1,
    card_id: urCard.cardID,
    card_name: urCard.cardname,
    name: 'test',
    name_other: null,
    shout: null, beat: null, melody: null,
    attribute: null, idol: null, group: null,
    auto: null, song: null, score: null,
    limit: null, broach_type: null, condition: null,
    ...partial,
  };
}

const deck: (Card | null)[] = [urCard, null, null, null, null, null];

describe('resolveDeckBroachs: switch default (未知の broach_type) は無効 (line 94-95)', () => {
  it('broach_type=99 は active=false', () => {
    const resolved = resolveDeckBroachs(deck, [makeBroach({ broach_type: 99 })], song);
    const slot0 = resolved.get(0) ?? [];
    expect(slot0).toHaveLength(1);
    expect(slot0[0].active).toBe(false);
  });
});

describe('resolveDeckBroachs: 種類5(IDOL_ATTR_COUNT) idol/attribute 欠落で無効 (line 76)', () => {
  it('idol が null の type5 は active=false', () => {
    const b = makeBroach({ broach_type: 5, idol: null, attribute: 'Beat' });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect((resolved.get(0) ?? [])[0].active).toBe(false);
  });

  it('attribute が null の type5 は active=false', () => {
    const b = makeBroach({ broach_type: 5, idol: 'IDOLiSH7', attribute: null });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect((resolved.get(0) ?? [])[0].active).toBe(false);
  });
});

describe('resolveDeckBroachs: 種類5 のデッキ依存倍率 (multiplier = 同アイドル同属性枚数)', () => {
  it('同名(IDOLiSH7)・同属性(Beat) のカードが 1 枚 → multiplier=1 で active', () => {
    // urCard.name は 'IDOLiSH7'、属性 Beat
    const b = makeBroach({ broach_type: 5, idol: urCard.name, attribute: 'Beat', limit: 1 });
    const resolved = resolveDeckBroachs(deck, [b], song);
    const rb = (resolved.get(0) ?? [])[0];
    expect(rb.active).toBe(true);
    expect(rb.multiplier).toBe(1);
  });
});

describe('resolveDeckBroachs: limit が null のとき Infinity 扱い (line 163 ?? Infinity)', () => {
  it('type6 (ATTRIBUTE_UP_LIMITED) で limit=null のブローチは無制限に有効', () => {
    const b = makeBroach({ broach_type: 6, beat: 500, limit: null });
    const resolved = resolveDeckBroachs(deck, [b], song);
    const rb = (resolved.get(0) ?? [])[0];
    expect(rb.active).toBe(true);
  });
});

describe('resolveDeckBroachs: 種類6 のデッキ内上限処理 (limit は同一カードID単位、B9)', () => {
  it('limit=1 の type6 ブローチを持つ同一カードが2枚デッキにあると2枚目は active=false', () => {
    // 同じカード (urCard) を2枚編成した場合は同一カードIDなので limit=1 の上限が効く
    const twoCopyDeck: (Card | null)[] = [urCard, urCard, null, null, null, null];
    const b1 = makeBroach({ id: 101, card_id: urCard.cardID, broach_type: 6, beat: 500, limit: 1 });
    const resolved = resolveDeckBroachs(twoCopyDeck, [b1], song);
    const actives = [...resolved.values()].flat().filter(rb => rb.active);
    expect(actives).toHaveLength(1);
  });

  it('limit=1 の type6 ブローチを持つ「別カード」2枚は競合せず両方 active になる (spec §6-3 AM36, B9)', () => {
    const urCard2 = findCardById(960); // 別の UR
    const twoCardDeck: (Card | null)[] = [urCard, urCard2, null, null, null, null];
    const b1 = makeBroach({ id: 101, card_id: urCard.cardID, broach_type: 6, beat: 500, limit: 1 });
    const b2 = makeBroach({ id: 102, card_id: urCard2.cardID, broach_type: 6, beat: 500, limit: 1 });
    const resolved = resolveDeckBroachs(twoCardDeck, [b1, b2], song);
    const actives = [...resolved.values()].flat().filter(rb => rb.active);
    expect(actives).toHaveLength(2);
  });
});

describe('checkBroachCondition の各種ケース', () => {
  it('種類7(ALL_ATTRIBUTES): 3 属性そろわないデッキでは無効', () => {
    // urCard は Beat 単独 → 全属性そろわず
    const b = makeBroach({ broach_type: 7, beat: 500, limit: 2 });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect((resolved.get(0) ?? [])[0].active).toBe(false);
  });

  it('種類8(AUTO_ONLY): 常に無効', () => {
    const b = makeBroach({ broach_type: 8, beat: 500 });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect((resolved.get(0) ?? [])[0].active).toBe(false);
  });

  it('種類4(GROUP): group が null のとき無効', () => {
    const b = makeBroach({ broach_type: 4, group: null, beat: 500 });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect((resolved.get(0) ?? [])[0].active).toBe(false);
  });
});

describe('calcBroachScoreBonus: score が falsy の type9 は 0 加算 (line 208 || 0)', () => {
  it('score=null の type9 は 0', () => {
    const b = makeBroach({ broach_type: 9, song: 'MONSTER GENERATiON', score: null });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect(calcBroachScoreBonus(resolved)).toBe(0);
  });

  it('score=1000 の type9 (曲一致) は 1000', () => {
    const b = makeBroach({ broach_type: 9, song: 'MONSTER GENERATiON', score: 1000 });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect(calcBroachScoreBonus(resolved)).toBe(1000);
  });
});

describe('resolveDeckBroachs: assumeAllAttributes オプション (衣装比較の種類7発動)', () => {
  it('未指定なら 3 属性不在の単一デッキで種類7は未発動', () => {
    const b = makeBroach({ broach_type: 7, shout: 600, beat: 600, melody: 600, limit: 2 });
    const resolved = resolveDeckBroachs(deck, [b], song);
    expect((resolved.get(0) ?? [])[0].active).toBe(false);
  });

  it('assumeAllAttributes:true なら 3 属性不在でも種類7が発動', () => {
    const b = makeBroach({ broach_type: 7, shout: 600, beat: 600, melody: 600, limit: 2 });
    const resolved = resolveDeckBroachs(deck, [b], song, undefined, { assumeAllAttributes: true });
    expect((resolved.get(0) ?? [])[0].active).toBe(true);
  });

  it('assumeAllAttributes:true でも種類4(グループ)など他種別の条件判定は変わらない', () => {
    const b = makeBroach({ broach_type: 4, group: 'NON_EXISTENT_GROUP', beat: 500 });
    const resolved = resolveDeckBroachs(deck, [b], song, undefined, { assumeAllAttributes: true });
    expect((resolved.get(0) ?? [])[0].active).toBe(false);
  });
});
