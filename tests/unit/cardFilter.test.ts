import { describe, it, expect } from 'vitest';
import { cardTextMatches } from '../../src/lib/cardFilter';

describe('cardTextMatches (衣装名/キャラ名の部分一致検索)', () => {
  const card = { cardname: 'MEMORiES MELODiES', name: '七瀬陸' };

  it('空クエリは常にマッチ', () => {
    expect(cardTextMatches(card, '')).toBe(true);
  });

  it('衣装名の部分一致 (小文字化して比較)', () => {
    expect(cardTextMatches(card, 'memories')).toBe(true);
  });

  it('キャラ名の部分一致', () => {
    expect(cardTextMatches(card, '七瀬')).toBe(true);
  });

  it('どちらにも含まれなければ不一致', () => {
    expect(cardTextMatches(card, 'trigger')).toBe(false);
  });

  it('cardname/name が null でも落ちない', () => {
    expect(cardTextMatches({ cardname: null, name: null }, 'x')).toBe(false);
    expect(cardTextMatches({ cardname: null, name: null }, '')).toBe(true);
  });
});
