import { describe, it, expect } from 'vitest';
import { createEmptyDeckState, swapSlots, clampSharedBroachs, setCard, clearSlot, DECK_SIZE } from '../../../src/lib/score/deckState';
import { allBroachs, findCardById, findBroachsByCardId } from '../../fixtures';

/** 10th Anniversary 四葉環 (UR、固有ブローチあり) */
const urWithBroach = findCardById(2484);

describe('deckState (デッキ編成状態の操作)', () => {
  it('createEmptyDeckState: 6 スロットすべて初期値', () => {
    const s = createEmptyDeckState();
    expect(s.cards).toEqual(Array(DECK_SIZE).fill(null));
    expect(s.bonusTiers).toEqual(Array(DECK_SIZE).fill('none'));
    expect(s.trained).toEqual(Array(DECK_SIZE).fill(true));
    expect(s.sharedBroachs).toEqual([[], [], [], [], [], []]);
    expect(s.skillLevels).toEqual(Array(DECK_SIZE).fill(5));
  });

  it('setCard: カード配置 + デフォルト特効 + 共有ブローチ検証', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'gold', allBroachs);
    expect(s.cards[0]).toBe(urWithBroach);
    expect(s.bonusTiers[0]).toBe('gold');
  });

  it('swapSlots: 全属性が入れ替わる', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'gold', allBroachs);
    s.trained[0] = false;
    s.skillLevels[0] = 3;
    swapSlots(s, 0, 2);
    expect(s.cards[2]).toBe(urWithBroach);
    expect(s.cards[0]).toBeNull();
    expect(s.bonusTiers[2]).toBe('gold');
    expect(s.trained[2]).toBe(false);
    expect(s.skillLevels[2]).toBe(3);
  });

  it('clampSharedBroachs: 固有ブローチ持ち UR は共有ブローチ 1 個まで', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'none', allBroachs);
    expect(findBroachsByCardId(2484).length).toBeGreaterThan(0); // 前提確認
    s.sharedBroachs[0] = [1, 2];
    clampSharedBroachs(s, 0, allBroachs);
    expect(s.sharedBroachs[0]).toEqual([1]);
  });

  it('clampSharedBroachs: カードなしスロットは共有ブローチ 0 個', () => {
    const s = createEmptyDeckState();
    s.sharedBroachs[1] = [1];
    clampSharedBroachs(s, 1, allBroachs);
    expect(s.sharedBroachs[1]).toEqual([]);
  });

  it('clearSlot: スロットが初期値に戻る', () => {
    const s = createEmptyDeckState();
    setCard(s, 0, urWithBroach, 'gold', allBroachs);
    s.trained[0] = false;
    s.sharedBroachs[0] = [1];
    s.skillLevels[0] = 3;
    clearSlot(s, 0);
    expect(s.cards[0]).toBeNull();
    expect(s.bonusTiers[0]).toBe('none');
    expect(s.trained[0]).toBe(true);
    expect(s.sharedBroachs[0]).toEqual([]);
    // 既存 modal-clear ハンドラはスキルLv をリセットしないため、維持される
    expect(s.skillLevels[0]).toBe(3);
  });
});
