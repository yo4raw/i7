#!/usr/bin/env node
/**
 * `src/data/image-visual.json` の各 `v` 冒頭の主語句をキャラクター名へ置き換える。
 *
 * `v` は「◯◯髪の青年が…」のように匿名の主語で始まる。これを `七瀬陸が…` のように
 * 実名に変え、alt テキストが「誰の絵か」を本文側でも言えるようにする。
 *
 * 置き換えるのは「単独人物が主語」のレコードだけ。複数人・集合絵・人物以外の主語
 * （プリンのキャラクター・ロゴなど）は `v` を据え置く。
 *
 * 名前の出どころ:
 *   - シートに行があるカード: `tmp/image-alt/id-to-name.json`（シート `name` 列、日本語）
 *   - 孤児カード（シートに行が無い）: `record.n` の印字ローマ字を
 *     `tmp/image-alt/romaji-to-japanese.json` で日本語名に変換
 *
 * 実行: node scripts/image-alt/prepend-name.mjs
 * 入力: tmp/image-alt/batch-*.jsonl（`--in-place` で直接書き換える）
 *       または src/data/image-visual.json（既定。`--catalog`）
 *
 * バッチ JSONL を書き換えてから merge-visual.mjs を再実行するのが正しい運用。
 * `--dry-run` で件数だけ見られる。
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const ID_NAME_PATH = 'tmp/image-alt/id-to-name.json';
const R2J_PATH = 'tmp/image-alt/romaji-to-japanese.json';
const ORPHAN_PATH = 'tmp/image-alt/manifest.json';

/** 冒頭の主語句（最初の `が` / `は` まで）を取る */
const SUBJECT_RE = /^(.{1,40}?)(が|は)/;

/** 主語句が「単独の人物」を指すか。人称名詞を含み、複数・集合を示す語を含まない */
const PERSON_NOUNS = ['青年', '少年', '人物', '男性', '男の子', '女の子', '少女', '女性', '幼子', '子供', '子ども', '若者', 'メンバー', 'アイドル', '男', '女'];
const MULTI_MARKERS = /(\d+人|二人|三人|四人|五人|六人|七人|八人|九人|十人|十数人|複数人|全員|それぞれ|双子|複数|もう1人|もう一人|と(青年|人物|男|女|メンバー|アイドル|少年|少女)|・|＆|&)/;

/**
 * 主語句が単独人物を指すなら、その主語句の範囲（文字数）を返す。さもなくば null。
 * @param {string} v
 * @returns {number | null}
 */
export function nameableSubjectLength(v) {
  const m = SUBJECT_RE.exec(v);
  if (!m) return null;
  const subject = m[1];
  if (MULTI_MARKERS.test(subject)) return null;
  if (!PERSON_NOUNS.some((n) => subject.includes(n))) return null;
  return subject.length + 1; // +1 は `が` / `は` の分
}

/**
 * `v` の冒頭主語を `name` に置き換える。
 * `name` が無い、または主語が単独人物でないなら `v` をそのまま返す。
 * @param {string} v
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function prependName(v, name) {
  if (!name) return v;
  const cut = nameableSubjectLength(v);
  if (cut === null) return v;
  return `${name}が${v.slice(cut)}`;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');

  const idName = JSON.parse(readFileSync(resolve(PROJECT_ROOT, ID_NAME_PATH), 'utf-8'));
  const r2j = JSON.parse(readFileSync(resolve(PROJECT_ROOT, R2J_PATH), 'utf-8'));
  const manifest = JSON.parse(readFileSync(resolve(PROJECT_ROOT, ORPHAN_PATH), 'utf-8'));
  const orphanIds = new Set(manifest.filter((i) => i.needPrintedName).map((i) => i.id));

  const dir = resolve(PROJECT_ROOT, 'tmp/image-alt');
  const files = readdirSync(dir).filter((f) => /^batch-\d+\.jsonl$/.test(f)).toSorted();

  let touched = 0;
  let skipped = 0;
  const orphanUnnamed = [];

  for (const file of files) {
    const path = resolve(dir, file);
    const out = [];
    let changed = false;
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      if (!line.trim()) { out.push(line); continue; }
      const record = JSON.parse(line);
      if (record.kind !== 'card') { out.push(line); continue; }

      let name;
      if (orphanIds.has(record.id)) {
        name = record.n ? r2j[record.n] : undefined;
        if (!name && record.n) orphanUnnamed.push({ id: record.id, n: record.n });
      } else {
        name = idName[record.id];
      }

      const newV = prependName(record.v, name);
      if (newV !== record.v) {
        record.v = newV;
        touched++;
        changed = true;
        out.push(JSON.stringify(record));
      } else {
        skipped++;
        out.push(line);
      }
    }
    if (changed && !dryRun) writeFileSync(path, out.join('\n'));
  }

  console.log(JSON.stringify({ touched, skipped, orphanUnnamed: orphanUnnamed.length, dryRun }, null, 2));
  if (orphanUnnamed.length > 0) {
    console.error('孤児で日本語名に変換できない印字名:');
    for (const x of orphanUnnamed) console.error(`  ${x.id}: ${x.n}`);
  }
}

const isCli = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isCli) main();
