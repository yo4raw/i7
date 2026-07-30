export const SITE_NAME = 'i7マネ部屋(β)';

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

/** 無彩色クロームの基準色。ヘッダー等の構造面に使う */
export const CHROME_INK = '#14151A';

/**
 * キャラクターカラー 16 色。色の単一情報源。
 * CSS 側に複製はない（@theme トークン化せず、利用側が本定数を import して
 * インラインスタイルに流し込む）。値の変更はここだけで完結する。
 *
 * 公式のカラーコードは公開されていない。定着した色名から校正した候補値であり、
 * 全色が CHROME_INK に対して WCAG 1.4.11 の 3:1 を満たすよう調整してある。
 * 十龍之介は原作では和泉一織と同じ「紺」だが、16 色を判別可能にするため彩度を下げている。
 */
export const CHARACTER_HEX: Record<string, string> = {
  和泉一織: '#3D5FC4',
  二階堂大和: '#43B75D',
  和泉三月: '#F08322',
  四葉環: '#56C5E8',
  逢坂壮五: '#8A6BC8',
  六弥ナギ: '#F5C518',
  七瀬陸: '#E4373B',
  八乙女楽: '#9AA3AD',
  九条天: '#F2A7C3',
  十龍之介: '#5878A6',
  百: '#FF3D8B',
  千: '#C3E829',
  亥清悠: '#6FDCC0',
  狗丸トウマ: '#C0353D',
  棗巳波: '#D8C3A0',
  御堂虎於: '#C77FC0',
};

/** キャラ名から色を引く。未知の名前には無彩色を返す */
export function characterColor(name: string): string {
  return CHARACTER_HEX[name] ?? '#6B7280';
}

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

/* v8 ignore next -- BASE_URL は実行環境で常に定義され ?? '' のフォールバックへ到達しない */
const BASE = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '').replace(/\/$/, '');
export const CARD_IMAGE_BASE_URL = `${BASE}/assets/cards`;
export const CARD_THUMB_BASE_URL = `${BASE}/assets/th_cards`;
export const SONG_IMAGE_BASE_URL = `${BASE}/assets/songs`;

export const PAGE_SIZE = 100;
