/**
 * scripts/ 共通ユーティリティ。
 * 画像取得系スクリプト間で重複していた並列制御・PNG 判定・リトライ付き GET を集約する。
 */
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

/** 同時実行数を limit に抑えて worker を全 items に適用し、入力順の結果配列を返す */
export async function runPool(items, limit, worker) {
  const results = Array.from({ length: items.length });
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 先頭 8 バイトが PNG シグネチャかどうか */
export function isPng(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * GET でリモート画像を取得する。ネットワーク例外のみ線形バックオフでリトライし、
 * HTTP エラーはリトライせずステータスだけを返す（統合前の 2 実装と同じ方針）。
 * @returns {{status: number, buf?: Buffer, size?: number, hash?: string, etag?: string|null, isPng?: boolean, error?: string}}
 */
export async function fetchPng(url, retries = 2) {
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
        etag: res.headers.get('etag') ?? null,
        isPng: isPng(buf),
      };
    } catch (err) {
      if (attempt === retries) return { status: 0, error: err.message };
      await sleep(500 * (attempt + 1));
    }
  }
}
