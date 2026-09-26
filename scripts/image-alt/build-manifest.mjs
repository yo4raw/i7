#!/usr/bin/env node
/**
 * 画像 alt カタログの対象 Manifest と、sub-agent 用 バッチ分割を生成する。
 * 実行: node scripts/image-alt/build-manifest.mjs
 * 頻度: 必要時のみ（シートにカード/楽曲が追加されたとき・`public/assets/` に画像が追加されたとき）
 *
 * 入力:
 *   - シートのカード（gid 480354522）と楽曲（gid 1083871743）を GViz 経由で取得する
 *   - `public/assets/{cards,th_cards,songs}` を走査して実画像 ID を採る
 * 出力:
 *   - `tmp/image-alt/manifest.json` 3,527 件の Manifest
 *   - `tmp/image-alt/batches.json`  36 バッチの分割（sub-agent 1 本 = 1 バッチ）
 *
 * ネットワークとファイル IO は `main()` に閉じ、`buildManifest` は引数だけを受ける純粋関数。
 * `public/` の元画像には書き込まない（このスクリプトは読み取りのみ）。
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fetchRetry } from '../lib/util.mjs';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

/**
 * `src/lib/data/gviz.ts` と同じシート。その TypeScript を素の Node から import すると
 * 型取り込みに依存することになるため、取得処理をこのスクリプト内に書いて定数は複製する。
 */
const SPREADSHEET_ID = '1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4';
const CARD_GID = 480354522;
const SONG_GID = 1083871743;

/** 1 バッチの上限枚数。カード 3,376 は 34 本（100 × 33 + 76）、楽曲 151 は 2 本（76 + 75）になる */
const BATCH_SIZE = 100;

/** Manifest に書くパスは sub-agent に渡すためリポジトリ相対の POSIX 表記で揃える */
const WORK_DIR = 'tmp/image-alt';
const SCALED_CARD_DIR = `${WORK_DIR}/scaled/cards`;
const CARD_IMAGE_DIR = 'public/assets/cards';
const THUMB_IMAGE_DIR = 'public/assets/th_cards';
const SONG_IMAGE_DIR = 'public/assets/songs';

/**
 * @typedef {object} ManifestItem
 * @property {'card' | 'song'} kind
 * @property {string} id
 * @property {string} readPath
 * @property {string | null} fallbackPath
 * @property {boolean} needPrintedName
 */

/**
 * @typedef {object} Batch
 * @property {string} name
 * @property {string} out
 * @property {ManifestItem[]} items
 */

/**
 * @typedef {object} Stats
 * @property {number} cardCount
 * @property {number} songCount
 * @property {number} dbMatchedCardCount
 * @property {number} orphanCardCount
 */

/**
 * ID 集合とシート行から Manifest とバッチ分割を作る。
 *
 * カードは `cards/<id>` と `th_cards/<id>` が表裏なので 1 件として数える（`thumbImageIds` が正）。
 * `readPath` / `fallbackPath` はファイルの有無を見ず ID の所属だけで決める。このスクリプトは
 * 縮小（`scale-cards.mjs`）より先に走るので、存在判定はできない。
 *
 * @param {object} input
 * @param {string[]} input.cardImageIds `public/assets/cards/` に在る ID
 * @param {string[]} input.thumbImageIds `public/assets/th_cards/` に在る ID
 * @param {string[]} input.songImageIds `public/assets/songs/` に在る ID
 * @param {{ ID?: unknown }[]} input.cardRows カードシートの行。使うのは `ID`
 * @param {object[]} [input.songRows] 楽曲シートの行。**参照しない**。sub-agent に渡すスライス
 *   （spec 3.4）に楽曲のシート照合結果が無く、`stats` にも楽曲側の件数が無いため Manifest に載る情報が無い
 * @returns {{ manifest: ManifestItem[], batches: Batch[], stats: Stats }}
 */
export function buildManifest({ cardImageIds, thumbImageIds, songImageIds, cardRows }) {
  // シートの ID は数値で返るので文字列に揃える。空セルは ID として数えない
  const dbCardIds = new Set(cardRows.map((row) => String(row.ID ?? '')).filter(Boolean));
  const fullCardIds = new Set(cardImageIds);

  const cardItems = thumbImageIds.toSorted().map((id) => {
    const hasFullImage = fullCardIds.has(id);
    return {
      kind: 'card',
      id,
      readPath: hasFullImage ? `${SCALED_CARD_DIR}/${id}.webp` : `${THUMB_IMAGE_DIR}/${id}.webp`,
      fallbackPath: hasFullImage ? `${THUMB_IMAGE_DIR}/${id}.webp` : null,
      // シートに行が無いカードは画像に印字された名前を控えてもらう
      needPrintedName: !dbCardIds.has(id),
    };
  });

  // 楽曲の ID 空間はカードと重なるので kind を付けて別々に数える
  const songItems = songImageIds.toSorted().map((id) => ({
    kind: 'song',
    id,
    readPath: `${SONG_IMAGE_DIR}/${id}.webp`,
    fallbackPath: null,
    needPrintedName: false,
  }));

  // 1 バッチにカードと楽曲を混ぜないため、種別ごとに切ってから連結する
  const batches = [...chunkEvenly(cardItems), ...chunkEvenly(songItems)].map(
    (items, index) => {
      const name = `batch-${String(index).padStart(2, '0')}`;
      return { name, out: `${WORK_DIR}/${name}.jsonl`, items };
    },
  );

  // シートに行があるカードは needPrintedName が false のもの
  const dbMatchedCardCount = cardItems.filter((item) => !item.needPrintedName).length;
  return {
    manifest: [...cardItems, ...songItems],
    batches,
    stats: {
      cardCount: cardItems.length,
      songCount: songItems.length,
      dbMatchedCardCount,
      orphanCardCount: cardItems.length - dbMatchedCardCount,
    },
  };
}

/**
 * 配列を「1 バッチ BATCH_SIZE 枚以下の最小本数」に、枚数を揃えるように切る。
 * カードは 3,376 枚で 34 本（100 × 33 + 76）、楽曲は 151 枚で 2 本（76 + 75）になる（spec 3.4）。
 * @template T
 * @param {T[]} items
 * @returns {T[][]}
 */
function chunkEvenly(items) {
  const batchCount = Math.ceil(items.length / BATCH_SIZE);
  if (batchCount === 0) return [];
  const size = Math.ceil(items.length / batchCount);
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** ディレクトリ内の `<数字>.webp` から ID を採る（並びは `buildManifest` が整える） */
async function listImageIds(dirName) {
  const entries = await readdir(resolve(PROJECT_ROOT, dirName));
  return entries.filter((name) => /^\d+\.webp$/.test(name)).map((name) => name.replace(/\.webp$/, ''));
}

/**
 * GViz セルから値を取り出す（`src/lib/data/gviz.ts` の `extractCellValue` と同じ）。
 * GViz の Date 型 `Date(2024,0,15)` は `2024-01-15` の文字列に直す。
 * @param {{ v?: unknown } | null | undefined} cell
 */
function extractCellValue(cell) {
  const value = cell?.v;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && /^Date\(\d+,\d+,\d+/.test(value)) {
    const matched = value.match(/Date\((\d+),(\d+),(\d+)/);
    if (matched) {
      return new Date(Number(matched[1]), Number(matched[2]), Number(matched[3]))
        .toISOString()
        .split('T')[0];
    }
  }
  return value;
}

/**
 * GViz 応答から JSONP の包み `google.visualization.Query.setResponse(...)` を剥がす
 * （`src/lib/data/gviz.ts` の `parseGvizResponse` と同じ）。
 * @param {string} text
 */
function parseGvizResponse(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
  if (!match) throw new Error('GViz JSONP のパースに失敗しました');
  return JSON.parse(match[1]);
}

/**
 * シートの行を列ラベルをキーにしたオブジェクトの配列で返す。
 *
 * `fetchRetry` に `{ json: true }` は指定しない。`tqx=out:json` を付けても本文は
 * 先頭のコメントと `google.visualization.Query.setResponse({...});` から成る JSONP で
 * `JSON.parse` が通らないため、テキストとして受け取って包みだけを剥がす。
 * @param {number} gid
 * @param {string[]} labels 取り出す列ラベル
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function fetchSheetRows(gid, labels) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
  const response = await fetchRetry(url);
  const { table } = parseGvizResponse(await response.text());
  if (!table) throw new Error(`シートの応答に table がありません (gid=${gid})`);

  const headers = table.cols.map((col) => col.label);
  return table.rows.map((row) => {
    const entry = {};
    headers.forEach((label, index) => {
      if (label && labels.includes(label)) entry[label] = extractCellValue(row.c?.[index]);
    });
    return entry;
  });
}

/** 2 スペース・末尾改行の JSON 文字列にする（`extract-test-fixtures.ts` の writeJson と同じ書式） */
function toJson(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

/** シートの行のうち ID を持つ件数（使われていない余白行を除いた枚数） */
function countIds(rows) {
  return rows.filter((row) => row.ID !== null && row.ID !== undefined).length;
}

async function main() {
  console.error('[build-manifest] シートを取得中...');
  const [cardRows, songRows] = await Promise.all([
    fetchSheetRows(CARD_GID, ['ID']),
    fetchSheetRows(SONG_GID, ['ID', '曲名', 'アーティスト名']),
  ]);
  console.error(
    `[build-manifest] シート: カード ID ${countIds(cardRows)} 件 / 楽曲 ID ${countIds(songRows)} 件`,
  );

  const [cardImageIds, thumbImageIds, songImageIds] = await Promise.all([
    listImageIds(CARD_IMAGE_DIR),
    listImageIds(THUMB_IMAGE_DIR),
    listImageIds(SONG_IMAGE_DIR),
  ]);

  const { manifest, batches, stats } = buildManifest({
    cardImageIds,
    thumbImageIds,
    songImageIds,
    cardRows,
    songRows,
  });

  const workDir = resolve(PROJECT_ROOT, WORK_DIR);
  await mkdir(workDir, { recursive: true });
  await writeFile(join(workDir, 'manifest.json'), toJson(manifest), 'utf-8');
  await writeFile(join(workDir, 'batches.json'), toJson(batches), 'utf-8');

  console.log(JSON.stringify({ stats, batchCount: batches.length }, null, 2));
  console.error(`[build-manifest] wrote: ${WORK_DIR}/manifest.json, ${WORK_DIR}/batches.json`);
}

// import されただけでは走らない（テストは `buildManifest` だけを import する）
const isCli = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
