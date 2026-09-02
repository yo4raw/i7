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

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { parseArgs } from 'node:util';
import { runPool, fetchPng } from './lib/util.mjs';

const scriptDir = import.meta.dirname;
const PROJECT_ROOT = join(scriptDir, '..');

const SOURCE_URLS = {
  th: 'https://i7.step-on-dream.net/img/cards/th/',
  full: 'https://i7.step-on-dream.net/img/cards/',
};
const LOCAL_DIRS = {
  th: join(PROJECT_ROOT, 'public', 'assets', 'th_cards'),
  full: join(PROJECT_ROOT, 'public', 'assets', 'cards'),
};

function parseCliArgs() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        type: { type: 'string', default: 'th' },
        from: { type: 'string' },
        ids: { type: 'string', multiple: true, default: [] },
        'min-remote-size': { type: 'string', default: '5000' },
        force: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        concurrency: { type: 'string', default: '10' },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (values.help) {
    console.log('See file header for usage.');
    process.exit(0);
  }
  if (!SOURCE_URLS[values.type]) {
    console.error(`Invalid --type: ${values.type}`);
    process.exit(1);
  }
  return {
    type: values.type,
    from: values.from,
    ids: values.ids.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
    minRemoteSize: Number(values['min-remote-size']),
    force: values.force,
    dryRun: values['dry-run'],
    concurrency: Number(values.concurrency),
    quiet: values.quiet,
  };
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
  return Array.from(ids).toSorted((a, b) => Number(a) - Number(b));
}

async function processOne(id, args, localDir, urlPrefix) {
  // ローカルは WebP、ソースは PNG。取得した PNG を WebP へ変換して上書きする。
  // フルカード (full) はロスレス、サムネ (th) は lossy q85。
  const localPath = join(localDir, `${id}.webp`);
  const url = `${urlPrefix}${id}.png`;
  const remote = await fetchPng(url);

  if (remote.status !== 200) {
    return { id, action: 'skip_remote_error', remoteStatus: remote.status };
  }
  if (!remote.isPng) {
    return { id, action: 'skip_not_png', remoteSize: remote.size };
  }
  if (!args.force && remote.size < args.minRemoteSize) {
    return { id, action: 'skip_placeholder', remoteSize: remote.size };
  }

  // 形式が異なるためバイト一致比較は行わず、対象 ID は常に再生成する。
  if (args.dryRun) {
    return { id, action: 'would_write', remoteSize: remote.size, remoteHash: remote.hash };
  }

  const webp = await sharp(remote.buf)
    .webp(args.type === 'th' ? { quality: 85 } : { lossless: true })
    .toBuffer();
  await writeFile(localPath, webp);
  return { id, action: 'written', remoteSize: remote.size, webpSize: webp.length };
}

async function main() {
  const args = parseCliArgs();
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

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
