export const CHARACTERS = [
  '和泉一織', '二階堂大和', '和泉三月', '四葉環',
  '逢坂壮五', '六弥ナギ', '七瀬陸',
  '八乙女楽', '九条天', '十龍之介',
  '亥清悠', '狗丸トウマ', '棗巳波',
  '御堂虎於', '日向つむぎ', '月雲了', '桜春樹',
] as const;

export const RARITIES = ['UR', 'SSR', 'SR', 'R', 'GROUP'] as const;

export const ATTRIBUTES = [
  { value: 1, label: 'Shout', color: 'shout' },
  { value: 2, label: 'Beat', color: 'beat' },
  { value: 3, label: 'Melody', color: 'melody' },
] as const;

export const ATTRIBUTE_MAP: Record<number, string> = {
  1: 'Shout',
  2: 'Beat',
  3: 'Melody',
};

export const CARD_IMAGE_BASE_URL = 'https://yo4raw.github.io/i7_assets/assets/cards';

export const PAGE_SIZE = 100;
