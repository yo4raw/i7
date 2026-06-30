#!/usr/bin/env node
/**
 * ローカルのカード画像 (public/assets/cards | th_cards) と、コピー元サーバー
 * (i7.step-on-dream.net) のソース画像の整合性を検証する。
 * 実行: node scripts/verify-card-images.mjs [options] （結果は --out で JSON 出力し refetch-card-images.mjs に渡せる）
 * 頻度: 必要時のみ（ソース側の欠落・プレースホルダー混入が疑われるときの手動検証用）
 *
 * 注意: ローカルは WebP、ソースは PNG のためバイト/サイズの一致比較は成立しない。
 * 本ツールは「ローカル WebP の存在」と「ソース PNG が今も有効に取得できるか
 * (404・プレースホルダー(HTML)・非 PNG をソース異常として検出)」を検証する。
 *
 * - デフォルトは HEAD でソース PNG の到達性のみ確認（高速）
 * - --hash で GET してソース PNG の実体まで確認（非 PNG/プレースホルダー検出、重い）
 *
 * Usage:
 *   node scripts/verify-card-images.mjs [options]
 *
 * Options:
 *   --type <th|full>       'th' (th_cards) または 'full' (cards)。既定: th
 *   --hash                 GET でソース PNG 本体を取得し実体が PNG か確認する
 *   --concurrency <n>      並列リクエスト数。既定: 10
 *   --ids <csv>            特定 ID のみ検証 (例: --ids 100,200,3688)
 *   --limit <n>            先頭 n 件のみ検証
 *   --out <path>           結果 JSON を書き出す
 *   --quiet                進捗出力を抑止
 */

import { readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const SOURCE_URLS = {
  th: 'https://i7.step-on-dream.net/img/cards/th/',
  full: 'https://i7.step-on-dream.net/img/cards/',
};
const LOCAL_DIRS = {
  th: join(PROJECT_ROOT, 'public', 'assets', 'th_cards'),
  full: join(PROJECT_ROOT, 'public', 'assets', 'cards'),
};

function parseArgs(argv) {
  const args = { type: 'th', concurrency: 10, hash: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') args.type = argv[++i];
    else if (a === '--hash') args.hash = true;
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a === '--ids') args.ids = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') {
      console.log(getHelpText());
      process.exit(0);
    } else {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  if (!SOURCE_URLS[args.type]) {
    console.error(`Invalid --type: ${args.type} (must be 'th' or 'full')`);
    process.exit(1);
  }
  return args;
}

function getHelpText() {
  return `verify-card-images.mjs — ローカルカード画像とコピー元の一致検証

Options:
  --type <th|full>       th_cards または cards。既定: th
  --hash                 GET でソース PNG 本体を取得し実体が PNG か確認（重い）
  --concurrency <n>      並列数。既定: 10
  --ids <csv>            特定 ID のみ検証
  --limit <n>            先頭 n 件のみ検証
  --out <path>           結果 JSON を書き出す
  --quiet                進捗出力を抑止
`;
}

async function listLocalIds(dir) {
  const entries = await readdir(dir);
  return entries
    .filter((n) => /^\d+\.webp$/.test(n))
    .map((n) => n.replace(/\.webp$/, ''))
    .sort((a, b) => Number(a) - Number(b));
}

async function headRemote(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return {
        status: res.status,
        size: res.headers.get('content-length') ? Number(res.headers.get('content-length')) : null,
        etag: res.headers.get('etag') ?? null,
        lastModified: res.headers.get('last-modified') ?? null,
      };
    } catch (err) {
      if (attempt === retries) return { status: 0, error: err.message };
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

async function getRemote(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return { status: res.status };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        status: 200,
        size: buf.length,
        hash: createHash('sha256').update(buf).digest('hex'),
        etag: res.headers.get('etag') ?? null,
        isPng: isPng(buf),
      };
    } catch (err) {
      if (attempt === retries) return { status: 0, error: err.message };
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ローカルは WebP、ソースは PNG のためバイト/サイズの一致比較は成立しない。
// ここでは「ローカル WebP が存在し、かつソース PNG が今も有効に取得できるか」を検証する
// （404・プレースホルダー(HTML)・非 PNG をソース側の異常として検出する）。
async function verifyOne(id, args, localDir, urlPrefix) {
  const localPath = join(localDir, `${id}.webp`);
  let localSize;
  try {
    localSize = (await stat(localPath)).size;
  } catch {
    return { id, status: 'local_missing' };
  }
  const url = `${urlPrefix}${id}.png`;

  if (args.hash) {
    // GET でソース PNG 本体を取得し、実体が PNG であることまで確認する。
    const remote = await getRemote(url);
    if (remote.status !== 200) {
      return { id, status: 'remote_error', remoteStatus: remote.status, localSize };
    }
    if (!remote.isPng) {
      return { id, status: 'remote_not_png', localSize, remoteSize: remote.size };
    }
    return { id, status: 'ok', localSize, remoteSize: remote.size };
  }

  const remote = await headRemote(url);
  if (remote.status !== 200) {
    return { id, status: 'remote_error', remoteStatus: remote.status, localSize };
  }
  return { id, status: 'ok', localSize, remoteSize: remote.size };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localDir = LOCAL_DIRS[args.type];
  const urlPrefix = SOURCE_URLS[args.type];

  let ids = args.ids ?? (await listLocalIds(localDir));
  if (args.limit) ids = ids.slice(0, args.limit);

  if (!args.quiet) {
    console.error(`Verifying ${ids.length} ${args.type}_cards against ${urlPrefix}`);
    console.error(
      `Mode: ${args.hash ? 'GET (validate source PNG body)' : 'HEAD (source availability)'}, concurrency=${args.concurrency}`,
    );
  }

  let done = 0;
  const lastLog = { t: Date.now() };
  const results = await runPool(ids, args.concurrency, async (id) => {
    const r = await verifyOne(id, args, localDir, urlPrefix);
    done++;
    if (!args.quiet && (done % 100 === 0 || done === ids.length || Date.now() - lastLog.t > 2000)) {
      lastLog.t = Date.now();
      console.error(`  ${done}/${ids.length} done`);
    }
    return r;
  });

  const summary = { ok: 0, local_missing: 0, remote_not_png: 0, remote_error: 0 };
  const mismatches = [];
  for (const r of results) {
    summary[r.status] = (summary[r.status] ?? 0) + 1;
    if (r.status !== 'ok') mismatches.push(r);
  }

  console.log(JSON.stringify({ type: args.type, total: ids.length, summary, mismatches }, null, 2));

  if (args.out) {
    await writeFile(args.out, JSON.stringify({ type: args.type, total: ids.length, summary, mismatches }, null, 2));
    if (!args.quiet) console.error(`Wrote ${args.out}`);
  }

  if (mismatches.length > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
