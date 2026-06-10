/**
 * UI 共通ヘルパ
 *
 * 画像 URL 組み立て・星表示・属性テキストクラスなど、
 * ページ間で重複しがちな DOM 文字列生成を集約する。
 */

import { CARD_IMAGE_BASE_URL, CARD_THUMB_BASE_URL, SONG_IMAGE_BASE_URL } from './constants';
import type { AttributeName } from './score/types';

/** 属性の Tailwind テキスト色クラス (`text-red-500` etc.) */
export const ATTR_TEXT_CLASS: Record<AttributeName, string> = {
  Shout: 'text-red-500',
  Beat: 'text-green-500',
  Melody: 'text-blue-500',
};

export function cardImageUrl(id: number | string): string {
  return `${CARD_IMAGE_BASE_URL}/${id}.png`;
}

export function cardThumbUrl(id: number | string): string {
  return `${CARD_THUMB_BASE_URL}/${id}.png`;
}

export function songImageUrl(id: number | string): string {
  return `${SONG_IMAGE_BASE_URL}/${id}.png`;
}

/** ミリ秒を「123 ms」「12.34 秒」「1分 5.0秒」形式で整形する */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)} 秒`;
  const m = Math.floor(s / 60);
  return `${m}分 ${(s - m * 60).toFixed(1)}秒`;
}

/** 星 n 個 + 空星 (5-n) 個を文字列で返す。n が falsy なら空文字 */
export function starsText(n: number | null | undefined): string {
  if (!n) return '';
  const filled = Math.max(0, Math.min(5, n));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}
