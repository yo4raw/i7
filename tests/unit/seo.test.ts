import { describe, it, expect } from 'vitest';
import { cardCreativeWorkLd, collectionPageLd, PAGE_DESCRIPTIONS, type CardForLd } from '../../src/lib/seo';

const SITE = 'https://i7.yo4raw.com';

const fullCard: CardForLd = {
  ID: 1234,
  cardname: 'テスト衣装',
  name: '和泉一織',
  rarity: 'UR',
  attribute: 'Shout',
};

describe('cardCreativeWorkLd', () => {
  it('CreativeWork 型と必須プロパティ・絶対URLを返す', () => {
    const ld = cardCreativeWorkLd(fullCard, SITE);
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('CreativeWork');
    expect(ld.name).toBe('テスト衣装');
    expect(ld.url).toBe('https://i7.yo4raw.com/cards/1234/');
    expect(ld.image).toBe('https://i7.yo4raw.com/assets/cards/1234.png');
    expect(ld.inLanguage).toBe('ja');
    expect(ld.isPartOf).toMatchObject({ '@type': 'WebSite' });
  });

  it('キャラ名を character(Person) として含める', () => {
    const ld = cardCreativeWorkLd(fullCard, SITE);
    expect(ld.character).toEqual({ '@type': 'Person', name: '和泉一織' });
  });

  it('レアリティ・属性を additionalProperty に含める', () => {
    const ld = cardCreativeWorkLd(fullCard, SITE);
    expect(ld.additionalProperty).toEqual([
      { '@type': 'PropertyValue', name: 'レアリティ', value: 'UR' },
      { '@type': 'PropertyValue', name: '属性', value: 'Shout' },
    ]);
  });

  it('末尾スラッシュ有りの siteUrl でも二重スラッシュにならない', () => {
    const ld = cardCreativeWorkLd(fullCard, `${SITE}/`);
    expect(ld.url).toBe('https://i7.yo4raw.com/cards/1234/');
  });

  it('キャラ名・レア・属性が null のとき該当プロパティを出さない', () => {
    const ld = cardCreativeWorkLd(
      { ID: 9, cardname: null, name: null, rarity: null, attribute: null },
      SITE,
    );
    expect(ld.character).toBeUndefined();
    expect(ld.additionalProperty).toBeUndefined();
    // cardname が無くてもフォールバック名で name は必ず入る
    expect(ld.name).toBe('衣装 9');
  });
});

describe('collectionPageLd', () => {
  it('CollectionPage と numberOfItems を返し全件は列挙しない', () => {
    const ld = collectionPageLd({
      name: '衣装一覧',
      url: `${SITE}/cards/`,
      description: '説明',
      numberOfItems: 2689,
    });
    expect(ld['@type']).toBe('CollectionPage');
    expect(ld.name).toBe('衣装一覧');
    expect(ld.url).toBe('https://i7.yo4raw.com/cards/');
    expect(ld.mainEntity).toEqual({ '@type': 'ItemList', numberOfItems: 2689 });
    // itemListElement（全件列挙）は持たない
    expect((ld.mainEntity as Record<string, unknown>).itemListElement).toBeUndefined();
  });
});

describe('PAGE_DESCRIPTIONS', () => {
  it('主要ページの description が定義されており適切な長さである', () => {
    for (const key of ['home', 'cards', 'songs', 'events', 'scoreCalc', 'maxScoreFinder']) {
      const d = PAGE_DESCRIPTIONS[key];
      expect(d, key).toBeTruthy();
      expect(d.length, key).toBeGreaterThanOrEqual(20);
      expect(d.length, key).toBeLessThanOrEqual(160);
    }
  });
});
