import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkBatches, parseBatch } from '../../../scripts/image-alt/merge-visual.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(
  new URL('../../../scripts/image-alt/merge-visual.mjs', import.meta.url),
);

// 生成の目標長 40〜70 文字より短いが、強制境界（10〜200 文字）は満たす
const CARD_V_1000 = '夕暮れの屋上で、スカートの少女が持ったマフラーを風に翻されている';
const CARD_V_1001 = '夜の高速道路の橋の上で、レースウェア姿の青年が両手を大きく広げて跳ねている';
const SONG_V_100 = '幾何学模様の背景に、重なる人物の名前が英字で添えられている';

/** 1 行 1 レコードの JSONL テキスト（sub-agent が書き出すのと同じ書式） */
const jsonl = (records: object[]) => `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

/** 件数だけ合わせたいときのダミー JSONL（`checkBatches` は内容を見ず件数しか数えない） */
const dummyJsonl = (count: number) =>
  `${Array.from({ length: count }, (_, i) => `{"kind":"card","id":${i},"v":"あ"}`).join('\n')}\n`;

describe('parseBatch', () => {
  it('数値 id を文字列に正規化してレコード 1 件にする', () => {
    // sub-agent が `{"id":1000}` と書くとキーが "1000" になり、網羅性検査が全件欠落と誤報する
    const { records, errors } = parseBatch(
      '{}\n{"kind":"card","id":1000,"v":"あ"}\n',
    );

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('1000');
    expect(errors).toEqual([]);
  });

  it('JSON として壊れた行はレコードにせず errors に積む', () => {
    const { records, errors } = parseBatch('not json\n');

    expect(records).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('1 行目');
  });

  it('JSON オブジェクトでない行は errors に積む', () => {
    const { records, errors } = parseBatch('["1000"]\n');

    expect(records).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('1 行目');
  });

  it('空ファイルはエラーではなく 0 件として扱う（空の検出は checkBatches の責務）', () => {
    expect(parseBatch('')).toEqual({ records: [], errors: [] });
  });

  it('末尾に改行が無くても 1 行を 1 件として読む', () => {
    const { records, errors } = parseBatch('{"kind":"card","id":"1000","v":"あ"}');

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('1000');
    expect(errors).toEqual([]);
  });
});

const cardBatch = (name: string, ids: string[]) => ({
  name,
  out: `tmp/image-alt/${name}.jsonl`,
  items: ids.map((id) => ({ kind: 'card' as const, id })),
});

/** `out` パス -> 本文 のマップから作る読み出し関数（ファイルには触れない） */
const reader = (files: Record<string, string>) => (out: string) => files[out] ?? null;

describe('checkBatches', () => {
  it('全バッチのファイルが存在し件数が合うなら違反 0 件', () => {
    const batches = [cardBatch('batch-00', ['1000', '1001']), cardBatch('batch-01', ['1002'])];
    const files = {
      'tmp/image-alt/batch-00.jsonl': dummyJsonl(2),
      'tmp/image-alt/batch-01.jsonl': dummyJsonl(1),
    };

    expect(checkBatches(batches, reader(files))).toEqual([]);
  });

  it('1 バッチだけファイルが無いなら、その name を含む違反 1 件', () => {
    const batches = [cardBatch('batch-00', ['1000']), cardBatch('batch-01', ['1001'])];
    const files = { 'tmp/image-alt/batch-00.jsonl': dummyJsonl(1) };

    const violations = checkBatches(batches, reader(files));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('batch-01');
  });

  it('ファイルが存在しても 0 件なら違反（空ファイルは書いたとみなさない）', () => {
    const batches = [cardBatch('batch-00', ['1000']), cardBatch('batch-01', ['1001'])];
    const files = {
      'tmp/image-alt/batch-00.jsonl': '',
      'tmp/image-alt/batch-01.jsonl': '',
    };

    const violations = checkBatches(batches, reader(files));

    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('batch-00');
    expect(violations[1]).toContain('batch-01');
  });

  it('1 バッチだけ件数が items.length より少ないなら違反', () => {
    const batches = [cardBatch('batch-00', ['1000']), cardBatch('batch-01', ['1001', '1002'])];
    const files = {
      'tmp/image-alt/batch-00.jsonl': dummyJsonl(1),
      'tmp/image-alt/batch-01.jsonl': dummyJsonl(1),
    };

    const violations = checkBatches(batches, reader(files));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('batch-01');
    expect(violations[0]).toContain('1 件で、期待する 2 件');
  });
});

/**
 * `merge-visual.mjs` を実際の作業ディレクトリに対して走らせる。
 * 実データは sub-agent の出力待ちなので、`IMAGE_ALT_ROOT` で一時ディレクトリに差し替える。
 * exit≠0 でも例外にしない（違反の列挙を検証したいので）。
 */
const runMerge = async (root: string) => {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT_PATH], {
      env: { ...process.env, IMAGE_ALT_ROOT: root },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const failure = err as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
};

describe('merge-visual.mjs', () => {
  let root: string;

  /**
   * カード 2 枚（1000 / 1001）と楽曲 1 枚（100）を 2 バッチに分けた作業ディレクトリを作る。
   * `build-manifest.mjs` は 1 バッチに 1 種別しか入れない。
   * 画像本体は読まれない（ID の走査だけ）ので空ファイルでよい。
   */
  const setupWorkspace = async () => {
    await mkdir(join(root, 'tmp/image-alt'), { recursive: true });
    await mkdir(join(root, 'src/data'), { recursive: true });
    await mkdir(join(root, 'public/assets/th_cards'), { recursive: true });
    await mkdir(join(root, 'public/assets/songs'), { recursive: true });

    const batches = [
      {
        name: 'batch-00',
        out: 'tmp/image-alt/batch-00.jsonl',
        items: [
          { kind: 'card', id: '1000' },
          { kind: 'card', id: '1001' },
        ],
      },
      { name: 'batch-01', out: 'tmp/image-alt/batch-01.jsonl', items: [{ kind: 'song', id: '100' }] },
    ];
    await writeFile(join(root, 'tmp/image-alt/batches.json'), JSON.stringify(batches), 'utf-8');

    for (const id of ['1000', '1001']) {
      await writeFile(join(root, `public/assets/th_cards/${id}.webp`), '');
    }
    await writeFile(join(root, 'public/assets/songs/100.webp'), '');
  };

  const writeBatch = (name: string, text: string) =>
    writeFile(join(root, `tmp/image-alt/${name}.jsonl`), text, 'utf-8');

  const readCatalog = () => readFile(join(root, 'src/data/image-visual.json'), 'utf-8');

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'i7-merge-visual-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('数値 id も、種別はファイル由来で振り分けられ、n は cards にだけ残って 2 スペースで書かれる', async () => {
    await setupWorkspace();
    // id は数値で書く。sub-agent が `{"id":1000}` と書くことがあるため
    await writeBatch('batch-00', jsonl([
      { kind: 'card', id: 1000, v: CARD_V_1000, n: 'Yuki Aoi' },
      { kind: 'card', id: 1001, v: CARD_V_1001 },
    ]));
    // songs 側に n が混ざっていても引き継がない
    await writeBatch('batch-01', jsonl([{ kind: 'song', id: '100', v: SONG_V_100, n: 'iam-a-song' }]));

    const { code, stdout } = await runMerge(root);

    expect(code).toBe(0);
    expect(await readCatalog()).toBe(
      `${JSON.stringify(
        {
          cards: {
            '1000': { v: CARD_V_1000, n: 'Yuki Aoi' },
            '1001': { v: CARD_V_1001 },
          },
          songs: { '100': { v: SONG_V_100 } },
        },
        null,
        2,
      )}\n`,
    );
    expect(JSON.parse(stdout)).toEqual({ cardCount: 2, songCount: 1, cardWithNameCount: 1 });
  });

  it('バッチのファイルが 1 本でも無ければその name を列挙して exit≠0（中途半端なカタログは書かない）', async () => {
    await setupWorkspace();
    await writeBatch('batch-00', jsonl([
      { kind: 'card', id: 1000, v: CARD_V_1000 },
      { kind: 'card', id: 1001, v: CARD_V_1001 },
    ]));

    const { code, stderr } = await runMerge(root);

    expect(code).not.toBe(0);
    expect(stderr).toContain('batch-01: ファイルが無い');
    await expect(readCatalog()).rejects.toThrow();
  });

  it('空バッチがあれば違反を列挙して exit≠0', async () => {
    await setupWorkspace();
    await writeBatch('batch-00', jsonl([
      { kind: 'card', id: 1000, v: CARD_V_1000 },
      { kind: 'card', id: 1001, v: CARD_V_1001 },
    ]));
    await writeBatch('batch-01', '');

    const { code, stderr } = await runMerge(root);

    expect(code).not.toBe(0);
    expect(stderr).toContain('batch-01: ファイルが空です');
  });

  it('同じ ID が複数のバッチにあれば id を列挙して exit≠0（後のバッチで黙って上書きしない）', async () => {
    await setupWorkspace();
    // 1001 を 2 度書いて、件数は 2 のまま実画像 ID は 1 件欠落させる
    await writeBatch('batch-00', jsonl([
      { kind: 'card', id: 1000, v: CARD_V_1000 },
      { kind: 'card', id: 1000, v: CARD_V_1001 },
    ]));
    await writeBatch('batch-01', jsonl([{ kind: 'song', id: '100', v: SONG_V_100 }]));

    const { code, stderr } = await runMerge(root);

    expect(code).not.toBe(0);
    expect(stderr).toContain('cards 1000: 同じ ID が複数のバッチに重複しています');
    await expect(readCatalog()).rejects.toThrow();
  });

  it('v が強制境界を外れるレコードがあれば id を列挙して exit≠0', async () => {
    await setupWorkspace();
    await writeBatch('batch-00', jsonl([
      { kind: 'card', id: 1000, v: CARD_V_1000 },
      { kind: 'card', id: 1001, v: '短い' },
    ]));
    await writeBatch('batch-01', jsonl([{ kind: 'song', id: '100', v: SONG_V_100 }]));

    const { code, stderr } = await runMerge(root);

    expect(code).not.toBe(0);
    expect(stderr).toContain('card 1001');
    await expect(readCatalog()).rejects.toThrow();
  });
});
