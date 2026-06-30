import { describe, it, expect } from 'vitest';
import {
  ATTR_TEXT_CLASS,
  cardImageUrl,
  cardThumbUrl,
  songImageUrl,
  formatElapsed,
  starsText,
} from '../../src/lib/ui';
import {
  CARD_IMAGE_BASE_URL,
  CARD_THUMB_BASE_URL,
  SONG_IMAGE_BASE_URL,
} from '../../src/lib/constants';

describe('ATTR_TEXT_CLASS', () => {
  it('Shout/Beat/Melody が Tailwind テキスト色クラスにマッピングされる', () => {
    expect(ATTR_TEXT_CLASS).toEqual({
      Shout: 'text-red-500',
      Beat: 'text-green-500',
      Melody: 'text-blue-500',
    });
  });
});

describe('cardImageUrl / cardThumbUrl / songImageUrl', () => {
  it('数値 ID からフルサイズ画像 URL を生成', () => {
    expect(cardImageUrl(123)).toBe(`${CARD_IMAGE_BASE_URL}/123.webp`);
  });

  it('文字列 ID も受け付ける', () => {
    expect(cardImageUrl('999')).toBe(`${CARD_IMAGE_BASE_URL}/999.webp`);
  });

  it('サムネイル URL を生成', () => {
    expect(cardThumbUrl(42)).toBe(`${CARD_THUMB_BASE_URL}/42.webp`);
  });

  it('楽曲画像 URL を生成', () => {
    expect(songImageUrl(7)).toBe(`${SONG_IMAGE_BASE_URL}/7.webp`);
  });
});

describe('formatElapsed', () => {
  it('1000ms 未満は "ms" 単位', () => {
    expect(formatElapsed(0)).toBe('0 ms');
    expect(formatElapsed(999)).toBe('999 ms');
  });

  it('1秒以上60秒未満は小数2桁の "秒" 単位', () => {
    expect(formatElapsed(1000)).toBe('1.00 秒');
    expect(formatElapsed(1234)).toBe('1.23 秒');
  });

  it('60秒以上は "分 秒" 形式', () => {
    expect(formatElapsed(60000)).toBe('1分 0.0秒');
    expect(formatElapsed(125000)).toBe('2分 5.0秒');
  });
});

describe('starsText', () => {
  it('n 個の★ + (5-n) 個の☆', () => {
    expect(starsText(1)).toBe('★☆☆☆☆');
    expect(starsText(3)).toBe('★★★☆☆');
    expect(starsText(5)).toBe('★★★★★');
  });

  it('5を超える値は5にクランプ', () => {
    expect(starsText(6)).toBe('★★★★★');
  });

  it('falsy (0 / null / undefined) は空文字', () => {
    expect(starsText(0)).toBe('');
    expect(starsText(null)).toBe('');
    expect(starsText(undefined)).toBe('');
  });

  it('負数はクランプされ★なし', () => {
    expect(starsText(-3)).toBe('☆☆☆☆☆');
  });
});
