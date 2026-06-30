import { describe, it, expect } from 'vitest';
import { normalizeAttribute } from '../../../src/lib/score/types';

describe('normalizeAttribute', () => {
  it('数値はATTRIBUTE_MAPで変換（1=Shout,2=Beat,3=Melody）', () => {
    expect(normalizeAttribute(1)).toBe('Shout');
    expect(normalizeAttribute(2)).toBe('Beat');
    expect(normalizeAttribute(3)).toBe('Melody');
  });

  it('未知の数値は Shout フォールバック', () => {
    expect(normalizeAttribute(99)).toBe('Shout');
  });

  it('属性名文字列はそのまま', () => {
    expect(normalizeAttribute('Beat')).toBe('Beat');
  });

  it('数字文字列は数値として変換', () => {
    expect(normalizeAttribute('3')).toBe('Melody');
  });

  it('null・非数値文字列は Shout フォールバック', () => {
    expect(normalizeAttribute(null)).toBe('Shout');
    expect(normalizeAttribute('xyz')).toBe('Shout');
  });
});
