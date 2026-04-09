export const CHARACTERS = [
  '和泉一織', '二階堂大和', '和泉三月', '四葉環',
  '逢坂壮五', '六弥ナギ', '七瀬陸',
  '八乙女楽', '九条天', '十龍之介',
  '亥清悠', '狗丸トウマ', '棗巳波',
  '御堂虎於'
] as const;

export const RARITIES = ['UR', 'SSR', 'SR', 'R', 'N'] as const;

export const ATTRIBUTES = [
  { value: 1, label: 'Shout', color: 'red' },
  { value: 2, label: 'Beat', color: 'green' },
  { value: 3, label: 'Melody', color: 'blue' },
] as const;

export const ATTRIBUTE_MAP: Record<number, string> = {
  1: 'Shout',
  2: 'Beat',
  3: 'Melody',
};

/** 属性色: Shout=赤, Beat=緑, Melody=青 */
export const ATTRIBUTE_COLORS: Record<number, string> = {
  1: '#ef4444',  // red - Shout
  2: '#22c55e',  // green - Beat
  3: '#3b82f6',  // blue - Melody
};

export const ATTRIBUTE_BADGE_CLASSES: Record<number, string> = {
  1: 'bg-red-500',    // Shout
  2: 'bg-green-500',  // Beat
  3: 'bg-blue-500',   // Melody
};

/** レアリティ別バッジ背景色（Tailwindクラス） */
export const RARITY_BADGE_CLASSES: Record<string, string> = {
  UR: 'bg-amber-500', SSR: 'bg-purple-500', SR: 'bg-sky-400',
  R: 'bg-gray-400', N: 'bg-gray-300', GROUP: 'bg-pink-400',
};

export const CARD_IMAGE_BASE_URL = 'https://yo4raw.github.io/i7_assets/assets/cards';
export const CARD_THUMB_BASE_URL = 'https://yo4raw.github.io/i7_assets/assets/th_cards';

export const PAGE_SIZE = 100;
