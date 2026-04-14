#!/usr/bin/env node
/**
 * IDOLiSH7 Wiki から楽曲カバー画像をクローリングし、
 * Google Spreadsheet の楽曲IDをファイル名として保存するスクリプト。
 *
 * Usage: node scripts/fetch-song-images.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------- 定数 ----------
const WIKI_API = 'https://idolish7.miraheze.org/w/api.php';
const SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';
const SONGS_GID = 1083871743;
const OUTPUT_DIR = join(import.meta.dirname, '..', 'public', 'assets', 'songs');
const BATCH_SIZE = 50; // MediaWiki API のバッチ上限
const CONCURRENCY = 5; // 同時ダウンロード数

// GSheet song_name → Wiki page name の手動オーバーライド
// 自動マッチできない曲 (表記ゆれ・タイポ・日本語/ローマ字差異) を解決
const MANUAL_OVERRIDES = {
  'Last Dimention': 'Last Dimension',
  'NATSU☆しようぜ！（TRIGGER）': 'NATSU☆Shiyouze! (TRIGGER Version)',
  'HELLO CALiNG': 'HELLO CALLiNG',
  'Welcome Future World!!!': 'Welcome, Future World!!!',
  'Bang! Bang! Bang!': 'Bang!Bang!Bang!',
  'NEVER LOSE,MY RULE': 'NEVER LOSE, MY RULE',
  'Now&Then': 'Now & Then',
  'DiSCOVER FUTURE': 'DiSCOVER THE FUTURE',
  'Dancing∞BEAT': 'Dancing∞BEAT!!',
  'Boys&Girls': 'Boys & Girls',
  'Viva! Fantastiic Life!!!!!!!': 'Viva! Fantastic Life!!!!!!!',
  'miss you': 'Miss you...',
  '男子タルモノ!~MATSURI~': 'Danshi Tarumono! ~MATSURI~',
  'ナナツイロREALiZE': 'Nanatsuiro REALiZE',
  'NATSU☆しようぜ！（IDOLiSH7）': 'NATSU☆Shiyouze! (IDOLiSH7 Version)',
  'Tears Over ~この星の君と~': 'Tears Over ~Kono Hoshi no Kimi to~',
  'Wonderful Octave-IDOLiSH7 Ver.-': 'Wonderful Octave -IDOLiSH7 ver.-',
  'Wonderful Octave-Re:vale ver.-': 'Wonderful Octave -Re:vale ver.-',
  'Pieces of The Wolrd': 'Pieces of The World',
};

// ---------- ユーティリティ ----------

/** 配列を指定サイズのチャンクに分割 */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** 並列実行を制限付きで実行 */
async function parallelLimit(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = task().then((r) => { executing.delete(p); return r; });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/** fetch + リトライ (1回) */
async function fetchWithRetry(url, opts = {}, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (i === retries) return res;
    } catch (e) {
      if (i === retries) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ---------- Step 1: Wiki 楽曲一覧取得 (Cargo API) ----------

async function fetchWikiSongPages() {
  console.log('[1/6] Wiki楽曲一覧を取得中...');
  const params = new URLSearchParams({
    action: 'cargoquery',
    tables: 'Songs',
    fields: '_pageName=Page,display_title',
    limit: '500',
    format: 'json',
  });
  const res = await fetchWithRetry(`${WIKI_API}?${params}`);
  const data = await res.json();
  // ユニークなページ名のみ取得
  const pages = new Map();
  for (const entry of data.cargoquery) {
    const page = entry.title.Page;
    if (!pages.has(page)) {
      pages.set(page, entry.title['display title']);
    }
  }
  console.log(`  → ${pages.size} ユニーク楽曲ページ`);
  return pages; // Map<pageName, displayTitle>
}

// ---------- Step 2: Wikitext 解析 (Revisions API) ----------

/**
 * wikitext から Japanese, Translation, Image を抽出
 */
function parseWikitext(wikitext) {
  const get = (key) => {
    const m = wikitext.match(new RegExp(`\\|${key}\\s*=\\s*(.*)`));
    if (!m) return null;
    // HTMLタグ除去 (<span lang="ja">...</span> 等)
    const val = m[1].trim().replace(/<[^>]+>/g, '').trim();
    // ref タグの内容除去
    return val.replace(/\[.*?\]/g, '').trim() || null;
  };
  return {
    japanese: get('Japanese'),
    translation: get('Translation'),
    image: get('Image'),
  };
}

async function fetchWikitextBatch(pageNames) {
  const titles = pageNames.join('|');
  const params = new URLSearchParams({
    action: 'query',
    titles,
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    format: 'json',
  });
  const res = await fetchWithRetry(`${WIKI_API}?${params}`);
  const data = await res.json();
  const result = new Map();
  if (!data.query?.pages) return result;
  for (const page of Object.values(data.query.pages)) {
    if (page.missing !== undefined) continue;
    const content = page.revisions?.[0]?.slots?.main?.['*'];
    if (!content) continue;
    result.set(page.title, parseWikitext(content));
  }
  return result;
}

async function fetchAllWikitext(pageNames) {
  console.log('[2/6] Wikitextを解析中...');
  const batches = chunk([...pageNames], BATCH_SIZE);
  const allData = new Map();
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  → バッチ ${i + 1}/${batches.length} (${batch.length}ページ)\r`);
    const batchResult = await fetchWikitextBatch(batch);
    for (const [k, v] of batchResult) allData.set(k, v);
    // レート制限対策
    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`\n  → ${allData.size} ページのwikitext取得完了`);
  return allData; // Map<pageName, {japanese, translation, image}>
}

// ---------- Step 3: GSheet 楽曲データ取得 ----------

async function fetchGSheetSongs() {
  console.log('[3/6] Google Spreadsheetから楽曲データを取得中...');
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${SONGS_GID}&tq=${encodeURIComponent('SELECT A,D')}`;
  const res = await fetchWithRetry(url);
  const text = await res.text();
  // JSONP ラッパーを除去
  const jsonStr = text.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, '');
  const data = JSON.parse(jsonStr);
  const songs = [];
  for (const row of data.table.rows) {
    const id = row.c?.[0]?.v;
    const name = row.c?.[1]?.v;
    if (id != null && name != null) {
      songs.push({ id: Math.round(id), name });
    }
  }
  console.log(`  → ${songs.length} 楽曲`);
  return songs; // [{id, name}]
}

// ---------- Step 4: 名前マッピング構築 ----------

function buildMapping(gsheetSongs, wikiData, wikiPages) {
  console.log('[4/6] マッピングを構築中...');

  // Wiki側: japanese/display_title/translation → pageName のインデックス
  const jpIndex = new Map();    // japanese → pageName
  const titleIndex = new Map(); // display_title (pageName) → pageName
  const transIndex = new Map(); // translation → pageName

  for (const [pageName, info] of wikiData) {
    if (info.japanese) jpIndex.set(info.japanese, pageName);
    titleIndex.set(pageName, pageName);
    if (info.translation) transIndex.set(info.translation, pageName);
  }

  const mapped = [];     // [{id, pageName, image, matchType}]
  const unmapped = [];   // [{id, name}]

  for (const song of gsheetSongs) {
    const name = song.name;
    let pageName = null;
    let matchType = '';

    // 0. 手動オーバーライド
    if (MANUAL_OVERRIDES[name]) {
      const override = MANUAL_OVERRIDES[name];
      if (titleIndex.has(override)) {
        pageName = override;
        matchType = 'override';
      }
    }
    // 1. Japanese フィールドとの完全一致
    if (!pageName && jpIndex.has(name)) {
      pageName = jpIndex.get(name);
      matchType = 'japanese';
    }
    // 2. display_title (ページ名) との完全一致
    if (!pageName && titleIndex.has(name)) {
      pageName = titleIndex.get(name);
      matchType = 'title';
    }
    // 3. Translation フィールドとの完全一致
    if (!pageName && transIndex.has(name)) {
      pageName = transIndex.get(name);
      matchType = 'translation';
    }
    // 4. 大文字小文字無視でのマッチ
    if (!pageName) {
      const lower = name.toLowerCase();
      for (const [key, val] of titleIndex) {
        if (key.toLowerCase() === lower) {
          pageName = val;
          matchType = 'title-ci';
          break;
        }
      }
      if (!pageName) {
        for (const [key, val] of transIndex) {
          if (key && key.toLowerCase() === lower) {
            pageName = val;
            matchType = 'translation-ci';
            break;
          }
        }
      }
    }

    if (pageName) {
      const info = wikiData.get(pageName);
      const image = info?.image || `${pageName}.png`;
      mapped.push({ id: song.id, name: song.name, pageName, image, matchType });
    } else {
      unmapped.push(song);
    }
  }

  console.log(`  → マッチ成功: ${mapped.length}, 未マッチ: ${unmapped.length}`);
  if (unmapped.length > 0) {
    console.log('  ⚠ 未マッチ楽曲:');
    for (const s of unmapped) {
      console.log(`    ID=${s.id}: ${s.name}`);
    }
  }

  return { mapped, unmapped };
}

// ---------- Step 5: 画像URL取得 (Imageinfo API) ----------

async function fetchImageUrls(imageFilenames) {
  console.log('[5/6] 画像URLを取得中...');
  const uniqueImages = [...new Set(imageFilenames)];
  const fileTitles = uniqueImages.map((f) => `File:${f}`);
  const batches = chunk(fileTitles, BATCH_SIZE);
  const urlMap = new Map(); // imageFilename (元の名前) → url

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  → バッチ ${i + 1}/${batches.length}\r`);
    const params = new URLSearchParams({
      action: 'query',
      titles: batch.join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
    });
    const res = await fetchWithRetry(`${WIKI_API}?${params}`);
    const data = await res.json();

    // MediaWiki の正規化マッピング (元の名前 → 正規化名) を構築
    const normalizedMap = new Map();
    if (data.query?.normalized) {
      for (const n of data.query.normalized) {
        normalizedMap.set(n.to, n.from);
      }
    }

    if (data.query?.pages) {
      for (const page of Object.values(data.query.pages)) {
        if (page.imageinfo?.[0]?.url) {
          const normalizedTitle = page.title; // "File:Compass.png"
          // 正規化前の元の名前があればそれを使う
          const originalTitle = normalizedMap.get(normalizedTitle) || normalizedTitle;
          const normalizedFilename = normalizedTitle.replace(/^File:/, '');
          const originalFilename = originalTitle.replace(/^File:/, '');
          // 両方のキーで登録 (元のファイル名でも正規化後でも引けるように)
          urlMap.set(originalFilename, page.imageinfo[0].url);
          urlMap.set(normalizedFilename, page.imageinfo[0].url);
        }
      }
    }
    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n  → ${urlMap.size} 画像URLエントリ`);
  return urlMap;
}

// ---------- Step 6: 画像ダウンロード ----------

async function downloadImages(mapped, urlMap) {
  console.log('[6/6] 画像をダウンロード中...');
  await mkdir(OUTPUT_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  // 同じ画像を複数IDで共有する場合の重複ダウンロード回避
  const downloadedImages = new Map(); // image → Buffer

  const tasks = mapped.map((entry) => async () => {
    const outPath = join(OUTPUT_DIR, `${entry.id}.png`);

    // 既存ファイルがあればスキップ
    if (existsSync(outPath)) {
      skipped++;
      return;
    }

    const url = urlMap.get(entry.image);
    if (!url) {
      console.log(`  ✗ URL不明: ID=${entry.id} (${entry.image})`);
      failed++;
      return;
    }

    try {
      let buffer;
      if (downloadedImages.has(entry.image)) {
        buffer = downloadedImages.get(entry.image);
      } else {
        const res = await fetchWithRetry(url);
        if (!res.ok) {
          console.log(`  ✗ HTTP ${res.status}: ID=${entry.id} (${url})`);
          failed++;
          return;
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          console.log(`  ✗ 非画像: ID=${entry.id} (${contentType})`);
          failed++;
          return;
        }
        buffer = Buffer.from(await res.arrayBuffer());
        downloadedImages.set(entry.image, buffer);
      }
      await writeFile(outPath, buffer);
      downloaded++;
      if (downloaded % 10 === 0) {
        process.stdout.write(`  → ${downloaded} ダウンロード済み\r`);
      }
    } catch (e) {
      console.log(`  ✗ エラー: ID=${entry.id} - ${e.message}`);
      failed++;
    }
  });

  await parallelLimit(tasks, CONCURRENCY);
  console.log(`\n  → 完了: ダウンロード=${downloaded}, スキップ=${skipped}, 失敗=${failed}`);
}

// ---------- メイン ----------

async function main() {
  console.log('=== IDOLiSH7 楽曲画像クローラー ===\n');

  const wikiPages = await fetchWikiSongPages();
  const wikiData = await fetchAllWikitext([...wikiPages.keys()]);
  const gsheetSongs = await fetchGSheetSongs();
  const { mapped } = buildMapping(gsheetSongs, wikiData, wikiPages);

  if (mapped.length === 0) {
    console.log('\nマッチする楽曲がありません。終了します。');
    return;
  }

  const imageFilenames = [...new Set(mapped.map((m) => m.image))];
  const urlMap = await fetchImageUrls(imageFilenames);
  await downloadImages(mapped, urlMap);

  console.log('\n=== 完了 ===');
}

main().catch((e) => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
