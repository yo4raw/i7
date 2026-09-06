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

/** MediaWiki API の作法に沿った連絡先入り User-Agent。空や `node` のままだと Miraheze が 403 の HTML を返す */
export const USER_AGENT = 'i7-song-fetcher/1.0 (+https://github.com/yo4raw/i7)';

const RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 2000;
const BODY_HEAD_CHARS = 200;

/** 失敗した応答を「HTTP 403 text/html: <!DOCTYPE html> ...」の形に要約する */
function describeResponse(res, body) {
  const head = body.slice(0, BODY_HEAD_CHARS).replaceAll(/\s+/g, ' ').trim();
  return `HTTP ${res.status} ${res.headers.get('content-type') ?? '(no content-type)'}: ${head}`;
}

/**
 * リトライ付き fetch（ADR 0075）。
 * ネットワーク例外・非 2xx・（json 指定時）JSON でない本文をすべて失敗とみなし、
 * 2 秒 → 4 秒 → 8 秒の指数バックオフで最大 3 回再試行する。
 * 使い切ったら最後の失敗理由（HTTP ステータス・Content-Type・本文先頭 200 字）を含む Error を投げる。
 * `fetchPng` とは契約が異なる（こちらは失敗で例外、fetchPng はステータスを返す）ので統合しない。
 * @param {string} url
 * @param {{ json?: boolean }} [opts] json=true なら本文を JSON.parse した結果を返す。省略時は ok な Response を返す
 */
export async function fetchRetry(url, { json = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) {
        throw new Error(describeResponse(res, await res.text().catch(() => '')));
      }
      if (!json) return res;
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`JSON でない応答: ${describeResponse(res, text)}`);
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`${RETRY_COUNT + 1} 回試行しても取得できません: ${url}\n  ${lastError.message}`, {
    cause: lastError,
  });
}
