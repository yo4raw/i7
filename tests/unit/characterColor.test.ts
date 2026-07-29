import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_HEX, characterColor, CHROME_INK } from '../../src/lib/constants';

function ch(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 相対輝度 */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe('CHARACTER_HEX', () => {
  it('16 名すべてに色が定義されている', () => {
    for (const name of CHARACTERS) {
      expect(CHARACTER_HEX[name], `${name} の色が未定義`).toBeDefined();
    }
  });

  it('CHARACTERS に存在しないキーを含まない', () => {
    const known = new Set<string>(CHARACTERS);
    for (const key of Object.keys(CHARACTER_HEX)) {
      expect(known.has(key), `${key} は CHARACTERS に存在しない`).toBe(true);
    }
  });

  it('すべて #RRGGBB 形式である', () => {
    for (const [name, hex] of Object.entries(CHARACTER_HEX)) {
      expect(hex, `${name}: ${hex}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('色値に重複がない', () => {
    const values = Object.values(CHARACTER_HEX);
    expect(new Set(values).size).toBe(values.length);
  });

  it('全色が近黒クロームに対して 3:1 (WCAG 1.4.11) を満たす', () => {
    for (const [name, hex] of Object.entries(CHARACTER_HEX)) {
      const ratio = contrast(hex, CHROME_INK);
      expect(ratio, `${name} (${hex}) のコントラストが ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('characterColor', () => {
  it('既知のキャラは CHARACTER_HEX の値を返す', () => {
    expect(characterColor('七瀬陸')).toBe('#E4373B');
  });

  it('未知の名前はフォールバック色を返す', () => {
    expect(characterColor('存在しない人')).toBe('#6B7280');
  });
});
