#!/usr/bin/env node
/**
 * IndexNow へサイトの更新を通知する (ADR 0063)。
 *
 * Google のクロールが枯れている状況で、Bing / DuckDuckGo / Yandex という
 * 別経路のインデックスを確保するために使う。
 *
 * 毎時の cron 取り込み (PATCH タグ) では送らない。246 URL を毎時通知するのは
 * IndexNow のガイドライン上スパムとみなされうるため、人手のリリース
 * (MINOR 以上 = `vX.Y.0`、ADR 0059) のときだけ送る。
 *
 * キーは秘密情報ではない。`https://<host>/<key>.txt` で公開して所有証明にする
 * 仕組みなので、`public/` に平文で置いてリポジトリに含めている。
 *
 * 環境変数:
 *   TAG      送信対象を判定するリリースタグ (例: v1.65.0)
 *   DRY_RUN  1 なら送信直前で止める (動作確認用)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'i7.yo4raw.com';

// Cloudflare へのデプロイ完了からアセットが行き渡るまでにはラグがあり、
// キーファイルが配信される前に送ると IndexNow は所有証明に失敗して
// 403 SiteVerificationNotCompleted を返す (v1.65.0 のリリースで実際に発生)。
// 配信を確認してから送り、それでも検証が伝播していなければ間を空けて再送する。
const VERIFY_ATTEMPTS = 6;
const VERIFY_INTERVAL_MS = 15_000;
const SEND_ATTEMPTS = 3;
const SEND_INTERVAL_MS = 30_000;

/** `public/` 直下の `<32桁hex>.txt` を IndexNow のキーファイルとみなす */
function findKey() {
  const files = readdirSync('public').filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (files.length !== 1) {
    throw new Error(`public/ の IndexNow キーファイルが 1 個ではない: ${files.length} 個`);
  }
  const key = files[0].replace(/\.txt$/, '');
  const content = readFileSync(`public/${files[0]}`, 'utf8').trim();
  if (content !== key) {
    throw new Error(`キーファイルの中身がファイル名と一致しない: ${files[0]}`);
  }
  return key;
}

function sitemapUrls() {
  const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/** 本番からキーファイルが配信されるまで待つ */
async function waitForKeyFile(keyLocation, key) {
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(keyLocation, { cache: 'no-store' });
      if (res.ok && (await res.text()).trim() === key) {
        console.log(`キーファイルの配信を確認 (${attempt} 回目)`);
        return true;
      }
      console.log(`キーファイル未配信 (${attempt}/${VERIFY_ATTEMPTS}): HTTP ${res.status}`);
    } catch (error) {
      console.log(`キーファイル取得に失敗 (${attempt}/${VERIFY_ATTEMPTS}): ${error.message}`);
    }
    if (attempt < VERIFY_ATTEMPTS) await sleep(VERIFY_INTERVAL_MS);
  }
  return false;
}

const tag = process.env.TAG ?? '';
if (!/^v\d+\.\d+\.0$/.test(tag)) {
  console.log(`skip: ${tag || '(タグなし)'} は人手のリリース (vX.Y.0) ではない`);
  process.exit(0);
}

const key = findKey();
const keyLocation = `https://${HOST}/${key}.txt`;
const urlList = sitemapUrls();
if (urlList.length === 0) throw new Error('dist/sitemap-0.xml から URL を取得できなかった');

if (!(await waitForKeyFile(keyLocation, key))) {
  console.error(`キーファイルが配信されていないため送信しない: ${keyLocation}`);
  process.exit(1);
}

const body = { host: HOST, key, keyLocation, urlList };

if (process.env.DRY_RUN === '1') {
  console.log(`DRY_RUN: 送信せず終了 (${urlList.length} URLs, ${JSON.stringify(body).length} bytes)`);
  process.exit(0);
}

for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`IndexNow: ${res.status} ${res.statusText} (${urlList.length} URLs)`);

  // 200 OK / 202 Accepted はどちらも受理
  if (res.ok) process.exit(0);

  // 所有証明の伝播待ちだけ再試行する。それ以外の失敗は繰り返しても通らない
  const verificationPending = res.status === 403 && text.includes('SiteVerificationNotCompleted');
  if (!verificationPending || attempt === SEND_ATTEMPTS) {
    console.error(text.slice(0, 500));
    process.exit(1);
  }
  console.log(`所有証明の伝播待ち。${SEND_INTERVAL_MS / 1000} 秒後に再送 (${attempt}/${SEND_ATTEMPTS})`);
  await sleep(SEND_INTERVAL_MS);
}
