#!/usr/bin/env node
/**
 * フルカード画像（800x1200, 1 枚あたり約 1.2MB）を、sub-agent が読むのに安い 512x768 へ縮小する。
 * 実行: node scripts/image-alt/scale-cards.mjs
 * 頻度: 必要時のみ（`build-manifest.mjs` のあとに 1 回走らせるだけ）
 *
 * 入力:
 *   - `tmp/image-alt/manifest.json`（`build-manifest.mjs` の出力）
 *   - `public/assets/cards/<id>.webp`
 * 出力:
 *   - `tmp/image-alt/scaled/cards/<id>.webp`（512x768 lossy webp）
 *   - stdout に変換件数
 *
 * Manifest のうち `readPath` が `tmp/image-alt/scaled/` 配下のものだけを変換する。`build-manifest.mjs` は
 * サムネしかないカードを `public/assets/th_cards/` に振り分けているので、この条件で対象は自動的に
 * フル画像を持つカードだけになる。
 *
 * `public/` の元画像には**書かない**（読み取るだけ）。元画像を書き換えると本番のカード画像が壊れる。
 * 出力は `tmp/` 配下なので、壊しても捨てて作り直せる。
 *
 * 縮小しても alt 記述に使える情報は残る。カードに印字されたキャラクター名はシートから取るので、
 * 顔・服装・背景の描画だけが残ればよく、それは 512x768 でも十分読める。
 */

import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { runPool } from '../lib/util.mjs';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

const MANIFEST_PATH = 'tmp/image-alt/manifest.json';
const SCALED_DIR = 'tmp/image-alt/scaled';
const FULL_CARD_DIR = 'public/assets/cards';

/** 入力 800x1200 と同じ 2:3 なので `fit: 'fill'` で比率が崩れない */
const TARGET_WIDTH = 512;
const TARGET_HEIGHT = 768;
const QUALITY = 80;

/** 同時実行数。2,893 枚を実測で 1 分強（sharp はプロセス内スレッドで並行に走る） */
const CONCURRENCY = 8;

/**
 * 1 枚を 512x768 の lossy webp にして `outPath` に書き出す。`srcPath` は読み取るだけ。
 * @param {string} srcPath 元画像の .webp パス
 * @param {string} outPath 書き込み先。`tmp/` 配下であること
 */
export async function scaleOne(srcPath, outPath) {
  await sharp(srcPath)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'fill' })
    .webp({ quality: QUALITY })
    .toFile(outPath);
}

/**
 * Manifest から変換対象（読み元と書き出し先）を集える。
 * サムネや楽曲のパス（`public/assets/...`）も Manifest に載っているが、ここでは対象外になる。
 * @returns {Promise<{src: string, out: string}[]>}
 */
async function collectTargets() {
  const manifest = JSON.parse(await readFile(resolve(PROJECT_ROOT, MANIFEST_PATH), 'utf8'));
  return manifest
    .filter((item) => item.readPath.startsWith(`${SCALED_DIR}/`))
    .map((item) => ({
      src: join(PROJECT_ROOT, FULL_CARD_DIR, basename(item.readPath)),
      out: resolve(PROJECT_ROOT, item.readPath),
    }));
}

async function main() {
  const targets = await collectTargets();
  // 出力先の親は Manifest の readPath が決めるので、変換前にまとめて作っておく
  const outDirs = [...new Set(targets.map((target) => dirname(target.out)))];
  await Promise.all(outDirs.map((dir) => mkdir(dir, { recursive: true })));
  console.error(`[scale-cards] ${targets.length} 枚を ${TARGET_WIDTH}x${TARGET_HEIGHT} に変換`);

  let done = 0;
  let lastLog = Date.now();
  await runPool(targets, CONCURRENCY, async ({ src, out }) => {
    await scaleOne(src, out);
    done++;
    if (done % 100 === 0 || done === targets.length || Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      console.error(`  ${done}/${targets.length} 変換済`);
    }
  });

  console.log(
    JSON.stringify({
      converted: targets.length,
      outDirs: outDirs.map((dir) => relative(PROJECT_ROOT, dir)),
    }),
  );
}

// import されただけでは走らない（テストは `scaleOne` だけを import する）
const isCli = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
