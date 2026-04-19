export const SITE_NAME = 'i7ごったに部屋';
export const SITE_DESCRIPTION = 'アイドリッシュセブンのカード・楽曲・イベント情報をまとめた、ファンによる非公式のデータベースサイト';

export const CHARACTERS = [
  '和泉一織', '二階堂大和', '和泉三月', '四葉環',
  '逢坂壮五', '六弥ナギ', '七瀬陸',
  '八乙女楽', '九条天', '十龍之介',
  '百', '千',
  '亥清悠', '狗丸トウマ', '棗巳波',
  '御堂虎於'
] as const;

export const CHARACTER_GROUPS = [
  { name: 'IDOLiSH7', members: ['和泉一織', '二階堂大和', '和泉三月', '四葉環', '逢坂壮五', '六弥ナギ', '七瀬陸'] },
  { name: 'TRIGGER', members: ['八乙女楽', '九条天', '十龍之介'] },
  { name: 'Re:vale', members: ['百', '千'] },
  { name: 'ŹOOĻ', members: ['亥清悠', '狗丸トウマ', '棗巳波', '御堂虎於'] },
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

/** 属性キーと表示名のペア。ノート集計などでループ処理するとき用 */
export const ATTRS = [
  { key: 'shout', name: 'Shout' },
  { key: 'beat', name: 'Beat' },
  { key: 'melody', name: 'Melody' },
] as const;

/** 属性色: 属性名キー */
export const ATTR_HEX: Record<string, string> = {
  Shout: '#ef4444', Beat: '#22c55e', Melody: '#3b82f6',
};

export const ATTR_BADGE_BG: Record<string, string> = {
  Shout: 'bg-red-500', Beat: 'bg-green-500', Melody: 'bg-blue-500',
};

export const ATTR_BG: Record<string, string> = {
  Shout: 'rgba(239,68,68,0.06)', Beat: 'rgba(34,197,94,0.06)', Melody: 'rgba(59,130,246,0.06)',
};

export const ATTR_BG_HOVER: Record<string, string> = {
  Shout: 'rgba(239,68,68,0.12)', Beat: 'rgba(34,197,94,0.12)', Melody: 'rgba(59,130,246,0.12)',
};

/** レアリティ別バッジ背景色（Tailwindクラス） */
export const RARITY_BADGE_CLASSES: Record<string, string> = {
  UR: 'bg-amber-500', SSR: 'bg-purple-500', SR: 'bg-sky-400',
  R: 'bg-gray-400', N: 'bg-gray-300', GROUP: 'bg-pink-400',
};

const BASE = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '').replace(/\/$/, '');
export const CARD_IMAGE_BASE_URL = `${BASE}/assets/cards`;
export const CARD_THUMB_BASE_URL = `${BASE}/assets/th_cards`;
export const SONG_IMAGE_BASE_URL = `${BASE}/assets/songs`;

export const PAGE_SIZE = 100;
