import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../../scripts/image-alt/build-manifest.mjs';

// 実在する ID を並べた最小入力。
// 1000 = フル画像（cards/）とサムネ（th_cards/）の両方があるカードでシートにも行がある
// 1958 / 2059 = サムネしか無くシートに行が無い孤児カード
// 100 = 楽曲（ID 空間はカードと重なるので kind で振り分ける必要がある）
const SMALL = {
  cardImageIds: ['1000', '1001', '1958'],
  thumbImageIds: ['1000', '1001', '1958', '2059'],
  songImageIds: ['100'],
  cardRows: [{ ID: 1000 }, { ID: 1001 }],
  songRows: [{ id: 100 }],
};

// spec 1 章の母数（カード 3,376 / シート一致 2,871 / 孤児 505、楽曲 151）を再現する入力
const CARD_IDS = Array.from({ length: 3376 }, (_, i) => String(2000 + i));
const SONG_IDS = Array.from({ length: 151 }, (_, i) => String(1 + i));

describe('buildManifest', () => {
  it('母数を数える（カードは th_cards が正、孤児はシートに行が無いカード）', () => {
    const { stats } = buildManifest(SMALL);

    expect(stats).toEqual({
      cardCount: 4,
      songCount: 1,
      dbMatchedCardCount: 2,
      orphanCardCount: 2,
    });
  });

  it('needPrintedName は孤児カードにだけ付く', () => {
    const { manifest } = buildManifest(SMALL);

    expect(manifest.filter((item) => item.needPrintedName).map((item) => item.id)).toEqual([
      '1958',
      '2059',
    ]);
  });

  it('フル画像があるカードは縮小画像を読み、サムネをフォールバックに置く', () => {
    const { manifest } = buildManifest(SMALL);

    // 5 フィールドだけ。hasDbRow は Manifest に載せない
    expect(manifest.find((item) => item.id === '1000')).toEqual({
      kind: 'card',
      id: '1000',
      readPath: 'tmp/image-alt/scaled/cards/1000.webp',
      fallbackPath: 'public/assets/th_cards/1000.webp',
      needPrintedName: false,
    });
  });

  it('サムネしかないカードはサムネを直接読み、フォールバックは無い', () => {
    const { manifest } = buildManifest(SMALL);

    expect(manifest.find((item) => item.id === '2059')).toEqual({
      kind: 'card',
      id: '2059',
      readPath: 'public/assets/th_cards/2059.webp',
      fallbackPath: null,
      needPrintedName: true,
    });
  });

  it('楽曲はジャケットを直接読み、フォールバックも needPrintedName も無い', () => {
    const { manifest } = buildManifest(SMALL);

    expect(manifest.find((item) => item.id === '100')).toEqual({
      kind: 'song',
      id: '100',
      readPath: 'public/assets/songs/100.webp',
      fallbackPath: null,
      needPrintedName: false,
    });
  });

  it('カードは ID 昇順、カードは楽曲より前に並ぶ', () => {
    const { manifest } = buildManifest(SMALL);

    expect(manifest.map((item) => item.id)).toEqual(['1000', '1001', '1958', '2059', '100']);
  });

  it('ID は文字列として昇順に並べる（数値順ではない）', () => {
    const { manifest } = buildManifest({
      ...SMALL,
      cardImageIds: [],
      thumbImageIds: ['9', '10', '100'],
      songImageIds: [],
    });

    expect(manifest.map((item) => item.id)).toEqual(['10', '100', '9']);
  });

  it('readPath はファイルの有無を見ず、ID の所属だけで決める', () => {
    // 実在しない ID でも縮写画像側を指定する（このスクリプトは縮小より先に走るため）
    const { manifest } = buildManifest({
      ...SMALL,
      cardImageIds: ['9999'],
      thumbImageIds: ['9999'],
      songImageIds: [],
    });

    expect(manifest[0].readPath).toBe('tmp/image-alt/scaled/cards/9999.webp');
  });

  it('バッチはカードを先に 1 バッチずつ切り、カードを楽曲を混ぜない', () => {
    const { batches } = buildManifest(SMALL);

    expect(batches.map((batch) => batch.name)).toEqual(['batch-00', 'batch-01']);
    expect(batches.map((batch) => batch.out)).toEqual([
      'tmp/image-alt/batch-00.jsonl',
      'tmp/image-alt/batch-01.jsonl',
    ]);
    expect(batches.map((batch) => batch.items.map((item) => item.kind))).toEqual([
      ['card', 'card', 'card', 'card'],
      ['song'],
    ]);
  });

  it('全バッチの items を並べると manifest と同じ ID になる', () => {
    const { batches, manifest, stats } = buildManifest(SMALL);
    const ids = batches.flatMap((batch) => batch.items).map((item) => item.id);

    expect(ids).toHaveLength(stats.cardCount + stats.songCount);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(manifest.map((item) => item.id));
  });

  it('カード 3,376 / 楽曲 151 なら 36 バッチ（100 × 33 + 76、76 + 75）になる', () => {
    const { batches, stats } = buildManifest({
      // 3,376 枚のうち 2,893 枚がフル画像を持つ（残り 483 枚はサムネしかない）
      cardImageIds: CARD_IDS.slice(0, 2893),
      thumbImageIds: CARD_IDS,
      songImageIds: SONG_IDS,
      cardRows: CARD_IDS.slice(0, 2871).map((ID) => ({ ID: Number(ID) })),
      songRows: SONG_IDS.map((ID) => ({ ID: Number(ID) })),
    });

    expect(stats).toEqual({
      cardCount: 3376,
      songCount: 151,
      dbMatchedCardCount: 2871,
      orphanCardCount: 505,
    });
    expect(batches).toHaveLength(36);
    expect(batches.map((batch) => batch.items.length)).toEqual([
      ...Array.from({ length: 33 }, () => 100),
      76, // カードの残り
      76, // 楽曲の前半
      75, // 楽曲の残り
    ]);
    // バッチ名は 2 桁ゼロ埋め（batch-00 ... batch-35）
    expect(batches[9].name).toBe('batch-09');
    expect(batches[35].name).toBe('batch-35');
    expect(batches[35].out).toBe('tmp/image-alt/batch-35.jsonl');
  });
});
