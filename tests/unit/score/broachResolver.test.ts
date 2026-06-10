import { describe, it, expect } from 'vitest';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import { resolveDeckBroachs, calcBroachScoreBonus, type ResolvedBroach } from '../../../src/lib/score/broachResolver';
import { normalizeAttribute } from '../../../src/lib/score/types';
import { allCards, allBroachs, findBroachsByCardId, findCardById, findSongById } from '../../fixtures';

/** 10th Anniversary 四葉環 (UR/Beat/IDOLiSH7、グループ指定ブローチ GROUP=IDOLiSH7) */
const tamaki = findCardById(2484);
/** 音に想いをのせて 和泉一織 (UR/Melody、アイドル属性指定カウント idol=和泉一織 attr=Melody limit=1) */
const ichiOto = findCardById(976);
/** 5th Anniversary 二階堂大和 (UR/Melody、全属性編成ブローチ limit=2) */
const yamato5th = findCardById(1348);
/** 5th Anniversary 和泉一織 (UR/Beat、属性UP上限ありブローチ) */
const ichi5th = findCardById(1347);
/** 5th Anniversary 和泉三月 (UR/Beat、オート専用ブローチ) */
const mitsuki5th = findCardById(1349);
/** 謹賀新年 IDOLiSH7 (UR、スコアUPブローチ song=MEMORiES MELODiES score=1000) */
const kinga = findCardById(959);

const monsterGeneration = findSongById(2);   // MONSTER GENERATiON
const memoriesMelodies = findSongById(36);   // MEMORiES MELODiES (謹賀新年ブローチの対象曲)

const shoutUr = allCards.find(
  (c) => c.rarity === 'UR' && c.groupname === 'IDOLiSH7' && normalizeAttribute(c.attribute) === 'Shout',
)!;
const triggerUr = allCards.find((c) => c.rarity === 'UR' && c.groupname === 'TRIGGER')!;
const nonUr = allCards.find((c) => c.rarity === 'SR')!;

/** 先頭から詰めた 6 スロットデッキを作る */
const deckOf = (...cards: (Card | null)[]): (Card | null)[] => {
  const deck: (Card | null)[] = [null, null, null, null, null, null];
  cards.forEach((c, i) => { deck[i] = c; });
  return deck;
};

/** 指定スロットから broach_type で 1 件取り出す (存在しなければ throw) */
const broachOfType = (resolved: Map<number, ResolvedBroach[]>, slot: number, type: number): ResolvedBroach => {
  const rb = (resolved.get(slot) ?? []).find((x) => x.broach.broach_type === type);
  if (!rb) throw new Error(`slot=${slot} に broach_type=${type} がありません`);
  return rb;
};

describe('resolveDeckBroachs (固定ブローチの条件解決)', () => {
  it('UR 以外のカードにはブローチが付かない', () => {
    const resolved = resolveDeckBroachs(deckOf(nonUr), allBroachs, monsterGeneration);
    expect(resolved.size).toBe(0);
  });

  it('グループ指定 (種類4): 自スロット全員が指定グループなら発動', () => {
    const resolved = resolveDeckBroachs(deckOf(tamaki), allBroachs, monsterGeneration);
    const rb = broachOfType(resolved, 0, 4);
    expect(rb.active).toBe(true);
    expect(rb.multiplier).toBe(1);
  });

  it('グループ指定 (種類4): 他グループのカードが混ざると不発', () => {
    const resolved = resolveDeckBroachs(deckOf(tamaki, triggerUr), allBroachs, monsterGeneration);
    expect(broachOfType(resolved, 0, 4).active).toBe(false);
  });

  it('オート専用 (種類8) は常に不発', () => {
    const resolved = resolveDeckBroachs(deckOf(mitsuki5th), allBroachs, monsterGeneration);
    expect(broachOfType(resolved, 0, 8).active).toBe(false);
  });

  it('スコアUP (種類9): 対象曲なら発動してボーナス合算、対象外曲なら不発', () => {
    const onTarget = resolveDeckBroachs(deckOf(kinga), allBroachs, memoriesMelodies);
    expect(broachOfType(onTarget, 0, 9).active).toBe(true);
    expect(calcBroachScoreBonus(onTarget)).toBe(1000);

    const offTarget = resolveDeckBroachs(deckOf(kinga), allBroachs, monsterGeneration);
    expect(broachOfType(offTarget, 0, 9).active).toBe(false);
    expect(calcBroachScoreBonus(offTarget)).toBe(0);
  });

  it('アイドル属性指定カウント (種類5): 対象2枚で multiplier=2、limit=1 により2枚目は不発', () => {
    const resolved = resolveDeckBroachs(deckOf(ichiOto, ichiOto), allBroachs, monsterGeneration);
    const first = broachOfType(resolved, 0, 5);
    const second = broachOfType(resolved, 1, 5);
    expect(first.active).toBe(true);
    expect(first.multiplier).toBe(2);
    expect(second.active).toBe(false);
  });

  it('全属性編成 (種類7): Shout/Beat/Melody が揃うと発動、欠けると不発', () => {
    const full = resolveDeckBroachs(deckOf(yamato5th, ichi5th, shoutUr), allBroachs, monsterGeneration);
    expect(broachOfType(full, 0, 7).active).toBe(true);

    const partial = resolveDeckBroachs(deckOf(yamato5th), allBroachs, monsterGeneration);
    expect(broachOfType(partial, 0, 7).active).toBe(false);
  });

  it('selectedBroachIds 指定時: null のスロットはブローチなし、id 指定はそのブローチのみ', () => {
    const tamakiBroach = findBroachsByCardId(2484)[0];

    const none = resolveDeckBroachs(deckOf(tamaki), allBroachs, monsterGeneration, [null, null, null, null, null, null]);
    expect(none.get(0) ?? []).toHaveLength(0);

    const only = resolveDeckBroachs(deckOf(tamaki), allBroachs, monsterGeneration, [tamakiBroach.id, null, null, null, null, null]);
    expect((only.get(0) ?? []).map((rb) => rb.broach.id)).toEqual([tamakiBroach.id]);
  });
});
