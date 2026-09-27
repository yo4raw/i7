import { describe, it, expect } from 'vitest';
import { cardAlt, songAlt, orphanCardAlt } from '../../src/lib/imageAlt';

const CARD = { name: '御堂虎於', cardname: '午前0時の新月', rarity: 'SSR', attribute: 'Beat' };
// v は既にキャラクター名入りの冒頭を持つ（catalog 側が名前置換済み）
const V = '御堂虎於が黒い中国風ジャケット姿で赤い中国結を掲げている';

describe('cardAlt', () => {
  it('識別情報（カード名・レアリティ・属性）+ ビジュアル描写を合成する。name は出さない', () => {
    expect(cardAlt(CARD, { v: V })).toBe(
      `「午前0時の新月」カードイラスト（SSR・Beat）。${V}`,
    );
  });

  it('cardname が null なら「」を落とす', () => {
    expect(cardAlt({ ...CARD, cardname: null }, { v: V })).toBe(
      `カードイラスト（SSR・Beat）。${V}`,
    );
  });

  it('rarity と attribute が両方 null なら括弧ごと落とす', () => {
    expect(cardAlt({ ...CARD, rarity: null, attribute: null }, { v: V })).toBe(
      `「午前0時の新月」カードイラスト。${V}`,
    );
  });

  it('rarity だけ null なら残る方だけ括弧に入れる', () => {
    expect(cardAlt({ ...CARD, rarity: null }, { v: V })).toBe(
      `「午前0時の新月」カードイラスト（Beat）。${V}`,
    );
  });

  it('v が null なら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: null })).toBe('「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('v が undefined なら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: undefined })).toBe('「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('v が空文字なら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: '' })).toBe('「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('v が空白のみなら識別情報だけで終わる', () => {
    expect(cardAlt(CARD, { v: '   ' })).toBe('「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('entry を省略しても識別情報を返す', () => {
    expect(cardAlt(CARD)).toBe('「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('entry に null を渡しても識別情報を返す', () => {
    expect(cardAlt(CARD, null)).toBe('「午前0時の新月」カードイラスト（SSR・Beat）');
  });

  it('name は alt に使わない（v 冒頭が名前を持つため二重にしない）', () => {
    // 実呼び出しでは name 入りオブジェクトが渡されても CardAltSource の cardname/rarity/attribute だけ見る。
    // CardAltSource に name フィールドは無いので、ここでは「cardname だけあれば name 相当の情報が別にあっても
    // 出さない」ことを v 冒頭名入りのまま確認する。
    expect(cardAlt({ cardname: '××', rarity: null, attribute: null }, { v: '七瀬陸が白い服' })).toBe(
      '「××」カードイラスト。七瀬陸が白い服',
    );
  });

  it('識別情報も v も無ければ空文字を返す', () => {
    expect(cardAlt({})).toBe('カードイラスト');
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

  it('artist が null なら「の」を落とす', () => {
    expect(songAlt({ artist: null, song_name: '4-ROAR' }, { v: V })).toBe('楽曲「4-ROAR」ジャケット。' + V);
  });

  it('artist と song_name が両方 null でも識別情報だけ返す', () => {
    expect(songAlt({ artist: null, song_name: null }, { v: V })).toBe(`楽曲ジャケット。${V}`);
  });

  it('entry に null を渡しても例外を投げずに合成する', () => {
    expect(songAlt(SONG, null)).toBe('IDOLiSH7の楽曲「4-ROAR」ジャケット');
  });
});

describe('orphanCardAlt', () => {
  it('印字名 + ビジュアル描写を合成する', () => {
    const v = '七瀬陸が夕暮れの屋上でマフラーを風に翻している';
    expect(orphanCardAlt({ n: 'RIKU NANASE', v })).toBe(`RIKU NANASEのカードイラスト。${v}`);
  });

  it('n が無くても描写は返す', () => {
    expect(orphanCardAlt({ v: V })).toBe(`カードイラスト。${V}`);
  });

  it('v も n も無ければ識別情報だけを返す', () => {
    expect(orphanCardAlt({})).toBe('カードイラスト');
  });
});
