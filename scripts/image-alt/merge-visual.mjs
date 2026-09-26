#!/usr/bin/env node
/**
 * sub-agent 36 本が書いた `batch-*.jsonl` を検証し、alt カタログ `src/data/image-visual.json` にマージする。
 * 実行: node scripts/image-alt/merge-visual.mjs
 * 頻度: sub-agent を 36 本すべて走らせ終えた後（Task 8）
 *
 * 入力:
 *   - `tmp/image-alt/batches.json`（`build-manifest.mjs` の出力）
 *   - `tmp/image-alt/batch-*.jsonl`（sub-agent 1 本 = 1 ファイル。1 行 1 レコード）
 *   - `public/assets/{th_cards,songs}/`（実画像 ID の走査元）
 * 出力:
 *   - `src/data/image-visual.json`（2 スペース・末尾改行。`{ cards, songs }`）
 *
 * 検査は設計書 5 章の順で、1 つでも落ちたら違反 ID を列挙して exit≠0 にする。
 *   ① バッチのファイル存在 + 件数 → ② 実 ID 集合の走査 → ③ 各 JSONL のパース
 *   → ④ カタログ組み立て → ⑤ `validate-visual.mjs` → ⑥ 書出
 * 落ちた段で止めるのは、その先の検査が「欠落 ID を 3,527 件列挙する」だけになるから。
 * 落ちた段と該当バッチ / ID をそのまま再投の判断材料として見せる。
 *
 * sub-agent が踏む 2 つの落とし穴（設計書 7 章）はこのスクリプトが持つ。
 *   - 数値で `id` を書く → `parseBatch` が文字列に正規化する
 *   - 1 バッチだけファイルが無い / 0 件 → `checkBatches` が入口で止める
 *
 * `IMAGE_ALT_ROOT` を指定するとリポジトリ根を差し替える（テストと pilot のフィクスチャ用）。
 * 未指定のときはこのスクリプトのあるリポジトリを使う。`public/` の元画像は読み取りのみで、
 * 書くのは `src/data/image-visual.json` だけ。
 */

import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateCatalog } from './validate-visual.mjs';

const PROJECT_ROOT = resolve(
  process.env.IMAGE_ALT_ROOT ?? resolve(import.meta.dirname, '..', '..'),
);

const BATCHES_PATH = 'tmp/image-alt/batches.json';
const OUT_PATH = 'src/data/image-visual.json';
/**
 * カード ID の実集合は `th_cards` を採る。`th_cards` は `cards` の上位集合
 * （カードは必ずサムネを持つが、フル画像を持つとは限らない）で、`build-manifest.mjs` の
 * Manifest と同じ集合になる。`cards` だけを見ると、サムネしか無いカード 483 枚を欠落扱いする。
 */
const CARD_IMAGE_DIR = 'public/assets/th_cards';
const SONG_IMAGE_DIR = 'public/assets/songs';

/**
 * @typedef {object} Batch
 * @property {string} name
 * @property {string} out
 * @property {{ kind: 'card' | 'song', id: string }[]} items
 */

/**
 * @typedef {object} CatalogEntry
 * @property {string} v
 * @property {string} [n]
 */

/**
 * JSONL 文字列をレコード配列にする。数値 id は文字列に正規化し、壊れた行は errors に積む
 *
 * 行は 3 つに分けて扱う。
 *   - JSON として壊れている / オブジェクトでない → `errors`（再投の対象行）
 *   - 使える `id` が無いオブジェクト → レコードにしない。欠落は ⑤ の網羅性検査が ID を列挙する
 *   - それ以外 → `records`（`v` や `n` の不備は ⑤ に任せる）
 *
 * 空ファイルはエラーではなく 0 件。空ファイルを書いた sub-agent を見つけるのは `checkBatches` の責務。
 * @param {string} text
 * @returns {{ records: { id: string, v?: unknown, n?: unknown }[], errors: string[] }}
 */
export function parseBatch(text) {
  const records = [];
  const errors = [];

  for (const [index, line] of text.split('\n').entries()) {
    // 末尾の改行でできる空行と、手で入れた余白行は数えない
    if (line.trim() === '') continue;
    const lineNumber = index + 1;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      errors.push(`${lineNumber} 行目: JSON として読めない（${err.message}）`);
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push(`${lineNumber} 行目: JSON オブジェクトではない`);
      continue;
    }

    // sub-agent は `{"id":1000}` と書くことがある。数値のまま使うとキーが "1000" になり、
    // ⑤ の網羅性検査が「3,527 件すべて欠落」と誤報する
    const id = typeof parsed.id === 'number' ? String(parsed.id) : parsed.id;
    if (typeof id !== 'string' || id === '') continue;
    records.push({ ...parsed, id });
  }

  return { records, errors };
}

/**
 * 存在的ファイルと各バッチの件数を検査する。不足していれば缺席したバッチ名を列挙する
 *
 * ここでの「件数」は空行を除いた行数で、壊れた行も 1 件と数える（壊れているかどうかは
 * `parseBatch` の責務）。この検査の目的は「ファイルを書いたのに中身が無い」を
 * 取りこぼさないことなので、中身の正しさは問わない。
 * @param {Batch[]} batches
 * @param {(out: string) => string | null | undefined} existsFn `out` パスに対応する
 *   ファイルがあれば本文を、無ければ null を返す。存在判定と件数判定を同じ注入点で行うため
 *   1 つで足りる。テストは実際のファイルに触れず、マップから返す。
 * @returns {string[]} 違反のメッセージ。違反が無ければ空配列
 */
export function checkBatches(batches, existsFn) {
  const violations = [];

  for (const batch of batches) {
    const text = existsFn(batch.out);
    if (text === null || text === undefined) {
      violations.push(`${batch.name}: ファイルが無い（${batch.out}）`);
      continue;
    }

    const count = text.split('\n').filter((line) => line.trim() !== '').length;
    if (count === 0) {
      violations.push(`${batch.name}: ファイルが空です（0 件。書いたとみなさない）`);
      continue;
    }
    if (count !== batch.items.length) {
      violations.push(`${batch.name}: ${count} 件で、期待する ${batch.items.length} 件と一致しません`);
    }
  }

  return violations;
}

/** ディレクトリ内の `<数字>.webp` から ID を採る（並びはカタログ組み立ての順に任せる） */
async function listImageIds(dirName) {
  const entries = await readdir(resolve(PROJECT_ROOT, dirName));
  return entries
    .filter((name) => /^\d+\.webp$/.test(name))
    .map((name) => name.replace(/\.webp$/, ''));
}

/** 2 スペース・末尾改行の JSON 文字列にする（`build-manifest.mjs` の toJson と同じ書式） */
function toJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * 違反を列挙して exit≠0 にする。違反が無ければ `true` を返す。
 *
 * `process.exit()` ではなく `exitCode` に代入するのは、違反が 3,527 件ぶん出ることがあり
 * パイプへの書込みが終わる前にプロセスを閉じると末尾が落ちるため。自然に終端させる。
 * @param {string} step 検査の番号と名前（例: `① バッチのファイル存在 + 件数`）
 * @param {string[]} violations
 * @returns {boolean} 違反があれば false、無ければ true
 */
function fail(step, violations) {
  if (violations.length === 0) return true;
  console.error(`[merge-visual] ${step} で ${violations.length} 件の違反を検出しました:`);
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exitCode = 1;
  return false;
}

async function main() {
  const batches = /** @type {Batch[]} */ (
    JSON.parse(await readFile(resolve(PROJECT_ROOT, BATCHES_PATH), 'utf-8'))
  );

  // ① バッチのファイル存在 + 件数。読む前に止める
  // ① と ③ で同じファイルを読まないように、内容を控えておく
  const cache = new Map();
  const readBatch = (out) => {
    if (!cache.has(out)) {
      try {
        cache.set(out, readFileSync(resolve(PROJECT_ROOT, out), 'utf-8'));
      } catch {
        cache.set(out, null);
      }
    }
    return cache.get(out) ?? null;
  };
  if (!fail('① バッチのファイル存在 + 件数', checkBatches(batches, readBatch))) return;

  // ② 実画像 ID の走査
  const [cardIds, songIds] = await Promise.all([
    listImageIds(CARD_IMAGE_DIR),
    listImageIds(SONG_IMAGE_DIR),
  ]);

  // ③ 各 JSONL のパース
  const parseErrors = [];
  const parsedBatches = batches.map((batch) => {
    const { records, errors } = parseBatch(readBatch(batch.out) ?? '');
    for (const message of errors) parseErrors.push(`${batch.name} ${message}`);
    return { batch, records };
  });
  if (!fail('③ 各 JSONL のパース', parseErrors)) return;

  // ④ カタログの組み立て
  /** @type {{ cards: Record<string, CatalogEntry>, songs: Record<string, CatalogEntry> }} */
  const catalog = { cards: {}, songs: {} };
  const duplicates = [];
  for (const { batch, records } of parsedBatches) {
    // 振り分けはレコードの `kind` ではなく、どのファイルに由来するかで行う。
    // `build-manifest.mjs` が「1 バッチに 1 種別だけ」を保証している。
    // 保証が崩れて種別が混ざっても、⑤ の網羅性検査が「実画像に無い ID がカタログに残る」
    // 「実画像にある ID がカタログに無い」として両方の ID を列挙して落とす。
    const scope = batch.items[0]?.kind === 'song' ? 'songs' : 'cards';

    for (const record of records) {
      if (Object.hasOwn(catalog[scope], record.id)) {
        duplicates.push(`${scope} ${record.id}: 同じ ID が複数のバッチに重複しています`);
        continue;
      }
      // `n` はシートに居ないカードの印字名用で、songs 側には持てない（`validateEntry` と同じ境界）
      const entry = { v: record.v };
      if (scope === 'cards' && record.n !== undefined && record.n !== null) {
        entry.n = /** @type {string} */ (record.n);
      }
      catalog[scope][record.id] = entry;
    }
  }
  if (!fail('④ カタログの組み立て', duplicates)) return;

  // ⑤ 検証（設計書 5 章）
  if (!fail('⑤ カタログの検証', validateCatalog(catalog, { cardIds, songIds }))) return;

  // ⑥ 書出
  const outPath = resolve(PROJECT_ROOT, OUT_PATH);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toJson(catalog), 'utf-8');

  const namedCount = Object.values(catalog.cards).filter((entry) => entry.n !== undefined).length;
  console.log(
    JSON.stringify(
      { cardCount: cardIds.length, songCount: songIds.length, cardWithNameCount: namedCount },
      null,
      2,
    ),
  );
  console.error(`[merge-visual] wrote: ${OUT_PATH}`);
}

// import されただけでは走らない（テストは `parseBatch` / `checkBatches` だけを import する）
const isCli = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
