import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_HEX, CHROME_INK } from '../../src/lib/constants';
import { CHIP_TEXT_OVERRIDE, CHIP_DILUTED } from '../../src/lib/characterChipStyle';

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

function toHexByte(c: number): string {
  return c.toString(16).padStart(2, '0');
}

/** `color-mix(in srgb, {hex} pct%, white)` を TS 側で再現する（sRGB のチャンネル値を直接ブレンド） */
function mixWithWhite(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const frac = pct / 100;
  const mix = (c: number) => Math.round(c * frac + 255 * (1 - frac));
  return `#${toHexByte(mix(r))}${toHexByte(mix(g))}${toHexByte(mix(b))}`;
}

describe('CHIP_TEXT_OVERRIDE / CHIP_DILUTED のキー整合性', () => {
  it('CHIP_TEXT_OVERRIDE のキーはすべて CHARACTER_HEX に存在する（打ち間違い検出）', () => {
    for (const name of Object.keys(CHIP_TEXT_OVERRIDE)) {
      expect(CHARACTER_HEX[name], `${name} は CHARACTER_HEX に存在しない`).toBeDefined();
    }
  });

  it('CHIP_DILUTED のキーはすべて CHARACTER_HEX に存在する（打ち間違い検出）', () => {
    for (const name of Object.keys(CHIP_DILUTED)) {
      expect(CHARACTER_HEX[name], `${name} は CHARACTER_HEX に存在しない`).toBeDefined();
    }
  });

  it('CHIP_DILUTED の希釈率は 0 より大きく 100 以下', () => {
    for (const [name, pct] of Object.entries(CHIP_DILUTED)) {
      expect(pct, `${name} の希釈率 ${pct}`).toBeGreaterThan(0);
      expect(pct, `${name} の希釈率 ${pct}`).toBeLessThanOrEqual(100);
    }
  });
});

describe('キャラクターフィルタチップの選択時コントラスト (WCAG AA 4.5:1)', () => {
  for (const name of CHARACTERS) {
    it(`${name}: 実際に適用される塗り色と文字色のコントラストが 4.5:1 以上`, () => {
      const hex = CHARACTER_HEX[name];
      const dilutePct = CHIP_DILUTED[name];

      // CHIP_DILUTED に載っている色は希釈後の実効色で判定する（color-mix の計算を再現）
      const effectiveBg = dilutePct !== undefined ? mixWithWhite(hex, dilutePct) : hex;
      const textColor = dilutePct !== undefined ? CHROME_INK : (CHIP_TEXT_OVERRIDE[name] ?? CHROME_INK);

      const ratio = contrast(effectiveBg, textColor);
      expect(
        ratio,
        `${name}: 塗り ${effectiveBg} (元色 ${hex}${dilutePct !== undefined ? `, 希釈 ${dilutePct}%` : ''}) × 文字 ${textColor} のコントラストが ${ratio.toFixed(2)}`
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
