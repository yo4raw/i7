import { describe, it, expect } from 'vitest';
import { cardAlt, songAlt, orphanCardAlt } from '../../src/lib/imageAlt';

const CARD = { name: '御堂虎於', cardname: '午前0時の新月', rarity: 'SSR', attribute: 'Beat' };
const V = 'ネオン街を背景に、黒い中国風ジャケット姿の青年が赤い中国結を掲げている';

describe('cardAlt', () => {
  it('識別情報 + ビジュアル描写を合成する', () => {
    expect(cardAlt(CARD, { v: V })).toBe(
      `御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）。${V}`,
    );
  });

  it('cardname が null なら「」を落とす', () => {
    expect(cardAlt({ ...CARD, cardname: null }, { v: V })).toBe(
      `御堂虎於のカードイラスト（SSR・Beat）。${V}`,
    );
  });

  it('rarity と attribute が両方 null なら括弧ごと落とす', () => {
    expect(cardAlt({ ...CARD, rarity: null, attribute: null }, { v: V })).toBe(
      `御堂虎於の「午前0時の新月」カードイラスト。${V}`,
    );
  });

  it('rarity だけ null なら残る方だけ括弧に入れる', () => {
    expect(cardAlt({ ...CARD, rarity: null }, { v: V })).toBe(
      `御堂虎於の「午前0時の新月」カードイラスト（Beat）。${V}`,
    );
  });

  it('v が null なら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: null })).toBe('御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('v が undefined なら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: undefined })).toBe('御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('v が空文字なら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: '' })).toBe('御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('v が空白のみなら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: '   ' })).toBe('御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('entry を省略しても識別情報を返す', () => {
    expect(cardAlt(CARD)).toBe('御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('entry に null を渡しても識別情報を返す', () => {
    expect(cardAlt(CARD, null)).toBe('御堂虎於の「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('name が null なら描写のみを返す', () => {
    expect(cardAlt({ ...CARD, name: null }, { v: V })).toBe(V);
  });

  it('name も v も無ければ空文字を返す', () => {
    expect(cardAlt({})).toBe('');
  });
});

describe('songAlt', () => {
  const SONG = { artist: 'IDOLiSH7', song_name: '4-ROAR' };

  it('識別情報 + ビジュアル描写を合成する', () => {
    expect(songAlt(SONG, { v: V })).toBe(`IDOLiSH7の楽曲「4-ROAR」ジャケット。${V}`);
  });

  it('song_name が null なら「」を落とす', () => {
    expect(songAlt({ ...SONG, song_name: null }, { v: V })).toBe(`IDOLiSH7の楽曲ジャケット。${V}`);
  });

  it('artist と song_name が両方 null なら描写のみを返す', () => {
    expect(songAlt({ artist: null, song_name: null }, { v: V })).toBe(V);
  });

  it('entry に null を渡しても例外を投げずに合成する', () => {
    expect(songAlt(SONG, null)).toBe('IDOLiSH7の楽曲「4-ROAR」ジャケット');
  });
});

describe('orphanCardAlt', () => {
  it('印字名 + ビジュアル描写を合成する', () => {
    const v = '夕暮れの屋上で、マフラーを風に翻されている';
    expect(orphanCardAlt({ n: 'Yuki Aoi', v })).toBe(`Yuki Aoiのカードイラスト。${v}`);
  });

  it('n が無ければ描写のみを返す', () => {
    expect(orphanCardAlt({ v: V })).toBe(V);
  });

  it('v も n も無ければ空文字を返す', () => {
    expect(orphanCardAlt({})).toBe('');
  });
});
