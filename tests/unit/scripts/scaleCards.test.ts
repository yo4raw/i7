import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { scaleOne } from '../../../scripts/image-alt/scale-cards.mjs';

// 実際にコミットされているフルカード画像（800x1200）。`public/` を書いていないことの検証に
// 実ファイルが要る。モックだと「元画像が無傷であること」が検証にならないため実 Sharp を使う
const SRC = resolve(import.meta.dirname, '../../../public/assets/cards/1000.webp');

// 2,893 枚を sub-agent が読むので、圧縮が外れて読むコストが跳ね上がるのを弾きたい。
// 同じ画像の 512x768 出力の実測値: quality 80 なら 34〜77KB / lossless なら 499KB。
// 200KB は quality 80 の観測最大値 77KB に対して余裕を保ちつつ、lossless だけを弾く上限
const MAX_OUTPUT_BYTES = 200_000;

describe('scaleOne', () => {
  let workDir = '';
  let outPath = '';
  let before: Stats;

  beforeAll(async () => {
    before = await stat(SRC);
    workDir = await mkdtemp(join(tmpdir(), 'i7-scale-cards-'));
    outPath = join(workDir, '1000.webp');
    await scaleOne(SRC, outPath);
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('フルカード画像を 512x768 の webp に変換する', async () => {
    const meta = await sharp(outPath).metadata();

    expect(meta).toMatchObject({ width: 512, height: 768, format: 'webp' });
  });

  it('変換後のファイルは元より小さく、lossy で圧縮されている', async () => {
    const out = await stat(outPath);

    expect(out.size).toBeLessThan(before.size);
    expect(out.size).toBeLessThan(MAX_OUTPUT_BYTES);
  });

  it('public/ の元画像には書き込まない（size も mtime も変わらない）', async () => {
    const after = await stat(SRC);

    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
