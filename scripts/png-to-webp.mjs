#!/usr/bin/env node
/**
 * 指定ディレクトリ配下の *.png を WebP に変換し、変換成功後に元 PNG を削除する。
 * 既存画像の一括変換と、GitHub Actions のフェッチワークフロー（PNG 取得 → WebP 変換 → PNG 破棄）の
 * 両方から再利用する共通 CLI。
 *
 * 実行例:
 *   node scripts/png-to-webp.mjs public/assets/cards --lossless
 *   node scripts/png-to-webp.mjs public/assets/th_cards --quality 85
 *   node scripts/png-to-webp.mjs public/assets/songs --quality 85
 *
 * Options:
 *   --lossless        ロスレス WebP に変換（フルカード向け。劣化ゼロ）
 *   --quality <n>     lossy WebP の品質 0-100。既定: 85（サムネ・楽曲向け）
 *   --concurrency <n> 並列変換数。既定: 8
 *   --dry-run         変換・削除を行わず対象のみ表示
 *   --quiet           進捗ログを抑止
 *
 * 冪等性: 同じ basename の .webp が既に存在する PNG は変換済みとみなし、PNG だけを削除する。
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// ---------- 引数パース ----------
const args = process.argv.slice(2);
const dirs = [];
let lossless = false;
let quality = 85;
let concurrency = 8;
let dryRun = false;
let quiet = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--lossless') lossless = true;
  else if (a === '--quality') quality = Number(args[++i]);
  else if (a === '--concurrency') concurrency = Number(args[++i]);
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--quiet') quiet = true;
  else if (a.startsWith('--')) {
    console.error(`Unknown option: ${a}`);
    process.exit(1);
  } else dirs.push(a);
}

if (dirs.length === 0) {
  console.error('Usage: node scripts/png-to-webp.mjs <dir> [--lossless | --quality <n>] [--concurrency <n>] [--dry-run] [--quiet]');
  process.exit(1);
}
if (!lossless && (!Number.isFinite(quality) || quality < 1 || quality > 100)) {
  console.error(`Invalid --quality: ${quality}`);
  process.exit(1);
}

const log = (...m) => {
  if (!quiet) console.log(...m);
};

/** 並列実行を制限付きで実行 */
async function parallelLimit(items, limit, worker) {
  const results = [];
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await worker(items[cur], cur);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * 1 ファイルを変換。出力 webp を書き出してから元 PNG を削除する。
 * @returns {'converted'|'reused'|'failed'}
 */
async function convertOne(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp');
  try {
    if (existsSync(webpPath)) {
      // 既に変換済み → PNG だけ片付ける（冪等）
      if (!dryRun) await unlink(pngPath);
      return 'reused';
    }
    if (dryRun) return 'converted';
    const pipeline = sharp(pngPath).webp(lossless ? { lossless: true } : { quality });
    await pipeline.toFile(webpPath);
    // 出力が読み込み可能（壊れていない）ことを確認してから PNG を削除
    const meta = await sharp(webpPath).metadata();
    if (!meta.width || !meta.height) throw new Error('output webp has no dimensions');
    await unlink(pngPath);
    return 'converted';
  } catch (e) {
    console.error(`FAILED: ${pngPath}: ${e.message}`);
    // 失敗時は壊れた webp が残らないよう掃除（PNG は残す）
    try {
      if (!dryRun && existsSync(webpPath)) await unlink(webpPath);
    } catch {
      /* noop */
    }
    return 'failed';
  }
}

// ---------- メイン ----------
let totalConverted = 0;
let totalReused = 0;
let totalFailed = 0;

for (const dir of dirs) {
  if (!existsSync(dir) || !(await stat(dir)).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(1);
  }
  const entries = await readdir(dir);
  const pngs = entries.filter((n) => /\.png$/i.test(n)).map((n) => join(dir, n));
  const mode = lossless ? 'lossless' : `quality ${quality}`;
  log(`[${dir}] ${pngs.length} PNG → WebP (${mode})${dryRun ? ' [dry-run]' : ''}`);

  const results = await parallelLimit(pngs, concurrency, convertOne);
  const converted = results.filter((r) => r === 'converted').length;
  const reused = results.filter((r) => r === 'reused').length;
  const failed = results.filter((r) => r === 'failed').length;
  totalConverted += converted;
  totalReused += reused;
  totalFailed += failed;
  log(`[${dir}] converted=${converted} reused=${reused} failed=${failed}`);
}

log(`Done: converted=${totalConverted} reused=${totalReused} failed=${totalFailed}`);
if (totalFailed > 0) process.exit(1);
