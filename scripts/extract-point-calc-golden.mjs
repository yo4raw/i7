/**
 * ポイント芸計算ツールのゴールデンフィクスチャを生成する。
 *
 *   node scripts/extract-point-calc-golden.mjs
 *
 * 参照スプレッドシート（@SachiTgr 氏作成の公開シート）の各シートを CSV でエクスポートし、
 * 「1ライブあたり獲得pt表」を (★, 難易度, プレイ方法, 特効%, 編成) → pt に展開して
 * tests/fixtures/point-calc-golden.json に書き出す。
 *
 * GViz API (gviz/tq) は結合セルのヘッダー行を空にして返すため使えない。
 * export?format=csv&gid=... は行・列をそのまま返すのでこちらを使う。
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from '../src/lib/data/fetchEventsCsv.ts';

const SPREADSHEET_ID = '1hVilwOeLHvrkqburgdbAypQSj1p58VFZYwBjKRais08';

/** 公開されている 8 シート。gid は htmlview の sheet switcher から取得した */
const SHEETS = [
  { gid: 1735187780, name: 'バディナナ用' },
  { gid: 1224880516, name: '吉兆用' },
  { gid: 970512701, name: "La'Stiara②用" },
  { gid: 1491789180, name: 'ISL②用' },
  { gid: 1588080159, name: "La'Stiara用" },
  { gid: 125020983, name: 'Sugao①用' },
  { gid: 543510933, name: 'Sugao②用' },
  { gid: 264123745, name: 'IDOL STAR LIVE用' },
];

/**
 * スプレッドシート側の入力ミスとして除外するセル。
 * 「式が間違っている」のではなく「シートの値が間違っている」と判断したもののみを列挙する。
 * 新しい除外を足すときは、必ず他シートの同条件と突き合わせた根拠を reason に書くこと。
 */
const KNOWN_SHEET_ERRORS = [
  ...['バディナナ用:AH24', '吉兆用:AH24', "La'Stiara②用:AC24", 'ISL②用:AC24', "La'Stiara用:AE24"].map(k => ({
    key: k,
    reason: '★4 EASY PC 180%。セルの式が 8188/3 = 2729.33… で非整数。正しくは 8118/3 = 2706',
  })),
  ...['Sugao①用', 'Sugao②用'].flatMap(sheet =>
    ['Y12', 'Z12', 'Y13', 'Z13', 'Y14', 'Z14', 'Y15', 'Z15'].map(cell => ({
      key: `${sheet}:${cell}`,
      reason: '★1 行の 200% 列に隣の 210% 列と同じ値が入っている（コピー時の取り違え）',
    })),
  ),
  ...['Sugao①用', 'Sugao②用'].map(sheet => ({
    key: `${sheet}:Y28`,
    reason: '★5 EASY FC 200%。式の値は 2855 だがシートは 2865',
  })),
  ...['Sugao①用', 'Sugao②用', 'IDOL STAR LIVE用'].map(sheet => ({
    key: `${sheet}:N17`,
    reason: '★2 NORMAL FC 60%。他 5 シートの同条件は 2013 だがこのシートのみ 2031（桁の入れ替わり）',
  })),
];

const ERROR_REASON = new Map(KNOWN_SHEET_ERRORS.map(e => [e.key, e.reason]));

const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];
const PLAY_MODES = ['放置', 'オート', 'FC', 'PC'];

/** 0 始まりの列番号を A1 記法の列名にする */
function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCodePoint(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "1,370" → 1370 / "" や "-" → null */
function toInt(raw) {
  const s = (raw ?? '').trim().replaceAll(',', '');
  if (s === '' || !/^\d+$/.test(s)) return null;
  return Number(s);
}

/** 特効ラベル → 整数パーセント。"50% フレ含め特効1枚" / "60%" / "0.6" / "150%" を受ける */
function toBonusPct(label) {
  const s = (label ?? '').trim();
  if (s === '') return null;
  const pct = /^\s*(\d+)\s*[%％]/.exec(s);
  if (pct) return Number(pct[1]);
  const ratio = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  if (ratio) return Math.round(Number(ratio[1]) * 100);
  return null;
}

/** 特効ラベル → 弱編成プリセット（該当しなければ null） */
function toWeakUnit(label) {
  const s = (label ?? '').trim();
  if (s.includes('SR以下')) return 'weak';
  if (s.includes('SSR1枚')) return 'ssr1';
  return null;
}

async function fetchSheet(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`シート gid=${gid} の取得に失敗: ${res.status}`);
  return parseCsv(await res.text());
}

function extractSheet(sheetName, rows) {
  // プレイ方法の行 = B 列が「難易度」の行。特効ラベルの行はその 1 行上
  const modeRowIdx = rows.findIndex(r => (r[1] ?? '').trim() === '難易度');
  if (modeRowIdx < 1) throw new Error(`${sheetName}: 「難易度」行が見つからない`);
  const labelRow = rows[modeRowIdx - 1];
  const modeRow = rows[modeRowIdx];

  // 特効ラベルは結合セルなので、次のラベルが現れるまで同じ特効%が続く
  const columns = new Map(); // colIndex → { bonusPct, playMode, unit }
  let currentPct = null;
  for (let c = 2; c < Math.max(labelRow.length, modeRow.length); c++) {
    const weak = toWeakUnit(labelRow[c]);
    if (weak) {
      // 弱編成列は独立列。放置・特効 0% 固定
      columns.set(c, { bonusPct: 0, playMode: '放置', unit: weak });
      currentPct = null;
      continue;
    }
    const pct = toBonusPct(labelRow[c]);
    if (pct !== null) currentPct = pct;
    const mode = (modeRow[c] ?? '').trim();
    if (currentPct === null || !PLAY_MODES.includes(mode)) continue;
    columns.set(c, { bonusPct: currentPct, playMode: mode, unit: 'max' });
  }

  // ★行 = A 列が ★ の繰り返しだけの行。そこから 4 行が EASY/NORMAL/HARD/EXPERT
  const cells = [];
  const errors = [];
  for (let r = 0; r < rows.length; r++) {
    const a = (rows[r][0] ?? '').trim();
    if (!/^★+$/.test(a)) continue;
    const stars = a.length;
    for (let d = 0; d < DIFFICULTIES.length; d++) {
      const row = rows[r + d];
      if (!row) throw new Error(`${sheetName}: ★${stars} の行が足りない`);
      const difficulty = (row[1] ?? '').trim();
      if (difficulty !== DIFFICULTIES[d]) {
        throw new Error(`${sheetName}: 行 ${r + d + 1} の難易度が ${DIFFICULTIES[d]} でなく "${difficulty}"`);
      }
      for (const [c, meta] of columns) {
        const value = toInt(row[c]);
        if (value === null) continue;
        const cell = `${colName(c)}${r + d + 1}`;
        const record = { sheet: sheetName, cell, stars, difficulty, ...meta, multiplier: 1, value };
        const reason = ERROR_REASON.get(`${sheetName}:${cell}`);
        if (reason) errors.push({ ...record, reason });
        else cells.push({ ...record, expected: value });
      }
    }
  }
  return { cells, errors };
}

const allCells = [];
const allErrors = [];
for (const sheet of SHEETS) {
  const rows = await fetchSheet(sheet.gid);
  const { cells, errors } = extractSheet(sheet.name, rows);
  allCells.push(...cells);
  allErrors.push(...errors);
  console.log(`${sheet.name}: ${cells.length} セル / 除外 ${errors.length} セル`);
}

if (allErrors.length !== KNOWN_SHEET_ERRORS.length) {
  throw new Error(
    `除外セルが ${allErrors.length} 件で想定の ${KNOWN_SHEET_ERRORS.length} 件と一致しない。` +
    'シート側が修正されたか、セル位置がずれた可能性がある',
  );
}

const out = {
  note: 'ポイント芸計算ツールのゴールデンデータ。scripts/extract-point-calc-golden.mjs で再生成する',
  source: SPREADSHEET_ID,
  extractedAt: new Date().toISOString().slice(0, 10),
  cells: allCells,
  knownSheetErrors: allErrors,
};
const dest = path.resolve('tests/fixtures/point-calc-golden.json');
await writeFile(dest, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
console.log(`合計 ${allCells.length} セル / 除外 ${allErrors.length} セル → ${dest}`);
