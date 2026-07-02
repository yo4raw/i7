import { describe, it, expect } from 'vitest';
import { parseSkill } from '../../../src/lib/score/teamBuilder';
import type { Card } from '../../../src/lib/data/fetchCardsJson';

/** parseSkill が参照するフィールドのみ持つ最小 Card を作る */
function makeCard(over: Record<string, unknown>): Card {
  return {
    ID: 1, cardID: 1, cardname: 'テスト', name: 'テスト', rarity: 'UR', attribute: 'Shout',
    sp_time: 0,
    ...over,
  } as unknown as Card;
}

describe('parseSkill 入力衛生 (ADR 0037)', () => {
  it('判定ガード(MISS→Perfect) はスキルなし (null) 扱いになる', () => {
    // 実データ ID 142 相当: L1-L4 に count/per/value があり L5 は空
    const card = makeCard({
      ap_skill_type: '判定ガード(MISS→Perfect)',
      ap_skill_1_count: 18, ap_skill_1_per: 36, ap_skill_1_value: 4, ap_skill_1_rate: 0,
    });
    expect(parseSkill(card, 0, 5)).toBeNull();
  });

  it('判定拡大スコアダウン はスキルなし (null) 扱いになる', () => {
    // 実データ ID 182 相当
    const card = makeCard({
      ap_skill_type: '判定拡大スコアダウン',
      ap_skill_1_count: 18, ap_skill_1_per: 37, ap_skill_1_value: 4, ap_skill_1_rate: 0,
    });
    expect(parseSkill(card, 0, 5)).toBeNull();
  });

  it('per > 100 の実データは 100 にクランプされる', () => {
    // 実データ ID 3144 相当: L1 のみ per=360 (36.0% の入力ミス疑い)、L5 空 → L1 へフォールバック
    const card = makeCard({
      ap_skill_type: 'スコアアップ（タイマー）',
      ap_skill_1_count: 18, ap_skill_1_per: 360, ap_skill_1_value: 900, ap_skill_1_rate: 0,
    });
    const skill = parseSkill(card, 0, 5);
    expect(skill).not.toBeNull();
    expect(skill!.per).toBe(100);
  });

  it('per ≤ 100 の通常データは変化しない', () => {
    const card = makeCard({
      ap_skill_type: 'スコアアップ（タイマー）',
      ap_skill_1_count: 18, ap_skill_1_per: 54, ap_skill_1_value: 900, ap_skill_1_rate: 0,
    });
    expect(parseSkill(card, 0, 5)!.per).toBe(54);
  });
});
