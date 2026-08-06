# ポイント芸計算ツール Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベントポイントを狙った数字にぴったり合わせる「ポイント芸」のために、目標ptと現在ptを入力すると、差異ぴったりになるライブの組合せをライブ回数の少ない順に複数提示するページを追加する。

**Architecture:** 参照スプレッドシートの「1ライブあたり獲得pt表」は算術式で完全に再現できることが検証済みなので、表データは持たず `src/lib/pointCalc/engine.ts` の純関数で算出する。その値を候補集合に展開し、`solver.ts` が「メイン周回 k 回 + 端数 R の最小回数 DP」で組合せを求める。全処理はクライアントサイド（完全静的サイトの原則）。

**Tech Stack:** Astro 6 / Svelte 5 (runes) / TypeScript / Tailwind CSS v4 / Vitest / Playwright

## Global Constraints

- **設計仕様書**: `docs/superpowers/specs/2026-08-06-point-calc-design.md`、**ADR**: `docs/adr/0049-point-calc-tool.md`。両者と矛盾する実装をしないこと。
- **完全静的サイト**: サーバーサイド処理を追加しない。計算・フェッチはすべてクライアントサイド。例外はビルド時の `public/events/events.csv` 読み込みのみ（既存の `fetchEventsCsv.ts` を使う）。
- **整数演算必須**: pt 計算で浮動小数点の乗算を挟まないこと。`Math.floor(g * (100 + pct) / 100)` の形にする。`g * (1 + pct / 100)` と書くと `660 × 2.3 = 1517.9999999999998` となり 1pt ずれる（実測で 124 セルが不一致になった）。
- **ユーザー可視テキストは「衣装」**: 「カード」と書かない。ただし本ツールは楽曲と編成の話なので該当箇所は少ない。内部識別子は英語のまま。
- **`indigo` 禁止**: クラス名・HEX とも `src/` に追加しない（`tests/unit/noIndigo.test.ts` が全 `src/**/*.{svelte,astro,ts,css}` を走査して落とす）。リンク・見出し・主ボタン・フォーカスリングは無彩色（`bg-chrome-ink` / `focus:ring-chrome-ink` 等）を使う。
- **ダークモード禁止**: `dark:` バリアントを付けない（ライトテーマ固定）。
- **マテリアル規約**: 本文・データを載せる面は不透明の `surface-card`。リスト行・繰り返し要素に `backdrop-filter` を使わない。大見出しは `text-display`、数値列は `tabular-nums`。
- **カバレッジゲート**: `src/lib/**` に対して statements / branches / functions / lines すべて 95%（`vitest.config.ts` の `thresholds`）。下回ると `npm run coverage` が exit≠0 になる。到達不能な防御的分岐は `/* v8 ignore next */` で個別除外する。
- **lint**: `npm run lint`（oxlint、`correctness` + `suspicious` + `pedantic` が error）が通ること。プレコミットフックでも走る。
- **命名規約**: イベント変数は `event`（ループ内短縮は `ev` まで）。
- **日常検証は `npm run dev`**: `npm run build` は約 5.5 分かかる。UI 確認は dev サーバー（約 1 秒起動、`http://localhost:4321/`）で行う。
- **ブランチ**: `feat/point-calc`（作成済み）。main で作業しない。

---

## File Structure

| ファイル | 責務 |
|---------|------|
| `src/lib/pointCalc/types.ts` | 型定義のみ。`Difficulty` / `PlayMode` / `UnitPreset` / `Stars` / `Multiplier` / `LiveSpec` |
| `src/lib/pointCalc/constants.ts` | 基礎点・★倍率・放置係数・ユニットボーナス・コンボボーナス・既定値。数値の単一情報源 |
| `src/lib/pointCalc/engine.ts` | `gradePoint()` / `livePoint()`。純関数、整数演算のみ |
| `src/lib/pointCalc/candidates.ts` | 設定 → 候補 pt 値リストへの展開と同値集約 |
| `src/lib/pointCalc/solver.ts` | メイン周回 + 端数 DP。純関数 |
| `src/lib/pointCalc/bonusPresets.ts` | イベントの `gpt_up` から達成可能な特効%を列挙し既定値を決める |
| `src/lib/storage.ts` | `STORAGE_KEYS` に `POINT_CALC_STATE` を追加（変更） |
| `src/lib/seo.ts` | `PAGE_DESCRIPTIONS.pointCalc` を追加（変更） |
| `src/components/HeaderNav.svelte` | ナビに「ポイント芸計算」を追加（変更） |
| `src/components/PointCalc.svelte` | UI 一式。入力・チップ編集・結果表示・localStorage 永続化 |
| `src/pages/point-calc/index.astro` | ビルド時にイベント CSV を読み、ポイント系イベントの要約を props で渡す |
| `scripts/extract-point-calc-golden.mjs` | スプレッドシートからゴールデンフィクスチャを生成 |
| `tests/fixtures/point-calc-golden.json` | ゴールデンデータ（生成物、commit する） |
| `tests/unit/pointCalc/*.test.ts` | 単体テスト |
| `tests/point-calc.test.ts` | E2E |

---

### Task 1: 計算エンジン（型・定数・pt 算出）

**Files:**
- Create: `src/lib/pointCalc/types.ts`
- Create: `src/lib/pointCalc/constants.ts`
- Create: `src/lib/pointCalc/engine.ts`
- Test: `tests/unit/pointCalc/engine.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `types.ts`: `type Difficulty = 'EASY'|'NORMAL'|'HARD'|'EXPERT'`, `type PlayMode = '放置'|'オート'|'FC'|'PC'`, `type UnitPreset = 'max'|'ssr1'|'weak'`, `type Stars = 1|2|3|4|5`, `type Multiplier = 1|2|3`, `interface LiveSpec { stars: Stars; difficulty: Difficulty; playMode: PlayMode; bonusPct: number; unit: UnitPreset; multiplier: Multiplier }`
  - `constants.ts`: `DIFFICULTIES`, `PLAY_MODES`, `STARS_LIST`, `MULTIPLIERS`, `UNIT_PRESETS`, `BASE_POINT`, `STAR_MULTIPLIER_X100`, `IDLE_COEFFICIENT_X100`, `UNIT_BONUS`, `UNIT_LABEL`, `COMBO_BONUS`, `DEFAULT_PLAY_MODES`, `FALLBACK_BONUS_PCTS`, `MAX_BONUS_PCT`, `DECK_SLOTS`
  - `engine.ts`: `gradePoint(playMode: PlayMode, stars: Stars, difficulty: Difficulty): number`, `livePoint(spec: LiveSpec): number`

- [ ] **Step 1: 型定義を作る**

`src/lib/pointCalc/types.ts`:

```ts
/** ポイント芸計算ツールの型定義 */

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';

/** プレイ方法。放置=グレードC相当、PC=パーフェクトコンボ */
export type PlayMode = '放置' | 'オート' | 'FC' | 'PC';

/** 編成プリセット。max=Lv6枚・特訓3枚MAX / ssr1=SSR1枚・特訓なし・Lv1 / weak=SR以下・Lv1 */
export type UnitPreset = 'max' | 'ssr1' | 'weak';

export type Stars = 1 | 2 | 3 | 4 | 5;

/** 倍率ライブ */
export type Multiplier = 1 | 2 | 3;

/** ライブ 1 回分の条件 */
export interface LiveSpec {
  stars: Stars;
  difficulty: Difficulty;
  playMode: PlayMode;
  /** 特効ボーナス（整数パーセント。0〜300） */
  bonusPct: number;
  unit: UnitPreset;
  multiplier: Multiplier;
}
```

- [ ] **Step 2: 定数を作る**

`src/lib/pointCalc/constants.ts`:

```ts
import type { Difficulty, Multiplier, PlayMode, Stars, UnitPreset } from './types';

export const DIFFICULTIES: readonly Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];
export const PLAY_MODES: readonly PlayMode[] = ['放置', 'オート', 'FC', 'PC'];
export const STARS_LIST: readonly Stars[] = [1, 2, 3, 4, 5];
export const MULTIPLIERS: readonly Multiplier[] = [1, 2, 3];
export const UNIT_PRESETS: readonly UnitPreset[] = ['max', 'ssr1', 'weak'];

/** 難易度別の基礎点 */
export const BASE_POINT: Record<Difficulty, number> = {
  EASY: 550,
  NORMAL: 650,
  HARD: 750,
  EXPERT: 1000,
};

/** 楽曲★倍率を 100 倍した整数（浮動小数点を避けるため） */
export const STAR_MULTIPLIER_X100: Record<Stars, number> = {
  1: 120,
  2: 123,
  3: 125,
  4: 128,
  5: 130,
};

/** 放置時のグレード係数を 100 倍した整数 */
export const IDLE_COEFFICIENT_X100 = 12;

/** 編成プリセット別のユニットボーナス */
export const UNIT_BONUS: Record<UnitPreset, number> = { max: 270, ssr1: 10, weak: 0 };

export const UNIT_LABEL: Record<UnitPreset, string> = {
  max: 'MAX編成',
  ssr1: 'SSR1枚Lv1',
  weak: 'SR以下Lv1',
};

/** プレイ方法 × 難易度のコンボボーナス */
export const COMBO_BONUS: Record<PlayMode, Record<Difficulty, number>> = {
  放置: { EASY: 0, NORMAL: 0, HARD: 0, EXPERT: 0 },
  オート: { EASY: 300, NORMAL: 300, HARD: 300, EXPERT: 300 },
  FC: { EASY: 440, NORMAL: 465, HARD: 491, EXPERT: 555 },
  PC: { EASY: 465, NORMAL: 495, HARD: 525, EXPERT: 600 },
};

/** PC は実際に出すのが難しいため既定 OFF（ADR 0049 決定 9） */
export const DEFAULT_PLAY_MODES: readonly PlayMode[] = ['放置', 'オート', 'FC'];

/** 開催中のポイント系イベントが無いときの特効%既定値 */
export const FALLBACK_BONUS_PCTS: readonly number[] = [0, 5, 20, 50, 100, 150, 200, 250, 300];

export const MAX_BONUS_PCT = 300;

/** 特効の合計に使えるスロット数（フレンド含む） */
export const DECK_SLOTS = 6;
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/unit/pointCalc/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gradePoint, livePoint } from '../../../src/lib/pointCalc/engine';
import type { LiveSpec } from '../../../src/lib/pointCalc/types';

const spec = (o: Partial<LiveSpec> = {}): LiveSpec => ({
  stars: 1, difficulty: 'EASY', playMode: 'FC', bonusPct: 0, unit: 'max', multiplier: 1, ...o,
});

describe('gradePoint', () => {
  it('FC は 基礎点 × ★倍率 の切り捨て', () => {
    expect(gradePoint('FC', 1, 'EASY')).toBe(660);   // 550 × 1.20
    expect(gradePoint('FC', 2, 'EASY')).toBe(676);   // 550 × 1.23 = 676.5 → 676
    expect(gradePoint('FC', 5, 'EXPERT')).toBe(1300); // 1000 × 1.30
  });

  it('PC は FC と同じグレードpt', () => {
    expect(gradePoint('PC', 3, 'HARD')).toBe(gradePoint('FC', 3, 'HARD'));
  });

  it('放置 は 基礎点 × ★倍率 × 0.12 の切り捨て', () => {
    expect(gradePoint('放置', 1, 'EASY')).toBe(79);  // 550 × 1.20 × 0.12 = 79.2 → 79
    expect(gradePoint('放置', 5, 'EASY')).toBe(85);  // 550 × 1.30 × 0.12 = 85.8 → 85
    expect(gradePoint('放置', 2, 'NORMAL')).toBe(95); // 650 × 1.23 × 0.12 = 95.94 → 95
  });

  it('オート は基礎点そのもの（★倍率が掛からない）', () => {
    expect(gradePoint('オート', 1, 'EASY')).toBe(550);
    expect(gradePoint('オート', 5, 'EASY')).toBe(550);
    expect(gradePoint('オート', 3, 'EXPERT')).toBe(1000);
  });
});

describe('livePoint', () => {
  it('スプレッドシート バディナナ用 E12（★1 EASY 放置 0% MAX編成）= 349', () => {
    expect(livePoint(spec({ playMode: '放置' }))).toBe(349);
  });

  it('スプレッドシート バディナナ用 F12（★1 EASY FC 0% MAX編成）= 1370', () => {
    expect(livePoint(spec())).toBe(1370);
  });

  it('スプレッドシート バディナナ用 G12（★1 EASY オート 0% MAX編成）= 1120', () => {
    expect(livePoint(spec({ playMode: 'オート' }))).toBe(1120);
  });

  it('スプレッドシート バディナナ用 AP16（★2 EASY FC 300% MAX編成）= 3414', () => {
    expect(livePoint(spec({ stars: 2, bonusPct: 300 }))).toBe(3414);
  });

  it('浮動小数点だとずれる 130% ケース: ★1 EASY FC 130% = 2228', () => {
    // 660 * (1 + 130/100) を浮動小数点で計算すると 1517.9999... → floor 1517 になり 1pt ずれる
    expect(livePoint(spec({ bonusPct: 130 }))).toBe(2228);
  });

  it('弱編成列 C12（★1 EASY 放置 0% SR以下Lv1）= 79', () => {
    expect(livePoint(spec({ playMode: '放置', unit: 'weak' }))).toBe(79);
  });

  it('弱編成列 D12（★1 EASY 放置 0% SSR1枚Lv1）= 89', () => {
    expect(livePoint(spec({ playMode: '放置', unit: 'ssr1' }))).toBe(89);
  });

  it('PC は FC + 難易度別の差分（★1 EASY 180%: FC 2558 / PC 2583）', () => {
    expect(livePoint(spec({ bonusPct: 180 }))).toBe(2558);
    expect(livePoint(spec({ playMode: 'PC', bonusPct: 180 }))).toBe(2583);
  });

  it('倍率ライブは 1 回分の pt を整数倍する', () => {
    expect(livePoint(spec({ multiplier: 2 }))).toBe(2740);
    expect(livePoint(spec({ multiplier: 3 }))).toBe(4110);
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `npx vitest run tests/unit/pointCalc/engine.test.ts`
Expected: FAIL（`src/lib/pointCalc/engine` が存在しない旨のエラー）

- [ ] **Step 5: エンジンを実装**

`src/lib/pointCalc/engine.ts`:

```ts
import {
  BASE_POINT,
  COMBO_BONUS,
  IDLE_COEFFICIENT_X100,
  STAR_MULTIPLIER_X100,
  UNIT_BONUS,
} from './constants';
import type { Difficulty, LiveSpec, PlayMode, Stars } from './types';

/**
 * 特効が乗る部分（グレードpt）を求める。
 *
 * オートだけは★倍率が掛からず基礎点そのものになる。スプレッドシートの実データが
 * ★1〜★5 で一律だったため、式を統一せず例外として扱う（ADR 0049）。
 */
export function gradePoint(playMode: PlayMode, stars: Stars, difficulty: Difficulty): number {
  const base = BASE_POINT[difficulty];
  if (playMode === 'オート') return base;
  const starX100 = STAR_MULTIPLIER_X100[stars];
  if (playMode === '放置') {
    return Math.floor((base * starX100 * IDLE_COEFFICIENT_X100) / 10000);
  }
  return Math.floor((base * starX100) / 100);
}

/**
 * ライブ 1 回で得られるイベントポイント。
 *
 * 特効の乗算は必ず整数で行う。`g * (1 + pct / 100)` と書くと
 * `660 * 2.3 = 1517.9999999999998` となり切り捨てで 1pt ずれる。
 */
export function livePoint(spec: LiveSpec): number {
  const grade = gradePoint(spec.playMode, spec.stars, spec.difficulty);
  const boosted = Math.floor((grade * (100 + spec.bonusPct)) / 100);
  const constant = UNIT_BONUS[spec.unit] + COMBO_BONUS[spec.playMode][spec.difficulty];
  return (boosted + constant) * spec.multiplier;
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run tests/unit/pointCalc/engine.test.ts`
Expected: PASS（全 12 テスト）

- [ ] **Step 7: lint と typecheck**

Run: `npm run lint && npm run typecheck`
Expected: どちらも exit 0

- [ ] **Step 8: コミット**

```bash
git add src/lib/pointCalc/types.ts src/lib/pointCalc/constants.ts src/lib/pointCalc/engine.ts tests/unit/pointCalc/engine.test.ts
git commit -m "feat(point-calc): 1ライブあたり獲得ptの計算エンジンを追加"
```

---

### Task 2: ゴールデンフィクスチャの抽出とゴールデンテスト

参照スプレッドシートの公開シート 8 枚から pt 表を取り込み、`engine.ts` が全セルを再現することを固定する。

**Files:**
- Create: `scripts/extract-point-calc-golden.mjs`
- Create: `tests/fixtures/point-calc-golden.json`（スクリプトの生成物。commit する）
- Create: `tests/unit/pointCalc/golden.test.ts`
- Modify: `package.json`（`scripts` に 1 行追加）

**Interfaces:**
- Consumes: `livePoint` / 型（Task 1）
- Produces: `tests/fixtures/point-calc-golden.json`。形は下記 Step 1 のスクリプトが書き出すとおり

- [ ] **Step 1: 抽出スクリプトを書く**

`scripts/extract-point-calc-golden.mjs`:

```js
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

/** RFC4180 相当の CSV パーサ（Google の export はダブルクォート＋改行を含む） */
function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuote) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else { inQuote = false; }
      } else { cur += c; }
    } else if (c === '"') { inQuote = true; }
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') { cur += c; }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

/** 0 始まりの列番号を A1 記法の列名にする */
function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "1,370" → 1370 / "" や "-" → null */
function toInt(raw) {
  const s = (raw ?? '').trim().replace(/,/g, '');
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
```

- [ ] **Step 2: npm script を追加**

`package.json` の `scripts` に追記（`extract-fixtures` の直後）:

```json
    "extract-point-calc-golden": "node scripts/extract-point-calc-golden.mjs",
```

- [ ] **Step 3: フィクスチャを生成する**

Run: `npm run extract-point-calc-golden`
Expected: 8 シート分のログが出て、最後に `合計 4423 セル / 除外 26 セル` と表示される。件数が違う場合はスプレッドシート側が更新されているので、差分の原因を確認してから `KNOWN_SHEET_ERRORS` を更新すること（安易に件数チェックを緩めない）。

- [ ] **Step 4: 失敗するゴールデンテストを書く**

`tests/unit/pointCalc/golden.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import golden from '../../fixtures/point-calc-golden.json';
import { livePoint } from '../../../src/lib/pointCalc/engine';
import type { LiveSpec } from '../../../src/lib/pointCalc/types';

interface GoldenCell extends LiveSpec {
  sheet: string;
  cell: string;
  expected: number;
}
interface KnownError extends LiveSpec {
  sheet: string;
  cell: string;
  value: number;
  reason: string;
}

const cells = golden.cells as unknown as GoldenCell[];
const knownErrors = golden.knownSheetErrors as unknown as KnownError[];

const toSpec = (c: LiveSpec): LiveSpec => ({
  stars: c.stars, difficulty: c.difficulty, playMode: c.playMode,
  bonusPct: c.bonusPct, unit: c.unit, multiplier: c.multiplier,
});

describe('ゴールデン: 参照スプレッドシートの獲得pt表', () => {
  it('4000 セル以上を検証対象にしている（フィクスチャが空でないことの保険）', () => {
    expect(cells.length).toBeGreaterThan(4000);
  });

  it('全セルが livePoint と一致する', () => {
    const mismatches = cells
      .filter(c => livePoint(toSpec(c)) !== c.expected)
      .map(c => `${c.sheet}!${c.cell} ★${c.stars} ${c.difficulty} ${c.playMode} ${c.bonusPct}% ${c.unit}: 期待 ${c.expected} / 実際 ${livePoint(toSpec(c))}`);
    expect(mismatches).toEqual([]);
  });
});

describe('ゴールデン: スプレッドシート側の既知の入力ミス', () => {
  it('26 件を除外している', () => {
    expect(knownErrors).toHaveLength(26);
  });

  it('すべて理由が書かれている', () => {
    for (const e of knownErrors) {
      expect(e.reason.length, `${e.sheet}!${e.cell} に理由がない`).toBeGreaterThan(10);
    }
  });

  it('除外セルではツールの出力がシートの値と一致しない（除外が意図的であることの固定）', () => {
    for (const e of knownErrors) {
      expect(livePoint(toSpec(e)), `${e.sheet}!${e.cell} がシート値と一致してしまった。除外が不要になった可能性がある`).not.toBe(e.value);
    }
  });
});
```

- [ ] **Step 5: テストを実行する**

Run: `npx vitest run tests/unit/pointCalc/golden.test.ts`
Expected: PASS（5 テスト）。もし「全セルが livePoint と一致する」が落ちたら、`mismatches` の中身を読み、**エンジンの式が誤っているのか / シート側の新しい入力ミスなのか**を必ず判断すること。判断せずに `KNOWN_SHEET_ERRORS` へ追加してはいけない。

- [ ] **Step 6: lint と typecheck**

Run: `npm run lint && npm run typecheck`
Expected: どちらも exit 0

- [ ] **Step 7: コミット**

```bash
git add scripts/extract-point-calc-golden.mjs tests/fixtures/point-calc-golden.json tests/unit/pointCalc/golden.test.ts package.json
git commit -m "test(point-calc): 参照スプレッドシート4423セルのゴールデンテストを追加"
```

---

### Task 3: 候補 pt 値の展開

**Files:**
- Create: `src/lib/pointCalc/candidates.ts`
- Test: `tests/unit/pointCalc/candidates.test.ts`

**Interfaces:**
- Consumes: `livePoint`（Task 1）、`LiveSpec` / `PlayMode` / `UnitPreset` / `Multiplier`（Task 1）
- Produces:
  - `interface CandidateOptions { bonusPcts: number[]; playModes: PlayMode[]; units: UnitPreset[]; multipliers: Multiplier[] }`
  - `interface Candidate { point: number; specs: LiveSpec[] }`
  - `function buildCandidates(options: CandidateOptions): Candidate[]` — `point` 昇順、同じ `point` は 1 件に集約し `specs` に全手段を保持

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/pointCalc/candidates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCandidates } from '../../../src/lib/pointCalc/candidates';
import { livePoint } from '../../../src/lib/pointCalc/engine';

const base = { bonusPcts: [0], playModes: ['FC'] as const, units: ['max'] as const, multipliers: [1] as const };

describe('buildCandidates', () => {
  it('★5 × 難易度4 = 20 通りを展開する', () => {
    const c = buildCandidates({ ...base, playModes: ['FC'], units: ['max'], multipliers: [1] });
    const specCount = c.reduce((n, x) => n + x.specs.length, 0);
    expect(specCount).toBe(20);
  });

  it('point 昇順に並ぶ', () => {
    const c = buildCandidates({ bonusPcts: [0, 100], playModes: ['FC', '放置'], units: ['max'], multipliers: [1, 2] });
    for (let i = 1; i < c.length; i++) expect(c[i].point).toBeGreaterThan(c[i - 1].point);
  });

  it('同じ pt になる条件は 1 件に集約され specs に全手段が入る', () => {
    // ★1〜★5 EASY のオートは★倍率が掛からないため全て同じ pt になる
    const c = buildCandidates({ bonusPcts: [0], playModes: ['オート'], units: ['max'], multipliers: [1] });
    const easy = c.find(x => x.specs.some(s => s.difficulty === 'EASY'));
    expect(easy?.specs.filter(s => s.difficulty === 'EASY')).toHaveLength(5);
  });

  it('弱編成は放置とのみ組み合わせる', () => {
    const c = buildCandidates({ bonusPcts: [0], playModes: ['放置', 'FC', 'オート'], units: ['weak'], multipliers: [1] });
    const modes = new Set(c.flatMap(x => x.specs).map(s => s.playMode));
    expect([...modes]).toEqual(['放置']);
  });

  it('MAX編成は全プレイ方法と組み合わせる', () => {
    const c = buildCandidates({ bonusPcts: [0], playModes: ['放置', 'FC'], units: ['max'], multipliers: [1] });
    const modes = new Set(c.flatMap(x => x.specs).map(s => s.playMode));
    expect([...modes].sort()).toEqual(['FC', '放置']);
  });

  it('point は livePoint と一致する', () => {
    const c = buildCandidates({ bonusPcts: [0, 150], playModes: ['FC'], units: ['max'], multipliers: [1, 3] });
    for (const cand of c) {
      for (const spec of cand.specs) expect(livePoint(spec)).toBe(cand.point);
    }
  });

  it('プレイ方法が空なら候補も空', () => {
    expect(buildCandidates({ ...base, playModes: [] })).toEqual([]);
  });

  it('特効%が空なら候補も空', () => {
    expect(buildCandidates({ ...base, bonusPcts: [] })).toEqual([]);
  });

  it('弱編成のみ × FC のみ なら候補は空（組み合わせが成立しない）', () => {
    expect(buildCandidates({ bonusPcts: [0], playModes: ['FC'], units: ['weak'], multipliers: [1] })).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/pointCalc/candidates.test.ts`
Expected: FAIL（`src/lib/pointCalc/candidates` が存在しない）

- [ ] **Step 3: 実装**

`src/lib/pointCalc/candidates.ts`:

```ts
import { DIFFICULTIES, STARS_LIST } from './constants';
import { livePoint } from './engine';
import type { LiveSpec, Multiplier, PlayMode, UnitPreset } from './types';

export interface CandidateOptions {
  /** 使ってよい特効%（整数パーセント） */
  bonusPcts: readonly number[];
  playModes: readonly PlayMode[];
  units: readonly UnitPreset[];
  multipliers: readonly Multiplier[];
}

/** 同じ pt になる条件をまとめた候補 */
export interface Candidate {
  point: number;
  /** その pt を出せる条件の一覧（表示時に「別の手段」として使える） */
  specs: LiveSpec[];
}

/**
 * 弱編成（SSR1枚Lv1 / SR以下Lv1）は放置とのみ組み合わせる。
 * 弱編成でオートやフルコンボを取る運用は現実的でないため、スプレッドシートも同じ扱いになっている。
 */
function isValidPair(unit: UnitPreset, playMode: PlayMode): boolean {
  return unit === 'max' || playMode === '放置';
}

export function buildCandidates(options: CandidateOptions): Candidate[] {
  const byPoint = new Map<number, LiveSpec[]>();
  for (const unit of options.units) {
    for (const playMode of options.playModes) {
      if (!isValidPair(unit, playMode)) continue;
      for (const bonusPct of options.bonusPcts) {
        for (const multiplier of options.multipliers) {
          for (const stars of STARS_LIST) {
            for (const difficulty of DIFFICULTIES) {
              const spec: LiveSpec = { stars, difficulty, playMode, bonusPct, unit, multiplier };
              const point = livePoint(spec);
              const list = byPoint.get(point);
              if (list) list.push(spec);
              else byPoint.set(point, [spec]);
            }
          }
        }
      }
    }
  }
  return [...byPoint.entries()]
    .map(([point, specs]) => ({ point, specs }))
    .sort((a, b) => a.point - b.point);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/pointCalc/candidates.test.ts`
Expected: PASS（9 テスト）

- [ ] **Step 5: lint と typecheck**

Run: `npm run lint && npm run typecheck`
Expected: どちらも exit 0

- [ ] **Step 6: コミット**

```bash
git add src/lib/pointCalc/candidates.ts tests/unit/pointCalc/candidates.test.ts
git commit -m "feat(point-calc): 候補pt値の展開と同値集約を追加"
```

---

### Task 4: ソルバー（メイン周回 + 端数 DP）

**Files:**
- Create: `src/lib/pointCalc/solver.ts`
- Test: `tests/unit/pointCalc/solver.test.ts`

**Interfaces:**
- Consumes: `Candidate`（Task 3）、`LiveSpec`（Task 1）
- Produces:
  - `interface SolverInput { diff: number; candidates: Candidate[]; mainPoint?: number; kBack?: number; maxResults?: number }`
  - `interface SolutionLine { point: number; count: number; specs: LiveSpec[] }`
  - `interface Solution { lines: SolutionLine[]; totalCount: number; totalPoint: number; remainder: number }`
  - `function solve(input: SolverInput): Solution[]` — `|remainder|` 昇順、同じなら `totalCount` 昇順
  - `const DEFAULT_K_BACK = 2`, `const DEFAULT_MAX_RESULTS = 5`

**設計メモ（実装前に読むこと）:**

- `remainder = diff - totalPoint`。ぴったりなら 0、不足なら正、超過なら負。
- 並び順は **`|remainder|` 昇順 → `totalCount` 昇順**。ぴったりの解（`remainder === 0`）が常に先頭に来て、その中ではライブ回数の少ない順になる。「回数優先」にすると、1 回多く叩けばぴったりになる場面でズレた解が上に来てしまう。
- DP は `0..rMax` を 1 回だけ計算すれば全ての `k` について答えが得られる。`k` ごとに DP を回さないこと。
- `rMax = diff - kMin * mainPoint + mainPoint`（`kMin = max(0, floor(diff / mainPoint) - kBack)`）。末尾の `+ mainPoint` は**超過側の近似解を作るための余裕**。これが無いと、たとえば候補が 100pt だけで差異が 7pt のとき「0 回で残り 7pt」しか作れず、解が空になる。`rMax <= (kBack + 2) * mainPoint` なので上限は自然に抑えられる（最悪 4 × 18,210 ≒ 73,000）。
- ぴったり作れない `target` に対しては、**到達可能な直下の値と直上の値の両方**を解として出す。直下だけだと上記の空解問題が起きる。
- メイン周回の `mainPoint` は候補にも含まれるので、DP が同じ値を選んだら 1 行にマージする。

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/pointCalc/solver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { solve } from '../../../src/lib/pointCalc/solver';
import { buildCandidates } from '../../../src/lib/pointCalc/candidates';
import type { Candidate } from '../../../src/lib/pointCalc/candidates';

/** テスト用に pt 値だけを持つ候補を作る */
const fake = (...points: number[]): Candidate[] =>
  points.sort((a, b) => a - b).map(point => ({
    point,
    specs: [{ stars: 1, difficulty: 'EASY', playMode: '放置', bonusPct: 0, unit: 'weak', multiplier: 1 }],
  }));

describe('solve: 基本', () => {
  it('差異が候補ちょうどなら 1 行 1 回で解ける', () => {
    const [best] = solve({ diff: 100, candidates: fake(100) });
    expect(best.lines).toEqual([expect.objectContaining({ point: 100, count: 1 })]);
    expect(best.totalCount).toBe(1);
    expect(best.remainder).toBe(0);
  });

  it('同じ値を複数回使う場合は 1 行にまとめる', () => {
    const [best] = solve({ diff: 300, candidates: fake(100) });
    expect(best.lines).toHaveLength(1);
    expect(best.lines[0]).toMatchObject({ point: 100, count: 3 });
    expect(best.remainder).toBe(0);
  });

  it('複数の値を組み合わせてぴったりにする', () => {
    const [best] = solve({ diff: 130, candidates: fake(100, 30) });
    expect(best.remainder).toBe(0);
    expect(best.totalCount).toBe(2);
    expect(best.lines.map(l => l.point).sort((a, b) => a - b)).toEqual([30, 100]);
  });

  it('内訳の合計 + remainder が常に差異と一致する', () => {
    const results = solve({ diff: 7777, candidates: fake(79, 349, 1370, 2228) });
    for (const r of results) {
      const sum = r.lines.reduce((n, l) => n + l.point * l.count, 0);
      expect(sum).toBe(r.totalPoint);
      expect(sum + r.remainder).toBe(7777);
    }
  });

  it('残差の小さい順、同じならライブ回数の少ない順に並ぶ', () => {
    const results = solve({ diff: 7777, candidates: fake(79, 349, 1370, 2228) });
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const cur = results[i];
      expect(Math.abs(cur.remainder)).toBeGreaterThanOrEqual(Math.abs(prev.remainder));
      if (Math.abs(cur.remainder) === Math.abs(prev.remainder)) {
        expect(cur.totalCount).toBeGreaterThanOrEqual(prev.totalCount);
      }
    }
  });
});

describe('solve: 到達不能ケース', () => {
  it('ぴったり作れないときは残差付きの近似解を返す（空配列を返さない）', () => {
    const results = solve({ diff: 7, candidates: fake(100) });
    expect(results.length).toBeGreaterThan(0);
    const [best] = results;
    expect(best.remainder).not.toBe(0);
    // 100pt を 1 回叩いて 93pt 超過する解が出る
    expect(best.lines).toEqual([expect.objectContaining({ point: 100, count: 1 })]);
    expect(best.remainder).toBe(-93);
  });

  it('不足側と超過側の両方を候補に出す', () => {
    const results = solve({ diff: 253, candidates: fake(100) });
    const remainders = results.map(r => r.remainder).sort((a, b) => a - b);
    expect(remainders).toContain(53);  // 100 × 2 で 53pt 不足
    expect(remainders).toContain(-47); // 100 × 3 で 47pt 超過
  });

  it('近似解でも 内訳合計 + remainder = 差異 を満たす', () => {
    for (const r of solve({ diff: 253, candidates: fake(100) })) {
      const sum = r.lines.reduce((n, l) => n + l.point * l.count, 0);
      expect(sum + r.remainder).toBe(253);
    }
  });

  it('空の内訳（0 回で残り全部）は解として返さない', () => {
    for (const r of solve({ diff: 7, candidates: fake(100) })) {
      expect(r.lines.length).toBeGreaterThan(0);
      expect(r.totalCount).toBeGreaterThan(0);
    }
  });
});

describe('solve: 入力の境界', () => {
  it('候補が空なら空配列', () => {
    expect(solve({ diff: 100, candidates: [] })).toEqual([]);
  });

  it('差異が 0 なら空配列', () => {
    expect(solve({ diff: 0, candidates: fake(100) })).toEqual([]);
  });

  it('差異が負なら空配列', () => {
    expect(solve({ diff: -5, candidates: fake(100) })).toEqual([]);
  });

  it('mainPoint を明示すると必ずその値を主に使う', () => {
    const [best] = solve({ diff: 10000, candidates: fake(100, 5000), mainPoint: 100 });
    expect(best.lines.some(l => l.point === 100 && l.count >= 50)).toBe(true);
  });

  it('mainPoint に候補外の値を渡しても落ちない（最大値へフォールバック）', () => {
    const results = solve({ diff: 10000, candidates: fake(100, 5000), mainPoint: 12345 });
    expect(results.length).toBeGreaterThan(0);
  });

  it('maxResults で件数を絞れる', () => {
    expect(solve({ diff: 7777, candidates: fake(79, 349, 1370), maxResults: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('差異がメイン pt より小さくても解ける', () => {
    const [best] = solve({ diff: 79, candidates: fake(79, 18075) });
    expect(best.remainder).toBe(0);
  });
});

describe('solve: 実データ相当', () => {
  it('差異 7,777,777 を PC 抜き・特効 0/150/300% でぴったり解ける', () => {
    const candidates = buildCandidates({
      bonusPcts: [0, 150, 300],
      playModes: ['放置', 'オート', 'FC'],
      units: ['max', 'ssr1', 'weak'],
      multipliers: [1, 2, 3],
    });
    const results = solve({ diff: 7_777_777, candidates });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].remainder).toBe(0);
    // 最大 pt は ★5 EXPERT FC 300% 3倍 = 18,075。430 回強で届く
    expect(results[0].totalCount).toBeLessThan(500);
  });

  it('特効%を全達成段階に広げても 3 秒以内に返る', () => {
    const bonusPcts = new Set<number>();
    for (let a = 0; a <= 6; a++) {
      for (let b = 0; b <= 6 - a; b++) {
        for (let c = 0; c <= 6 - a - b; c++) bonusPcts.add(a * 50 + b * 20 + c * 5);
      }
    }
    const candidates = buildCandidates({
      bonusPcts: [...bonusPcts].filter(p => p <= 300),
      playModes: ['放置', 'オート', 'FC'],
      units: ['max', 'ssr1', 'weak'],
      multipliers: [1, 2, 3],
    });
    const start = performance.now();
    const results = solve({ diff: 7_777_777, candidates });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(results[0].remainder).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/pointCalc/solver.test.ts`
Expected: FAIL（`src/lib/pointCalc/solver` が存在しない）

- [ ] **Step 3: 実装**

`src/lib/pointCalc/solver.ts`:

```ts
import type { Candidate } from './candidates';
import type { LiveSpec } from './types';

export interface SolverInput {
  /** 目標pt − 現在pt。正の整数のみ扱う */
  diff: number;
  /** point 昇順の候補（buildCandidates の出力） */
  candidates: Candidate[];
  /** メイン周回に使う pt。未指定または候補外なら候補の最大値 */
  mainPoint?: number;
  /** メイン周回を何回まで減らして候補を作るか */
  kBack?: number;
  maxResults?: number;
}

export interface SolutionLine {
  point: number;
  count: number;
  /** その pt を出せる条件（先頭が代表） */
  specs: LiveSpec[];
}

export interface Solution {
  lines: SolutionLine[];
  totalCount: number;
  totalPoint: number;
  /** diff − totalPoint。0 ならぴったり、正なら不足、負なら超過 */
  remainder: number;
}

export const DEFAULT_K_BACK = 2;
export const DEFAULT_MAX_RESULTS = 5;

const UNREACHABLE = 0x3fff_ffff;

export function solve(input: SolverInput): Solution[] {
  const { diff, candidates } = input;
  if (diff <= 0 || candidates.length === 0) return [];

  const kBack = input.kBack ?? DEFAULT_K_BACK;
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;

  const points = Int32Array.from(candidates.map(c => c.point));
  const specsOf = new Map(candidates.map(c => [c.point, c.specs]));
  const maxPoint = points[points.length - 1];
  const mainPoint = input.mainPoint !== undefined && specsOf.has(input.mainPoint)
    ? input.mainPoint
    : maxPoint;

  const kBase = Math.floor(diff / mainPoint);
  const kMin = Math.max(0, kBase - kBack);
  // 末尾の + mainPoint は超過側の近似解を作るための余裕。
  // これが無いと「候補 100pt だけ・差異 7pt」で 0 回の解しか作れず結果が空になる。
  const rMax = diff - kMin * mainPoint + mainPoint;

  // 0..rMax の各金額をぴったり作る最小ライブ回数と、その 1 手前に使った値
  const minCount = new Int32Array(rMax + 1).fill(UNREACHABLE);
  const pickedPoint = new Int32Array(rMax + 1).fill(-1);
  minCount[0] = 0;
  for (let amount = 1; amount <= rMax; amount++) {
    let best = UNREACHABLE;
    let bestPoint = -1;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p > amount) break;
      const prev = minCount[amount - p];
      if (prev + 1 < best) {
        best = prev + 1;
        bestPoint = p;
      }
    }
    minCount[amount] = best;
    pickedPoint[amount] = bestPoint;
  }

  /**
   * amount 自身が到達可能ならそれだけを、到達不能なら直下と直上の到達可能な金額を返す。
   * minCount[0] = 0 なので直下は必ず見つかる（最悪 0）。直上は範囲外なら省かれる。
   */
  function reachableAround(amount: number): number[] {
    if (minCount[amount] < UNREACHABLE) return [amount];
    let below = 0;
    for (let a = amount - 1; a > 0; a--) {
      if (minCount[a] < UNREACHABLE) { below = a; break; }
    }
    const result = [below];
    for (let a = amount + 1; a <= rMax; a++) {
      if (minCount[a] < UNREACHABLE) { result.push(a); break; }
    }
    return result;
  }

  const solutions: Solution[] = [];
  const seen = new Set<string>();
  for (let k = kBase; k >= kMin; k--) {
    const target = diff - k * mainPoint;
    for (const reached of reachableAround(target)) {
      const counts = new Map<number, number>();
      if (k > 0) counts.set(mainPoint, k);
      for (let amount = reached; amount > 0;) {
        const p = pickedPoint[amount];
        counts.set(p, (counts.get(p) ?? 0) + 1);
        amount -= p;
      }
      // 「0 回で残り全部」は解として無意味なので捨てる
      if (counts.size === 0) continue;

      const lines: SolutionLine[] = [...counts.entries()]
        .map(([point, count]) => ({ point, count, specs: specsOf.get(point) ?? [] }))
        .sort((a, b) => b.point - a.point);
      const key = lines.map(l => `${l.point}x${l.count}`).join(',');
      if (seen.has(key)) continue;
      seen.add(key);

      const totalPoint = lines.reduce((n, l) => n + l.point * l.count, 0);
      const totalCount = lines.reduce((n, l) => n + l.count, 0);
      solutions.push({ lines, totalCount, totalPoint, remainder: diff - totalPoint });
    }
  }

  // ぴったりの解を先頭に出す。同じ残差ならライブ回数の少ない順
  return solutions
    .sort((a, b) => Math.abs(a.remainder) - Math.abs(b.remainder) || a.totalCount - b.totalCount)
    .slice(0, maxResults);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/pointCalc/solver.test.ts`
Expected: PASS（18 テスト）。「特効%を全達成段階に広げても 3 秒以内に返る」は Node での実測で約 480ms（特効% 49 種・ユニーク pt 3,916・`rMax` 59,752）。1 秒を大きく超えるようなら DP のループを見直すこと

- [ ] **Step 5: カバレッジを確認**

Run: `npm run coverage`
Expected: exit 0。`src/lib/pointCalc/**` が 95% 以上。下回る行があれば、その分岐に到達するテストを追加する（`/* v8 ignore */` は本当に到達不能な防御的分岐にのみ使う）。`reachableAround` の「直上が見つからない」経路だけはテストで到達させにくいので、カバレッジが落ちる場合に限り `/* v8 ignore next */` を付けてよい

- [ ] **Step 6: lint と typecheck**

Run: `npm run lint && npm run typecheck`
Expected: どちらも exit 0

- [ ] **Step 7: コミット**

```bash
git add src/lib/pointCalc/solver.ts tests/unit/pointCalc/solver.test.ts
git commit -m "feat(point-calc): メイン周回+端数DPのソルバーを追加"
```

---

### Task 5: イベントから特効%の既定値を作る

**Files:**
- Create: `src/lib/pointCalc/bonusPresets.ts`
- Test: `tests/unit/pointCalc/bonusPresets.test.ts`

**Interfaces:**
- Consumes: `DECK_SLOTS` / `MAX_BONUS_PCT` / `FALLBACK_BONUS_PCTS`（Task 1）、`isEventLive`（既存 `src/lib/data/eventBonusTiers.ts`）
- Produces:
  - `interface PointEventSummary { id: number; eventname: string; start_date: string; end_date: string; gptUps: number[] }`
  - `function isPointEvent(eventtype?: string | null): boolean`
  - `function achievableBonusPcts(gptUps: readonly number[], slots?: number, maxPct?: number): number[]`
  - `function pickDefaultEvent(events: readonly PointEventSummary[], now?: number): PointEventSummary | null`
  - `function defaultBonusPcts(events: readonly PointEventSummary[], now?: number): number[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/pointCalc/bonusPresets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  achievableBonusPcts,
  defaultBonusPcts,
  isPointEvent,
  pickDefaultEvent,
  type PointEventSummary,
} from '../../../src/lib/pointCalc/bonusPresets';
import { FALLBACK_BONUS_PCTS } from '../../../src/lib/pointCalc/constants';

const ev = (o: Partial<PointEventSummary> = {}): PointEventSummary => ({
  id: 1, eventname: 'テスト', start_date: '2026-06-01', end_date: '2026-06-08', gptUps: [50, 20, 5], ...o,
});

// 2026-06-05 12:00 JST
const DURING = Date.parse('2026-06-05T12:00:00+09:00');
// 2026-07-01 12:00 JST
const AFTER = Date.parse('2026-07-01T12:00:00+09:00');

describe('isPointEvent', () => {
  it('ポイント系イベントを判定する', () => {
    expect(isPointEvent('ポイントライブイベント')).toBe(true);
    expect(isPointEvent('ポイントミッションイベント')).toBe(true);
  });

  it('ポイント系でないものは false', () => {
    expect(isPointEvent('ハイスコアライブイベント')).toBe(false);
    expect(isPointEvent('ミッションイベント')).toBe(false);
    expect(isPointEvent('')).toBe(false);
    expect(isPointEvent(null)).toBe(false);
    expect(isPointEvent(undefined)).toBe(false);
  });
});

describe('achievableBonusPcts', () => {
  it('0 を必ず含み昇順で返す', () => {
    const r = achievableBonusPcts([50, 20, 5]);
    expect(r[0]).toBe(0);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
  });

  it('6 スロット分の組合せを列挙する（50/20/5 なら 300% まで到達）', () => {
    const r = achievableBonusPcts([50, 20, 5]);
    expect(r).toContain(300); // 50 × 6
    expect(r).toContain(130); // 20 × 4 + 50
    expect(r).toContain(60);  // 20 × 2 + 5 × 4
  });

  it('上限を超える値は含まない', () => {
    for (const p of achievableBonusPcts([50, 20, 5])) expect(p).toBeLessThanOrEqual(300);
  });

  it('0 の段階は無視する（未設定のティア）', () => {
    expect(achievableBonusPcts([50, 0, 0])).toEqual([0, 50, 100, 150, 200, 250, 300]);
  });

  it('全ティアが 0 なら [0] のみ', () => {
    expect(achievableBonusPcts([0, 0, 0])).toEqual([0]);
  });

  it('スロット数と上限を変えられる', () => {
    expect(achievableBonusPcts([50], 2, 300)).toEqual([0, 50, 100]);
    expect(achievableBonusPcts([50], 6, 100)).toEqual([0, 50, 100]);
  });
});

describe('pickDefaultEvent', () => {
  it('開催中のイベントを選ぶ', () => {
    const events = [ev({ id: 1, start_date: '2026-05-01', end_date: '2026-05-08' }), ev({ id: 2 })];
    expect(pickDefaultEvent(events, DURING)?.id).toBe(2);
  });

  it('開催中が無ければ開始日が最も新しいものを選ぶ', () => {
    const events = [ev({ id: 1, start_date: '2026-05-01', end_date: '2026-05-08' }), ev({ id: 2 })];
    expect(pickDefaultEvent(events, AFTER)?.id).toBe(2);
  });

  it('特効が全て 0 のイベントは選ばない', () => {
    const events = [ev({ id: 1 }), ev({ id: 2, start_date: '2026-06-20', end_date: '2026-06-27', gptUps: [0, 0, 0] })];
    expect(pickDefaultEvent(events, AFTER)?.id).toBe(1);
  });

  it('候補が無ければ null', () => {
    expect(pickDefaultEvent([], DURING)).toBeNull();
    expect(pickDefaultEvent([ev({ gptUps: [0, 0, 0] })], DURING)).toBeNull();
  });
});

describe('defaultBonusPcts', () => {
  it('選ばれたイベントの達成可能段階を返す', () => {
    expect(defaultBonusPcts([ev()], DURING)).toEqual(achievableBonusPcts([50, 20, 5]));
  });

  it('イベントが無ければフォールバックを返す', () => {
    expect(defaultBonusPcts([], DURING)).toEqual([...FALLBACK_BONUS_PCTS]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/pointCalc/bonusPresets.test.ts`
Expected: FAIL（`src/lib/pointCalc/bonusPresets` が存在しない）

- [ ] **Step 3: 実装**

`src/lib/pointCalc/bonusPresets.ts`:

```ts
import { isEventLive } from '../data/eventBonusTiers';
import { DECK_SLOTS, FALLBACK_BONUS_PCTS, MAX_BONUS_PCT } from './constants';

/** ポイント系イベントのうち、特効%の生成に必要な情報だけを取り出したもの */
export interface PointEventSummary {
  id: number;
  eventname: string;
  start_date: string;
  end_date: string;
  /** 金・銀・銅の gpt_up（グレードpt上昇率。単位は%） */
  gptUps: number[];
}

/** イベント種別がポイント系か判定する（表記揺れに備え includes 判定） */
export function isPointEvent(eventtype?: string | null): boolean {
  return !!eventtype && eventtype.includes('ポイント');
}

/**
 * 各ティアの gpt_up を最大 slots 枚まで自由に組み合わせて到達できる特効%を列挙する。
 * フレンド枠を含めた 6 スロット全部が特効なら 50 × 6 = 300% になる。
 */
export function achievableBonusPcts(
  gptUps: readonly number[],
  slots: number = DECK_SLOTS,
  maxPct: number = MAX_BONUS_PCT,
): number[] {
  const tiers = gptUps.filter(v => v > 0);
  const found = new Set<number>([0]);
  const walk = (index: number, used: number, total: number) => {
    if (index >= tiers.length) return;
    for (let n = 1; used + n <= slots; n++) {
      const next = total + tiers[index] * n;
      if (next > maxPct) break;
      found.add(next);
      walk(index + 1, used + n, next);
    }
    walk(index + 1, used, total);
  };
  walk(0, 0, 0);
  return [...found].sort((a, b) => a - b);
}

/**
 * 特効%の既定値に使うイベントを選ぶ。
 * 開催中のものを優先し、無ければ開始日が最も新しいものを使う。特効が全て 0 のイベントは対象外。
 */
export function pickDefaultEvent(
  events: readonly PointEventSummary[],
  now: number = Date.now(),
): PointEventSummary | null {
  const usable = events.filter(e => e.gptUps.some(v => v > 0));
  if (usable.length === 0) return null;
  const live = usable.find(e => isEventLive(e.start_date, e.end_date, now));
  if (live) return live;
  return usable.reduce((a, b) => (b.start_date > a.start_date ? b : a));
}

/** 特効%チップの既定値 */
export function defaultBonusPcts(
  events: readonly PointEventSummary[],
  now: number = Date.now(),
): number[] {
  const event = pickDefaultEvent(events, now);
  if (!event) return [...FALLBACK_BONUS_PCTS];
  return achievableBonusPcts(event.gptUps);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/pointCalc/bonusPresets.test.ts`
Expected: PASS（14 テスト）

- [ ] **Step 5: lint / typecheck / カバレッジ**

Run: `npm run lint && npm run typecheck && npm run coverage`
Expected: すべて exit 0

- [ ] **Step 6: コミット**

```bash
git add src/lib/pointCalc/bonusPresets.ts tests/unit/pointCalc/bonusPresets.test.ts
git commit -m "feat(point-calc): イベントのgpt_upから特効%既定値を生成する"
```

---

### Task 6: UI（ページ・コンポーネント・ナビ・永続化）

**Files:**
- Modify: `src/lib/storage.ts`（`STORAGE_KEYS` に 1 行追加）
- Modify: `src/lib/seo.ts`（`PAGE_DESCRIPTIONS` に 1 行追加）
- Modify: `src/components/HeaderNav.svelte`（`items` の「スコア計算」ドロップダウンに 1 行追加）
- Create: `src/pages/point-calc/index.astro`
- Create: `src/components/PointCalc.svelte`
- Test: `tests/unit/pointCalc/storageKey.test.ts`

**Interfaces:**
- Consumes: `buildCandidates`（Task 3）、`solve` / `Solution`（Task 4）、`defaultBonusPcts` / `PointEventSummary`（Task 5）、`UNIT_LABEL` / `DEFAULT_PLAY_MODES` / `PLAY_MODES` / `UNIT_PRESETS` / `MULTIPLIERS` / `MAX_BONUS_PCT`（Task 1）
- Produces: なし（最終利用者向け UI）

- [ ] **Step 1: localStorage キーのテストを書く**

`tests/unit/pointCalc/storageKey.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS } from '../../../src/lib/storage';

describe('ポイント芸計算ツールの localStorage キー', () => {
  it('STORAGE_KEYS に登録されている（FooterTools のバックアップ対象に含めるため）', () => {
    expect(STORAGE_KEYS.POINT_CALC_STATE).toBe('i7_point_calc_state');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/pointCalc/storageKey.test.ts`
Expected: FAIL（`POINT_CALC_STATE` が `undefined`）

- [ ] **Step 3: STORAGE_KEYS に追加**

`src/lib/storage.ts` の `STORAGE_KEYS` に `MAX_FINDER_EVENT_ID` の次の行として追記:

```ts
  POINT_CALC_STATE: 'i7_point_calc_state',
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/pointCalc/storageKey.test.ts`
Expected: PASS

- [ ] **Step 5: SEO 説明文を追加**

`src/lib/seo.ts` の `PAGE_DESCRIPTIONS` に `sharedBroach` の隣として追記:

```ts
  pointCalc: 'アイドリッシュセブン (アイナナ) のイベントポイントを狙った数字にぴったり合わせる「ポイント芸」の計算ツール。目標ptと現在ptから、必要なライブの組合せを自動で提示します。',
```

- [ ] **Step 6: ナビに追加**

`src/components/HeaderNav.svelte` の `items` 内、「スコア計算」ドロップダウンの `children` 末尾に追記:

```ts
        { href: `${base}point-calc/`, label: 'ポイント芸計算' },
```

- [ ] **Step 7: ページを作る**

`src/pages/point-calc/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import PointCalc from '../../components/PointCalc.svelte';
import { PAGE_DESCRIPTIONS } from '../../lib/seo.ts';
import { fetchEventsCsv } from '../../lib/data/fetchEventsCsv.ts';
import { isPointEvent, type PointEventSummary } from '../../lib/pointCalc/bonusPresets.ts';

const base = import.meta.env.BASE_URL;
const breadcrumbs = [
  { name: 'ホーム', url: base },
  { name: 'ポイント芸計算', url: `${base}point-calc/` },
];

// 特効%の既定値を作るため、ポイント系イベントの gpt_up だけをビルド時に渡す。
// 開催中かどうかの判定はクライアント側の現在時刻で行う（静的サイトのため）。
const events: PointEventSummary[] = (await fetchEventsCsv())
  .filter(event => isPointEvent(event.eventtype))
  .map(event => ({
    id: event.id,
    eventname: event.eventname,
    start_date: event.start_date,
    end_date: event.end_date,
    gptUps: [event.gold.gpt_up, event.silver.gpt_up, event.bronze.gpt_up],
  }));
---

<BaseLayout title="ポイント芸計算" description={PAGE_DESCRIPTIONS.pointCalc} breadcrumbs={breadcrumbs}>
  <h1 class="text-2xl font-bold text-display mb-4">ポイント芸計算</h1>
  <p class="text-sm text-gray-600 mb-6 text-pretty">
    イベントポイントを狙った数字にぴったり合わせるための計算ツールです。目標ptと現在ptを入れると、
    差異ぴったりになるライブの組合せをライブ回数の少ない順に提示します。
  </p>

  <PointCalc events={events} client:load />
</BaseLayout>
```

- [ ] **Step 8: コンポーネントを作る**

`src/components/PointCalc.svelte`:

```svelte
<script lang="ts">
  import { buildCandidates } from '../lib/pointCalc/candidates';
  import { solve, type Solution } from '../lib/pointCalc/solver';
  import { defaultBonusPcts, type PointEventSummary } from '../lib/pointCalc/bonusPresets';
  import {
    DEFAULT_PLAY_MODES, MAX_BONUS_PCT, MULTIPLIERS, PLAY_MODES, UNIT_LABEL, UNIT_PRESETS,
  } from '../lib/pointCalc/constants';
  import type { Multiplier, PlayMode, UnitPreset } from '../lib/pointCalc/types';
  import { STORAGE_KEYS, loadJson, saveJson } from '../lib/storage';

  type Props = { events: PointEventSummary[] };
  let { events }: Props = $props();

  interface PersistedState {
    targetPt: number | null;
    currentPt: number | null;
    bonusPcts: number[];
    playModes: PlayMode[];
    units: UnitPreset[];
    multipliers: Multiplier[];
  }

  function initialState(): PersistedState {
    return {
      targetPt: null,
      currentPt: null,
      bonusPcts: defaultBonusPcts(events),
      playModes: [...DEFAULT_PLAY_MODES],
      units: [...UNIT_PRESETS],
      multipliers: [...MULTIPLIERS],
    };
  }

  const saved = loadJson<Partial<PersistedState>>(STORAGE_KEYS.POINT_CALC_STATE, {});
  const base = initialState();

  let targetPt = $state<number | null>(saved.targetPt ?? base.targetPt);
  let currentPt = $state<number | null>(saved.currentPt ?? base.currentPt);
  let bonusPcts = $state<number[]>(saved.bonusPcts ?? base.bonusPcts);
  let playModes = $state<PlayMode[]>(saved.playModes ?? base.playModes);
  let units = $state<UnitPreset[]>(saved.units ?? base.units);
  let multipliers = $state<Multiplier[]>(saved.multipliers ?? base.multipliers);
  let newBonusPct = $state<number | null>(null);
  let solutions = $state<Solution[]>([]);
  let calculating = $state(false);
  let message = $state('');

  const diff = $derived((targetPt ?? 0) - (currentPt ?? 0));

  $effect(() => {
    saveJson(STORAGE_KEYS.POINT_CALC_STATE, {
      targetPt, currentPt, bonusPcts, playModes, units, multipliers,
    } satisfies PersistedState);
  });

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  }

  function addBonusPct() {
    const v = newBonusPct;
    if (v === null || !Number.isInteger(v) || v < 0 || v > MAX_BONUS_PCT) return;
    if (!bonusPcts.includes(v)) bonusPcts = [...bonusPcts, v].sort((a, b) => a - b);
    newBonusPct = null;
  }

  function removeBonusPct(pct: number) {
    bonusPcts = bonusPcts.filter(p => p !== pct);
  }

  function resetBonusPcts() {
    bonusPcts = defaultBonusPcts(events);
  }

  function calculate() {
    message = '';
    solutions = [];
    if (diff <= 0) {
      message = '目標ptが現在ptより大きくなるように入力してください。';
      return;
    }
    const candidates = buildCandidates({ bonusPcts, playModes, units, multipliers });
    if (candidates.length === 0) {
      message = '条件に合うライブがありません。特効%・プレイ方法・編成・倍率のいずれかを有効にしてください。';
      return;
    }
    calculating = true;
    // 探索は最悪でも 400ms 程度だが、ボタン押下直後に「計算中」を描画させるため 1 フレーム待つ
    requestAnimationFrame(() => {
      solutions = solve({ diff, candidates });
      calculating = false;
      if (solutions.length === 0) message = '組合せが見つかりませんでした。';
    });
  }

  const fmt = (n: number) => n.toLocaleString('ja-JP');

  function specLabel(solution: Solution, index: number): string {
    const spec = solution.lines[index].specs[0];
    /* v8 ignore next -- specs は必ず 1 件以上入る */
    if (!spec) return '';
    const unit = spec.unit === 'max' ? '' : ` / ${UNIT_LABEL[spec.unit]}`;
    return `★${spec.stars} ${spec.difficulty} / ${spec.playMode} / ${spec.bonusPct}% / ${spec.multiplier}倍${unit}`;
  }
</script>

<section class="surface-card p-4 mb-6">
  <h2 class="text-lg font-bold mb-3">目標</h2>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <label class="block">
      <span class="block text-sm text-gray-600 mb-1">目標pt</span>
      <input
        type="number" min="0" inputmode="numeric" data-testid="target-pt"
        bind:value={targetPt}
        class="w-full border border-gray-300 rounded px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
      />
    </label>
    <label class="block">
      <span class="block text-sm text-gray-600 mb-1">現在のpt</span>
      <input
        type="number" min="0" inputmode="numeric" data-testid="current-pt"
        bind:value={currentPt}
        class="w-full border border-gray-300 rounded px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
      />
    </label>
    <div>
      <span class="block text-sm text-gray-600 mb-1">差異</span>
      <p class="px-3 py-2 text-right text-xl font-bold tabular-nums" data-testid="diff">{fmt(diff)}</p>
    </div>
  </div>
</section>

<section class="surface-card p-4 mb-6">
  <div class="flex items-baseline justify-between mb-3">
    <h2 class="text-lg font-bold">使ってよい特効%</h2>
    <button type="button" class="text-sm text-gray-600 underline" onclick={resetBonusPcts}>既定に戻す</button>
  </div>
  <div class="flex flex-wrap gap-2 mb-3" data-testid="bonus-chips">
    {#each bonusPcts as pct (pct)}
      <span class="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm tabular-nums">
        {pct}%
        <button type="button" class="text-gray-500 hover:text-gray-900" aria-label="{pct}% を削除" onclick={() => removeBonusPct(pct)}>×</button>
      </span>
    {/each}
    {#if bonusPcts.length === 0}
      <span class="text-sm text-gray-500">特効%が 1 つも選ばれていません。</span>
    {/if}
  </div>
  <div class="flex items-center gap-2">
    <input
      type="number" min="0" max={MAX_BONUS_PCT} placeholder="追加する%" data-testid="new-bonus-pct"
      bind:value={newBonusPct}
      class="w-32 border border-gray-300 rounded px-3 py-1.5 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-chrome-ink"
    />
    <button type="button" class="px-4 py-1.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm" onclick={addBonusPct}>追加</button>
  </div>
</section>

<section class="surface-card p-4 mb-6">
  <h2 class="text-lg font-bold mb-3">使ってよい条件</h2>
  <div class="space-y-3">
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">プレイ方法</legend>
      <div class="flex flex-wrap gap-3">
        {#each PLAY_MODES as mode (mode)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" data-testid="play-mode-{mode}" checked={playModes.includes(mode)} onchange={() => (playModes = toggle(playModes, mode))} />
            {mode}{#if mode === 'PC'}<span class="text-xs text-gray-500">（難度が高いため既定オフ）</span>{/if}
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">編成</legend>
      <div class="flex flex-wrap gap-3">
        {#each UNIT_PRESETS as unit (unit)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" data-testid="unit-{unit}" checked={units.includes(unit)} onchange={() => (units = toggle(units, unit))} />
            {UNIT_LABEL[unit]}
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset>
      <legend class="text-sm text-gray-600 mb-1">倍率ライブ</legend>
      <div class="flex flex-wrap gap-3">
        {#each MULTIPLIERS as mul (mul)}
          <label class="inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" data-testid="multiplier-{mul}" checked={multipliers.includes(mul)} onchange={() => (multipliers = toggle(multipliers, mul))} />
            {mul}倍
          </label>
        {/each}
      </div>
    </fieldset>
  </div>
</section>

<button
  type="button" data-testid="calculate"
  class="px-6 py-3 rounded-lg bg-chrome-ink text-white hover:bg-chrome-ink-soft shadow-lg pressable disabled:opacity-50"
  disabled={calculating}
  onclick={calculate}
>{calculating ? '計算中…' : '組合せを計算する'}</button>

{#if message}
  <p class="mt-4 text-sm text-gray-700" data-testid="message">{message}</p>
{/if}

{#if solutions.length > 0}
  <div class="mt-6 space-y-4" data-testid="solutions">
    {#each solutions as solution, i (i)}
      <section class="surface-card p-4">
        <div class="flex items-baseline gap-3 mb-3">
          <h3 class="text-base font-bold">候補{i + 1}</h3>
          <span class="text-sm text-gray-600 tabular-nums">合計 {fmt(solution.totalCount)} 回</span>
          {#if solution.remainder === 0}
            <span class="rounded-full border border-gray-400 px-2 py-0.5 text-xs font-bold">ぴったり</span>
          {:else}
            <span class="text-xs text-gray-600 tabular-nums">残り {fmt(solution.remainder)} pt</span>
          {/if}
        </div>
        <ul class="space-y-1">
          {#each solution.lines as line, li (line.point)}
            <li class="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span class="flex-1 min-w-48">{specLabel(solution, li)}</span>
              <span class="tabular-nums text-gray-600">{fmt(line.point)} pt × {fmt(line.count)} 回</span>
              <span class="tabular-nums font-medium w-28 text-right">{fmt(line.point * line.count)}</span>
            </li>
          {/each}
        </ul>
        <p class="mt-2 border-t border-gray-200 pt-2 text-sm text-right tabular-nums">
          合計 <b>{fmt(solution.totalPoint)}</b> pt
        </p>
      </section>
    {/each}
  </div>
{/if}
```

- [ ] **Step 9: dev サーバーで表示を確認**

```bash
npm run dev
```

ready のログが出たら `http://localhost:4321/point-calc/` を開き、以下を確認する。

1. 目標pt に `7777777`、現在のpt に `0` を入れると差異が `7,777,777` になる
2. 「組合せを計算する」を押すと候補が複数出て、少なくとも 1 つに「ぴったり」バッジが付く
3. PC のチェックボックスが**外れている**
4. 特効%チップが表示され、`×` で削除・「追加」で追加できる
5. リロードしても入力が復元される

スクリーンショットを `tmp/` に保存してユーザーに提示し、確認を取る。

- [ ] **Step 10: lint / typecheck / 単体テスト全体**

Run: `npm run lint && npm run typecheck && npm run test:unit`
Expected: すべて exit 0。`tests/unit/noIndigo.test.ts` が通ること（新規ファイルに indigo を入れていないことの確認）

- [ ] **Step 11: コミット**

```bash
git add src/lib/storage.ts src/lib/seo.ts src/components/HeaderNav.svelte src/components/PointCalc.svelte src/pages/point-calc/index.astro tests/unit/pointCalc/storageKey.test.ts
git commit -m "feat(point-calc): ポイント芸計算ページとナビを追加"
```

---

### Task 7: E2E テストとリリース準備

**Files:**
- Create: `tests/point-calc.test.ts`

**Interfaces:**
- Consumes: Task 6 の UI（`data-testid` 属性）
- Produces: なし

- [ ] **Step 1: E2E テストを書く**

`tests/point-calc.test.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('ポイント芸計算', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/point-calc/');
  });

  test('目標ptと現在ptから差異が計算される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('7777777');
    await page.getByTestId('current-pt').fill('7770000');
    await expect(page.getByTestId('diff')).toHaveText('7,777');
  });

  test('PC は既定でオフ、その他のプレイ方法はオン', async ({ page }) => {
    await expect(page.getByTestId('play-mode-PC')).not.toBeChecked();
    await expect(page.getByTestId('play-mode-放置')).toBeChecked();
    await expect(page.getByTestId('play-mode-オート')).toBeChecked();
    await expect(page.getByTestId('play-mode-FC')).toBeChecked();
  });

  test('組合せを計算すると候補が表示される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('7777777');
    await page.getByTestId('current-pt').fill('0');
    await page.getByTestId('calculate').click();
    const solutions = page.getByTestId('solutions');
    await expect(solutions).toBeVisible();
    await expect(solutions.locator('section')).not.toHaveCount(0);
    await expect(solutions.getByText('ぴったり').first()).toBeVisible();
  });

  test('特効%チップを追加・削除できる', async ({ page }) => {
    const chips = page.getByTestId('bonus-chips');
    await page.getByTestId('new-bonus-pct').fill('7');
    await page.getByRole('button', { name: '追加' }).click();
    await expect(chips.getByText('7%', { exact: true })).toBeVisible();
    await chips.getByRole('button', { name: '7% を削除' }).click();
    await expect(chips.getByText('7%', { exact: true })).toHaveCount(0);
  });

  test('入力がリロード後も復元される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('1234567');
    await page.getByTestId('play-mode-オート').uncheck();
    await page.reload();
    await expect(page.getByTestId('target-pt')).toHaveValue('1234567');
    await expect(page.getByTestId('play-mode-オート')).not.toBeChecked();
  });

  test('差異が 0 以下ならメッセージを出す', async ({ page }) => {
    await page.getByTestId('target-pt').fill('100');
    await page.getByTestId('current-pt').fill('200');
    await page.getByTestId('calculate').click();
    await expect(page.getByTestId('message')).toContainText('目標ptが現在ptより大きくなるように');
  });
});
```

- [ ] **Step 2: dev サーバーを使って E2E を実行**

本番ビルド経由（`npm run test`）は 10 分近くかかるので、まず dev サーバーを再利用して回す。

```bash
npm run dev            # バックグラウンド起動。"ready in" が出るまで待つ
npx playwright test tests/point-calc.test.ts
```

Expected: 6 テストすべて PASS

- [ ] **Step 3: リリースノートの扱いを確認**

`/releases/` ページ（`src/pages/releases/index.astro`）は **git タグ間のコミット件名から自動生成**される。手で編集するリリースノートのファイルは存在しない。

したがって「リリースノートを更新する」＝ **コミット件名がそのままリリース履歴に並ぶことを踏まえて書く**、という意味になる。ここまでのコミット件名を `git log --oneline main..HEAD` で見直し、日本語で内容が伝わらないものがあれば `git rebase` ではなく以降のコミットで補う（履歴の書き換えはしない）。

Run: `git log --oneline main..HEAD`
Expected: 各件名がリリース履歴の 1 行として読んで意味が分かること

- [ ] **Step 4: 本番ビルドで最終確認**

新規ページは静的ルート 1 本だけだが、`@playform/compress` 通過後の動作とナビの `BASE_URL` 解決を確認する。

Run: `npm run preview`（timeout は 420000 ms 以上を確保する。実測 5.5 分）
Expected: ビルドが成功し、`http://localhost:4321/point-calc/` が本番ビルドでも動く

- [ ] **Step 5: 全テストを流す**

Run: `npm run lint && npm run typecheck && npm run coverage && npx playwright test`
Expected: すべて exit 0

- [ ] **Step 6: コミットして PR を作る**

```bash
git add tests/point-calc.test.ts
git commit -m "test(point-calc): ポイント芸計算ページのE2Eテストを追加"
git push -u origin feat/point-calc
gh pr create --title "feat: ポイント芸計算ツールを追加" --body "$(cat <<'EOF'
## 概要

イベントポイントを狙った数字にぴったり合わせる「ポイント芸」の計算ツールを `/point-calc/` に追加します。

参照した @SachiTgr 氏の公開スプレッドシートの「1ライブあたり獲得pt表」は算術式で完全に再現できることを検証したため、表データは持たず式で算出しています。差異ぴったりになるライブの組合せは「メイン周回 + 端数DP」で自動探索し、ライブ回数の少ない順に提示します。

## 検証

- 参照スプレッドシート公開 8 シート・4,423 セルのゴールデンテスト（`tests/fixtures/point-calc-golden.json`）
- シート側の入力ミス 26 セルは理由付きで除外し、除外が意図的であることもテストで固定
- 単体テスト / E2E / カバレッジ 95% ゲート

## 関連

- ADR 0049 / `docs/superpowers/specs/2026-08-06-point-calc-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**仕様カバレッジ**

| 仕様書のセクション | 対応タスク |
|---|---|
| §2.1 計算式・定数 | Task 1 |
| §2.2 検証結果 / §2.3 浮動小数点 | Task 1（テスト）/ Task 2（ゴールデン） |
| §2.4 特効%とイベントデータ | Task 5 |
| §3 スコープ（PC 既定 OFF 含む） | Task 1 定数 / Task 6 UI |
| §4.1 engine.ts | Task 1 |
| §4.2 candidates.ts（弱編成は放置のみ） | Task 3 |
| §4.3 solver.ts（メイン周回 + 端数 DP・近似解） | Task 4 |
| §5.1 入力 | Task 6 |
| §5.2 出力（ぴったりバッジ・残差表示） | Task 6 |
| §5.3 永続化 | Task 6 |
| §5.4 デザイン | Task 6（Global Constraints にも記載） |
| §6.1 ゴールデンテスト | Task 2 |
| §6.2 ソルバーのテスト | Task 4 |
| §6.3 E2E | Task 7 |

**仕様から意図的に外した点**

- 仕様書 §5.1 の「メイン周回を明示指定できる」入力欄は UI に出していない。`solve()` は `mainPoint` を受け付ける実装になっており、必要になれば UI を足すだけで済む。初回リリースでは入力項目を増やさないことを優先した。この判断は実装後にユーザーへ伝えること。
- 仕様書 §4.3 の Web Worker 化は行わない。実測 324ms（最悪ケース: 特効%49 種・候補 3,916・R_max 41,677）で、仕様書の「実測してから判断する」に従い不要と判断した。Task 4 のテストに 3 秒の上限を入れて退行を検知する。
