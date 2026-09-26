import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../../src/lib/constants';
import {
  LEAK_CHECK_NAMES,
  validateCatalog,
  validateEntry,
} from '../../../scripts/image-alt/validate-visual.mjs';

// 生成の目標長は 40〜70 文字だが、落とすのは強制境界（10〜200 文字）の外だけ
const OK_CARD_V = '夕暮れの屋上で、スカートの少女が持ったマフラーを風に翻されている';
const OK_SONG_V = '幾何学模様の背景に、重なる人物の名前が英字で添えられている';

describe('LEAK_CHECK_NAMES', () => {
  it('CHARACTERS から百と千を除いた名前と一致する', () => {
    // CHARACTERS は全 16 名。百・千を除くと 14 名
    const expected = CHARACTERS.filter((name) => name !== '百' && name !== '千');
    expect(LEAK_CHECK_NAMES).toHaveLength(expected.length);
    expect(new Set(LEAK_CHECK_NAMES)).toEqual(new Set(expected));
  });
});

describe('validateEntry', () => {
  it('規則を守ったレコードは違反 0 件', () => {
    expect(validateEntry({ v: OK_CARD_V }, 'card', '1000')).toEqual([]);
  });

  it('v が空なら違反 1 件（メッセージに id を含む）', () => {
    const violations = validateEntry({ v: '' }, 'card', '1000');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1000');
    expect(violations[0]).toContain('空');
  });

  it('v が 10 文字未満なら長さ違反', () => {
    const violations = validateEntry({ v: '短すぎる' }, 'card', '1000');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1000');
    expect(violations[0]).toContain('4 文字');
  });

  it('v が 200 文字超なら長さ違反', () => {
    const violations = validateEntry({ v: 'あ'.repeat(201) }, 'card', '1000');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1000');
    expect(violations[0]).toContain('201 文字');
  });

  it.each([
    { label: '15 文字', v: 'あ'.repeat(15) },
    { label: '150 文字', v: 'あ'.repeat(150) },
  ])('強制境界 10〜200 文字の内側（$label）は違反 0 件', ({ v }) => {
    expect(validateEntry({ v }, 'card', '1000')).toEqual([]);
  });

  it.each([
    { label: 'placeholder', v: '白いシャツ姿の少女が placeholder を掲げている' },
    { label: 'TODO', v: '白いシャツ姿の少女が TODO と書かれている' },
    { label: '画像', v: 'カード画像の端に白い少女が立っている' },
    { label: '不明', v: '白いシャツ姿の少女が不明と笑っている' },
    { label: '?', v: '白いシャツ姿の少女がこれは?と指さしている' },
    { label: '？', v: '白いシャツ姿の少女がこれは？と指さしている' },
  ])('禁止語 $label を含むと禁則違反（他の検査は出さない）', ({ v }) => {
    const violations = validateEntry({ v }, 'card', '1000');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1000');
    expect(violations[0]).toContain('禁止語');
  });

  it('キャラクター名が混入したら違反（メッセージに id を含む）', () => {
    const violations = validateEntry({ v: '御堂虎於が黒衣を着ている' }, 'card', '1000');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1000');
    expect(violations[0]).toContain('御堂虎於');
  });

  it.each([
    { label: '百', v: '百人の少女が夕暮れの坂道で笑っている' },
    { label: '千', v: '千の利用者が屋台の前で並んでいる' },
  ])('$label は一般語彙と衝突するためキャラクター名混入の検査から外す', ({ v }) => {
    expect(validateEntry({ v }, 'card', '1000')).toEqual([]);
  });

  it('n が string の孤児カードレコードは通る', () => {
    expect(validateEntry({ v: OK_CARD_V, n: 'Yuki Aoi' }, 'card', '1958')).toEqual([]);
  });

  it('n が number なら構造違反', () => {
    const violations = validateEntry({ v: OK_CARD_V, n: 123 }, 'card', '1958');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1958');
    expect(violations[0]).toContain('n');
  });

  it('n は songs 側に持たせられない', () => {
    const violations = validateEntry({ v: OK_SONG_V, n: 'Yuki Aoi' }, 'song', '100');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('100');
    expect(violations[0]).toContain('n');
  });
});

describe('validateCatalog', () => {
  const CARDS = { '1000': { v: OK_CARD_V }, '1958': { v: OK_CARD_V, n: 'Yuki Aoi' } };
  const SONGS = { '100': { v: OK_SONG_V } };
  const IDS = { cardIds: ['1000', '1958'], songIds: ['100'] };

  it('ID 集合が一致し各エントリも正しければ違反 0 件', () => {
    expect(validateCatalog({ cards: CARDS, songs: SONGS }, IDS)).toEqual([]);
  });

  it('実画像に無い ID がカタログに残っていれば違反', () => {
    const violations = validateCatalog(
      { cards: { ...CARDS, '9999': { v: OK_CARD_V } }, songs: SONGS },
      IDS,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('9999');
  });

  it('実画像にある ID がカタログに無ければ違反', () => {
    const violations = validateCatalog({ cards: { '1000': { v: OK_CARD_V } }, songs: SONGS }, IDS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1958');
  });

  it('songs も双方向で ID 集合を突き合わせる', () => {
    const extra = validateCatalog({ cards: CARDS, songs: { ...SONGS, '777': { v: OK_SONG_V } } }, IDS);
    const missing = validateCatalog({ cards: CARDS, songs: {} }, IDS);
    expect(extra).toHaveLength(1);
    expect(extra[0]).toContain('777');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('100');
  });

  it('カード ID が 1 枚だけ増えると違反になる（カタログの古さに気付ける）', () => {
    const violations = validateCatalog(
      { cards: CARDS, songs: SONGS },
      { cardIds: [...IDS.cardIds, '9999'], songIds: IDS.songIds },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('9999');
  });

  it.each([
    { label: 'null', cards: null },
    { label: '配列', cards: [] },
  ])('catalog.cards が $label なら構造違反（配下の検査はしない）', ({ cards }) => {
    const violations = validateCatalog({ cards, songs: SONGS }, IDS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('cards');
  });

  it('各エントリの検査は validateEntry に委譲する', () => {
    const violations = validateCatalog(
      { cards: { '1000': { v: '短すぎる' } }, songs: SONGS },
      { cardIds: ['1000'], songIds: IDS.songIds },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('1000');
  });
});
