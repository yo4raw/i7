import { describe, it, expect } from 'vitest';
import { bonusBadgeHtml, type EventBonusTier } from '../../../src/lib/data/eventBonusTiers';
import { formatEffectSummary, type EventSpecialTier } from '../../../src/lib/data/fetchEventsCsv';

describe('bonusBadgeHtml', () => {
  it('tier が gold ならバッジ HTML（selectClasses と短縮ラベルを含む）', () => {
    const html = bonusBadgeHtml('gold');
    expect(html).toContain('bg-yellow-100');
    expect(html).toContain('>金</span>');
  });

  it('tier が bronze / silver でもそれぞれの色クラスを含む', () => {
    expect(bonusBadgeHtml('bronze')).toContain('bg-amber-100');
    expect(bonusBadgeHtml('silver')).toContain('bg-gray-200');
  });

  it('none / null / undefined は空文字', () => {
    expect(bonusBadgeHtml('none')).toBe('');
    expect(bonusBadgeHtml(null)).toBe('');
    expect(bonusBadgeHtml(undefined)).toBe('');
  });

  it('定義に無い tier は空文字（防御）', () => {
    expect(bonusBadgeHtml('unknown' as EventBonusTier)).toBe('');
  });
});

describe('formatEffectSummary', () => {
  const base: EventSpecialTier = {
    cardIds: [], costumeIds: [], effect: [],
    param_up: 0, item_up: 0, bpt_up: 0, ept_up: 0, gpt_up: 0, score_up: 0,
  };

  it('effect に含まれかつ値が正の項目のみを " / " 区切りで返す', () => {
    const tier: EventSpecialTier = {
      ...base,
      effect: ['param', 'score'],
      param_up: 50,
      score_up: 30,
      item_up: 20, // effect に無いので除外される
    };
    expect(formatEffectSummary(tier)).toBe('パラメータ +50% / スコア +30%');
  });

  it('値が 0 の項目は effect にあっても除外', () => {
    const tier: EventSpecialTier = { ...base, effect: ['param'], param_up: 0 };
    expect(formatEffectSummary(tier)).toBe('');
  });

  it('全 6 種別のラベルを正しく出す', () => {
    const tier: EventSpecialTier = {
      ...base,
      effect: ['param', 'item', 'bpt', 'ept', 'gpt', 'score'],
      param_up: 1, item_up: 2, bpt_up: 3, ept_up: 4, gpt_up: 5, score_up: 6,
    };
    expect(formatEffectSummary(tier)).toBe(
      'パラメータ +1% / アイテム +2% / 基礎Pt +3% / イベントPt +4% / グレードPt +5% / スコア +6%',
    );
  });

  it('該当なしなら空文字', () => {
    expect(formatEffectSummary(base)).toBe('');
  });
});
