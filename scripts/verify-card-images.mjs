#!/usr/bin/env node
/**
 * ローカルのカード画像がコピー元サーバーと一致するかを網羅的に検証する。
 *
 * - デフォルトは Content-Length 比較（HEAD のみ）で高速にサイズ不一致を検出
 * - --hash で全ファイルを GET して SHA-256 比較（厳密だが重い）
 *
 * Usage:
 *   node scripts/verify-card-images.mjs [options]
 *
 * Options:
 *   --type <th|full>       'th' (th_cards) または 'full' (cards)。既定: th
 *   --hash                 サイズ一致でも内容を SHA-256 で比較する
 *   --hash-on-match        サイズ一致した分のみ追加で SHA-256 比較
 *   --concurrency <n>      並列リクエスト数。既定: 10
 *   --ids <csv>            特定 ID のみ検証 (例: --ids 100,200,3688)
 *   --limit <n>            先頭 n 件のみ検証
 *   --out <path>           結果 JSON を書き出す
 *   --quiet                進捗出力を抑止
 */

import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
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
  const args = { type: 'th', concurrency: 10, hash: false, hashOnMatch: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') args.type = argv[++i];
    else if (a === '--hash') args.hash = true;
    else if (a === '--hash-on-match') args.hashOnMatch = true;
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
  --hash                 全ファイルを SHA-256 比較（重い）
  --hash-on-match        サイズ一致分のみ SHA-256 で追加検証（推奨）
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
    .filter((n) => /^\d+\.png$/.test(n))
    .map((n) => n.replace(/\.png$/, ''))
    .sort((a, b) => Number(a) - Number(b));
}

async function sha256OfFile(path) {
  const buf = await readFile(path);
  return { hash: createHash('sha256').update(buf).digest('hex'), size: buf.length };
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

async function verifyOne(id, args, localDir, urlPrefix) {
  const localPath = join(localDir, `${id}.png`);
  const localStat = await stat(localPath);
  const localSize = localStat.size;
  const url = `${urlPrefix}${id}.png`;

  if (args.hash) {
    const [local, remote] = await Promise.all([sha256OfFile(localPath), getRemote(url)]);
    if (remote.status !== 200) {
      return { id, status: 'remote_error', remoteStatus: remote.status, localSize };
    }
    if (!remote.isPng) {
      return {
        id,
        status: 'remote_not_png',
        localSize: local.size,
        remoteSize: remote.size,
        remoteHash: remote.hash,
      };
    }
    if (local.hash !== remote.hash) {
      return {
        id,
        status: 'hash_mismatch',
        localSize: local.size,
        remoteSize: remote.size,
        localHash: local.hash,
        remoteHash: remote.hash,
      };
    }
    return { id, status: 'ok', size: local.size };
  }

  const remote = await headRemote(url);
  if (remote.status !== 200) {
    return { id, status: 'remote_error', remoteStatus: remote.status, localSize };
  }
  if (remote.size !== null && remote.size !== localSize) {
    return {
      id,
      status: 'size_mismatch',
      localSize,
      remoteSize: remote.size,
      etag: remote.etag,
    };
  }

  if (args.hashOnMatch) {
    const [local, remoteFull] = await Promise.all([sha256OfFile(localPath), getRemote(url)]);
    if (remoteFull.status !== 200) {
      return { id, status: 'remote_error', remoteStatus: remoteFull.status, localSize };
    }
    if (!remoteFull.isPng) {
      return {
        id,
        status: 'remote_not_png',
        localSize: local.size,
        remoteSize: remoteFull.size,
        remoteHash: remoteFull.hash,
      };
    }
    if (local.hash !== remoteFull.hash) {
      return {
        id,
        status: 'hash_mismatch',
        localSize: local.size,
        remoteSize: remoteFull.size,
        localHash: local.hash,
        remoteHash: remoteFull.hash,
      };
    }
  }

  return { id, status: 'ok', size: localSize };
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
      `Mode: ${args.hash ? 'full hash' : args.hashOnMatch ? 'size + hash-on-match' : 'size only'}, concurrency=${args.concurrency}`,
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

  const summary = { ok: 0, size_mismatch: 0, hash_mismatch: 0, remote_not_png: 0, remote_error: 0 };
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
