#!/usr/bin/env node
/**
 * verify-card-images.mjs の出力を元に、差分のあったカード画像をコピー元
 * (i7.step-on-dream.net) から再取得してローカル (public/assets/) を上書きする。
 * 実行: node scripts/refetch-card-images.mjs --type th --from tmp/verify-th.json （詳細は下記 Usage）
 * 頻度: 必要時のみ（verify-card-images.mjs で不一致を検出したときの手動修復用）
 *
 * 安全のため、次の条件を満たすもののみ上書きする:
 *   - HTTP 200
 *   - 先頭 8 バイトが PNG マジック (HTML プレースホルダー除外)
 *   - リモートサイズが --min-remote-size 以上 (微小プレースホルダー除外)
 *   - ローカルと SHA-256 が異なる
 *
 * Usage:
 *   node scripts/refetch-card-images.mjs --type th --from tmp/verify-th.json
 *   node scripts/refetch-card-images.mjs --type th --ids 52,1818
 *   node scripts/refetch-card-images.mjs --type th --from tmp/verify-th.json --dry-run
 *
 * Options:
 *   --type <th|full>       th_cards または cards。既定: th
 *   --from <path>          verify の出力 JSON から mismatches を読む
 *   --ids <csv>            明示 ID リスト (--from と併用可)
 *   --min-remote-size <n>  このサイズ未満のリモートはプレースホルダーとしてスキップ。既定: 5000
 *   --force                placeholder 判定を無視して全件再取得
 *   --dry-run              実際には書き込まない
 *   --concurrency <n>      並列数。既定: 10
 *   --quiet                進捗を抑止
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
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

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPng = (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);

function parseArgs(argv) {
  const args = {
    type: 'th',
    concurrency: 10,
    minRemoteSize: 5000,
    force: false,
    dryRun: false,
    quiet: false,
    ids: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') args.type = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--ids') args.ids.push(...argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--min-remote-size') args.minRemoteSize = Number(argv[++i]);
    else if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') {
      console.log('See file header for usage.');
      process.exit(0);
    } else {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  if (!SOURCE_URLS[args.type]) {
    console.error(`Invalid --type: ${args.type}`);
    process.exit(1);
  }
  return args;
}

async function collectIds(args) {
  const ids = new Set(args.ids);
  if (args.from) {
    const data = JSON.parse(await readFile(args.from, 'utf8'));
    for (const m of data.mismatches ?? []) {
      // Only candidates worth re-fetching
      if (m.status === 'size_mismatch' || m.status === 'hash_mismatch') {
        ids.add(String(m.id));
      }
    }
  }
  return Array.from(ids).sort((a, b) => Number(a) - Number(b));
}

async function fetchRemote(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return { status: res.status };
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        status: 200,
        buf,
        size: buf.length,
        hash: createHash('sha256').update(buf).digest('hex'),
        isPng: isPng(buf),
      };
    } catch (err) {
      if (attempt === retries) return { status: 0, error: err.message };
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function localHash(path) {
  try {
    const buf = await readFile(path);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
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

async function processOne(id, args, localDir, urlPrefix) {
  const localPath = join(localDir, `${id}.png`);
  const url = `${urlPrefix}${id}.png`;
  const remote = await fetchRemote(url);

  if (remote.status !== 200) {
    return { id, action: 'skip_remote_error', remoteStatus: remote.status };
  }
  if (!remote.isPng) {
    return { id, action: 'skip_not_png', remoteSize: remote.size };
  }
  if (!args.force && remote.size < args.minRemoteSize) {
    return { id, action: 'skip_placeholder', remoteSize: remote.size };
  }

  const lHash = await localHash(localPath);
  if (lHash === remote.hash) {
    return { id, action: 'already_match', size: remote.size };
  }

  if (args.dryRun) {
    return { id, action: 'would_write', remoteSize: remote.size, localHash: lHash, remoteHash: remote.hash };
  }

  await writeFile(localPath, remote.buf);
  return { id, action: 'written', remoteSize: remote.size, localHash: lHash, remoteHash: remote.hash };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localDir = LOCAL_DIRS[args.type];
  const urlPrefix = SOURCE_URLS[args.type];

  const ids = await collectIds(args);
  if (ids.length === 0) {
    console.error('No IDs to process. Use --from <verify.json> or --ids <csv>.');
    process.exit(1);
  }

  if (!args.quiet) {
    console.error(
      `Refetching ${ids.length} ${args.type}_cards (dryRun=${args.dryRun}, force=${args.force}, minRemoteSize=${args.minRemoteSize})`,
    );
  }

  let done = 0;
  const lastLog = { t: Date.now() };
  const results = await runPool(ids, args.concurrency, async (id) => {
    const r = await processOne(id, args, localDir, urlPrefix);
    done++;
    if (!args.quiet && (done % 50 === 0 || done === ids.length || Date.now() - lastLog.t > 2000)) {
      lastLog.t = Date.now();
      console.error(`  ${done}/${ids.length} done`);
    }
    return r;
  });

  const summary = {};
  for (const r of results) summary[r.action] = (summary[r.action] ?? 0) + 1;

  console.log(
    JSON.stringify(
      {
        type: args.type,
        dryRun: args.dryRun,
        total: ids.length,
        summary,
        details: results,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
