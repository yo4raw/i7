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
 */
import { readFileSync, readdirSync } from 'node:fs';

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'i7.yo4raw.com';

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

const tag = process.env.TAG ?? '';
if (!/^v\d+\.\d+\.0$/.test(tag)) {
  console.log(`skip: ${tag || '(タグなし)'} は人手のリリース (vX.Y.0) ではない`);
  process.exit(0);
}

const key = findKey();
const urlList = sitemapUrls();
if (urlList.length === 0) throw new Error('dist/sitemap-0.xml から URL を取得できなかった');

const body = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${key}.txt`,
  urlList,
};

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

// 200 OK / 202 Accepted はどちらも受理。それ以外は本文を出して落とす
// (ワークフロー側で continue-on-error にしているのでデプロイは止まらない)
const text = await res.text();
console.log(`IndexNow: ${res.status} ${res.statusText} (${urlList.length} URLs)`);
if (!res.ok) {
  console.error(text.slice(0, 500));
  process.exit(1);
}
