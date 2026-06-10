#!/usr/bin/env node
/**
 * 既存 Tailwind クラスに dark: バリアントを系統的に追加する一回限りのスクリプト。
 *
 *   node scripts/apply-dark-variants.mjs
 *
 * 各マッピングについて、
 *   1. クラス文字列 (class="...", class:foo="...") の中で対象トークン X を検出
 *   2. その後に同じ「修飾子接頭辞 + dark:同等トークン」が既に隣接していたらスキップ
 *   3. 無ければトークンの直後にスペース区切りで dark: 同等を挿入
 * という処理を行う。
 *
 * 修飾子の取り扱い:
 *   - hover:bg-gray-100 → dark:hover:bg-slate-700 ではなく hover:dark:bg-slate-700 でもなく
 *     「dark:hover:bg-slate-700」を採用する（Tailwind の慣例）
 *   - すでに dark: 付きのクラスはそのまま
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// [from, toAdd] — `from` が見つかったら、その後ろに ` toAdd` を追加（既存ならスキップ）
// 修飾子付き (hover: focus: md: lg: 等) は別行で扱う
const baseMapping = [
  ['bg-white', 'dark:bg-slate-800'],
  ['bg-gray-50', 'dark:bg-slate-900'],
  ['bg-gray-100', 'dark:bg-slate-800'],
  ['bg-gray-200', 'dark:bg-slate-700'],
  ['bg-gray-300', 'dark:bg-slate-600'],
  ['text-gray-900', 'dark:text-slate-100'],
  ['text-gray-800', 'dark:text-slate-100'],
  ['text-gray-700', 'dark:text-slate-200'],
  ['text-gray-600', 'dark:text-slate-300'],
  ['text-gray-500', 'dark:text-slate-400'],
  ['text-gray-400', 'dark:text-slate-500'],
  ['text-gray-300', 'dark:text-slate-600'],
  ['border-gray-100', 'dark:border-slate-800'],
  ['border-gray-200', 'dark:border-slate-700'],
  ['border-gray-300', 'dark:border-slate-600'],
  ['border-gray-400', 'dark:border-slate-500'],
  ['divide-gray-100', 'dark:divide-slate-800'],
  ['divide-gray-200', 'dark:divide-slate-700'],
];

// hover: focus: 接頭辞付きの mapping を生成
const prefixes = ['hover:', 'focus:', 'group-hover:'];
const mapping = [];
for (const [from, to] of baseMapping) {
  mapping.push([from, to]);
  for (const p of prefixes) {
    mapping.push([`${p}${from}`, `dark:${p}${to.replace(/^dark:/, '')}`]);
  }
}

const files = [
  'src/components/CardCurrentBonus.svelte',
  'src/components/CardList.svelte',
  'src/components/cards/CardMobileCard.svelte',
  'src/components/cards/CardTableRow.svelte',
  'src/components/cards/CardTileCard.svelte',
  'src/components/cards/CountInput.svelte',
  'src/components/DeckList.svelte',
  'src/components/EventCountdown.svelte',
  'src/components/EventList.svelte',
  'src/components/EventStatusBadge.svelte',
  'src/components/FooterTools.svelte',
  'src/components/HeaderNav.svelte',
  'src/components/MyCardList.svelte',
  'src/components/RabbitNoteEditor.svelte',
  'src/components/score/ShrinkPlayground.svelte',
  'src/components/ScoreCalc.svelte',
  'src/components/MaxScoreFinder.svelte',
  'src/components/SongList.svelte',
  'src/pages/about/index.astro',
  'src/pages/cards/[id].astro',
  'src/pages/events/[id].astro',
  'src/pages/index.astro',
  'src/pages/rabbit-note/index.astro',
  'src/pages/releases/index.astro',
  'src/pages/score-calc/max-score-finder/index.astro',
  'src/pages/score-calc/spec.astro',
  'src/pages/songs/[id].astro',
];

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

function processClassString(value, originalQuote) {
  // value はクラス文字列の中身（クォート除く）
  // 各 mapping を順に適用
  let tokens = value.split(/\s+/);
  for (const [from, toAdd] of mapping) {
    const idxs = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === from) idxs.push(i);
    }
    if (idxs.length === 0) continue;
    // 既に同じ toAdd を含むなら追加しない
    if (tokens.includes(toAdd)) continue;
    // 最後の出現位置の直後に挿入（複数出現があっても一度だけ追加）
    tokens.splice(idxs[idxs.length - 1] + 1, 0, toAdd);
  }
  return tokens.join(' ');
}

// class="..." / class={`...`} / class:foo="..." パターンをマッチし、内部を書き換える
function transformContent(content) {
  // class="..." の double-quote 形式
  let out = content.replace(/\bclass="([^"]*)"/g, (m, val) => {
    const replaced = processClassString(val);
    return `class="${replaced}"`;
  });

  // class='...' の single-quote 形式（念のため）
  out = out.replace(/\bclass='([^']*)'/g, (m, val) => {
    const replaced = processClassString(val);
    return `class='${replaced}'`;
  });

  return out;
}

let totalChanged = 0;
for (const rel of files) {
  const path = resolve(repoRoot, rel);
  const before = readFileSync(path, 'utf-8');
  const after = transformContent(before);
  if (before !== after) {
    writeFileSync(path, after, 'utf-8');
    console.log('updated:', rel);
    totalChanged++;
  } else {
    console.log('no change:', rel);
  }
}
console.log(`\n${totalChanged} files updated.`);
