# スプレッドシート v1.0.6 オラクル化＋差分検証 実装計画（サブB）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** engine 非依存の独立オラクルで ota-life.com スプレッドシート v1.0.6 の計算を再現し、ライブ採取ゴールデン値で忠実性を担保した上で engine との差分を項目別にレポート・明文化する。

**Architecture:** `tests/oracle/` に責務別ファイルでスプレッドシート計算を忠実ポート（engine の `computeTeam` 等を呼ばない）。ゴールデンケース JSON の実採取値と完全一致で①ポート忠実性を検証し、engine 出力との②項目別差分を `match / known-diff / unexpected` に分類するテストを置く。

**Tech Stack:** TypeScript / Vitest（`npm run test:unit`）。既存 `tests/fixtures`（`findCardById`/`findSongById`/`findBroachsByCardId`/`allBroachs`）と engine（`computeTeam`/`flattenNotes`/`calcExpectedScore`/`calcMaxScore`）を engine 側入力生成にのみ利用。

**一次資料（実装者は必ず参照）:**
- 数式詳細: `docs/spreadsheet-score-calc-diff.md`（§1 属性値・アシスト・センター/フレンド、§3 スコアアップ、§4 ブローチ、§5 縮小の完全形）
- スプレッドシート構造: `docs/spreadsheet-spec-v1.0.5.md`
- v1.0.6 生数式: `tmp/xlsx_extract/xl/worksheets/sheet5.xml` の `<f>` 要素（v1.0.5→v1.0.6 差分確認用）
- 縮小の engine 仕様: `docs/shrink-skill-spec.md`
- 調査メモ: `docs/spreadsheet-v1.0.6-investigation.md`（採取ワークフロー §5-3、ゴールデン#1）

**作業ブランチ:** `feat/spreadsheet-oracle`（作成済み、spec/調査メモコミット済み）。リリースは latest tag `v1.12.19` の次（`v1.12.20`）。

---

## File Structure

| ファイル | 責務 |
| --- | --- |
| `tests/oracle/oracleTypes.ts` | 入力 `OracleInput` / 出力 `OracleResult` 型 |
| `tests/oracle/attributeScore.ts` | 属性値スコア（特訓MAX属性値・センター/フレンド10%・ブローチ・per-note 2段floor・Shout白TRUEバグ） |
| `tests/oracle/scoreUpSkill.ts` | スコアアップスキル（確率/フル発動、活動回数=小数保持） |
| `tests/oracle/shrinkSkill.ts` | 縮小スキル（基準スコアBN22/BN23・カバー率分母=曲尺・rate加重・先頭除外なし） |
| `tests/oracle/spreadsheetOracle.ts` | エントリ `runOracle(input, mode)` → `OracleResult` |
| `tests/oracle/knownDiffs.ts` | 既知差分許可リスト（項目→理由/spec参照） |
| `tests/fixtures/golden/spreadsheet-v1.0.6.json` | ゴールデンケース配列 |
| `tests/fixtures/golden/loadGolden.ts` | ゴールデン JSON ローダ（型付け） |
| `tests/unit/score/spreadsheetDiff.test.ts` | ①ポート忠実性 + ②engine差分レポートテスト |

各オラクルファイルは1計算領域のみを担当し、engine を import しない（独立性の不変条件）。

---

### Task 1: ゴールデン#1 の完全採取とフィクスチャ化

**Files:**
- Create: `tests/fixtures/golden/spreadsheet-v1.0.6.json`
- Create: `tests/fixtures/golden/loadGolden.ts`

スプレッドシート（コピー `1PeVXmpFFhPBImJ16ZB4aDHSO1e4bmutSerpCcL09XwI`、スコア計算 gid 1555231665）の現在状態（最大値モード）から、全入力次元と5出力を採取する。

- [ ] **Step 1: スコア計算シートの入力セルを GViz CSV で読む**

Run:
```bash
curl -sL "https://docs.google.com/spreadsheets/d/1PeVXmpFFhPBImJ16ZB4aDHSO1e4bmutSerpCcL09XwI/gviz/tq?tqx=out:csv&gid=1555231665" -o tmp/golden1.csv
```
以下を特定して記録する（行番号は調査メモ §5-3 / score_deck.csv 構造を参照）:
- デッキ `ID`（row 8 相当）: `1950, 1952, 1493, 1196, 1198, 1362`（確認済み）
- 各カードの cardID（row 9 相当）: `2266, 2268, 1798, 1528, 1530, 1671`（確認済み・参考）
- センター枠 / フレンド枠（スプレッドシートはスロット3=列J=センター, スロット6=列M=フレンド。diff doc §1-4）
- 特訓有無（各カード）・スキルLV（各カード）
- ブローチ / 共有ブローチ / ラビットノートの設定
- アシスト ON/OFF（`I6`）・バッジ倍率（`設定!B3`、既定 16%）
- 楽曲名（461ノーツ/92秒。`findSongById` で照合し song id を確定）
- トグル: スコアアップフル発動=TRUE / 縮小フル発動=TRUE（＝max モード。確認済み）

- [ ] **Step 2: 楽曲 id を fixtures で照合**

Run:
```bash
node -e 'const f=require("./tests/fixtures/songs.json"); const s=f.find(x=>x.notes_count===461); console.log(s?{id:s.id,name:s.song_name,notes:s.notes_count,dur:s.duration}:"none")'
```
Expected: 461 ノーツの楽曲が1件特定できる。複数あれば曲名（スプレッドシート曲名セル）で一意化。

- [ ] **Step 3: ゴールデン JSON を作成**

`tests/fixtures/golden/spreadsheet-v1.0.6.json` を作成。`max` は採取済みの値、`expected` は未採取のため `null`（後続増分で埋める）:
```json
[
  {
    "label": "UR6枚-最大値モード#1",
    "version": "1.0.6",
    "deck": [1950, 1952, 1493, 1196, 1198, 1362],
    "center": 0,
    "friend": 5,
    "trained": [true, true, true, true, true, true],
    "skillLevels": [5, 5, 5, 5, 5, 5],
    "broachs": [],
    "sharedBroachs": [[], [], [], [], [], []],
    "rabbitNotes": {},
    "songId": 0,
    "notes": 461,
    "duration": 92,
    "badgeRate": 16,
    "assist": true,
    "expected": null,
    "max": { "attr": 2388497, "scoreUp": 698524, "shrink": 1194247, "liveEnd": 4281268, "final": 4966270 }
  }
]
```
> 注: `center`/`friend`/`trained`/`skillLevels`/`broachs`/`sharedBroachs`/`rabbitNotes`/`songId`/`assist` は Step 1-2 で採取した**実値に置き換える**こと。上記は雛形。デッキ並び順はスプレッドシートのスロット順（1〜6枚目）に合わせる。

- [ ] **Step 4: ローダを作成**

`tests/fixtures/golden/loadGolden.ts`:
```ts
import golden from './spreadsheet-v1.0.6.json';

export interface GoldenComponents {
  attr: number; scoreUp: number; shrink: number; liveEnd: number; final: number;
}
export interface GoldenCase {
  label: string;
  version: string;
  deck: number[];
  center: number;
  friend: number;
  trained: boolean[];
  skillLevels: (1 | 2 | 3 | 4 | 5)[];
  broachs: number[];
  sharedBroachs: number[][];
  rabbitNotes: Record<string, unknown>;
  songId: number;
  notes: number;
  duration: number;
  badgeRate: number;
  assist: boolean;
  expected: GoldenComponents | null;
  max: GoldenComponents | null;
}
export const goldenCases: GoldenCase[] = golden as GoldenCase[];
```

- [ ] **Step 5: コミット**
```bash
git add tests/fixtures/golden/
git commit -m "test(oracle): ゴールデンケース#1(最大値モード)を採取しフィクスチャ化

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: オラクル型とエントリのスケルトン

**Files:**
- Create: `tests/oracle/oracleTypes.ts`
- Create: `tests/oracle/spreadsheetOracle.ts`

- [ ] **Step 1: 型を定義**

`tests/oracle/oracleTypes.ts`:
```ts
import type { Card } from '../../src/lib/data/fetchCardsJson';

export type OracleMode = 'expected' | 'max';

export interface OracleInput {
  deck: (Card | null)[];          // スロット順（index0=1枚目 … index5=6枚目）
  center: number;                 // センター枠 index
  friend: number;                 // フレンド枠 index
  song: { notes: number; duration: number; noteStages: NoteStage[] };
  trained: boolean[];
  skillLevels: (1 | 2 | 3 | 4 | 5)[];
  broachAttr: { shout: number; beat: number; melody: number }; // ブローチ属性加算合計
  rabbitAttr: { shout: number; beat: number; melody: number };  // ラビットノート属性加算合計
  badgeRate: number;              // % 例: 16
  assist: boolean;
}

/** 楽曲のステージ別ノート分布（属性×白/色）。attributeScore で per-note 計算に使う */
export interface NoteStage {
  attribute: 'Shout' | 'Beat' | 'Melody';
  light: number;     // ライト倍率（1.0/1.1/1.2/1.3/1.5/2.6/3.0）
  count: number;     // そのステージの該当ノート数
}

export interface OracleResult {
  attr: number;
  scoreUp: number;
  shrink: number;
  liveEnd: number;
  final: number;
}
```
> `broachAttr`/`rabbitAttr` は属性値加算の合計を入力として受ける（ブローチ解決ロジックは engine 側に存在するが、オラクル独立性のためゴールデン採取値または別途与える。Task 1 で broach 無し構成なら 0）。

- [ ] **Step 2: エントリのスケルトンを作成**

`tests/oracle/spreadsheetOracle.ts`:
```ts
import type { OracleInput, OracleMode, OracleResult } from './oracleTypes';
import { computeAttributeScore } from './attributeScore';
import { computeScoreUp } from './scoreUpSkill';
import { computeShrink } from './shrinkSkill';

export function runOracle(input: OracleInput, mode: OracleMode): OracleResult {
  const attr = computeAttributeScore(input);
  const scoreUp = computeScoreUp(input, mode);
  const shrink = computeShrink(input, mode, attr);
  const liveEnd = attr + scoreUp + shrink;
  const final = input.badgeRate > 0
    ? Math.floor(liveEnd * (1 + input.badgeRate / 100))
    : liveEnd;
  return { attr, scoreUp, shrink, liveEnd, final };
}
```
> この時点では `computeAttributeScore` 等は未実装。Task 3-5 で TDD 実装する。Task 2 は型とエントリの骨組みのみ。

- [ ] **Step 3: コミット**
```bash
git add tests/oracle/oracleTypes.ts tests/oracle/spreadsheetOracle.ts
git commit -m "test(oracle): オラクルの型とエントリ骨組みを追加

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 属性値スコア コンポーネント（最初のマイルストーン）

**Files:**
- Create: `tests/oracle/attributeScore.ts`
- Test: `tests/unit/score/spreadsheetDiff.test.ts`（このタスクで新規作成し attr のみ検証）

数式: `docs/spreadsheet-score-calc-diff.md` §1-2/§1-3/§1-4 を参照。
- 特訓MAX属性値（カード `*_max`）をスロット合算 → `AN69` 系
- センター/フレンド: `floor(base × (1 + 0.1×[センター属性一致] + 0.1×[フレンド属性一致]))`（10% ハードコード、合算後に一括 floor。diff doc §1-4）
- アシスト: `assist` のとき `floor(appeal × 1.2)`（diff doc §1-3）
- per-note: ステージごとに `floor(appeal × NOTE_RATE) × light` を再 floor の2段（diff doc §1-2）。`NOTE_RATE` 白=0.025 / 色=0.030
- ブローチ/ラビット属性加算を appeal に加える

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/spreadsheetDiff.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { goldenCases } from '../../fixtures/golden/loadGolden';
import { buildOracleInput } from './helpers/buildOracleInput';
import { runOracle } from '../../oracle/spreadsheetOracle';

describe('スプレッドシート v1.0.6 オラクル — ①ポート忠実性', () => {
  for (const gc of goldenCases) {
    const input = buildOracleInput(gc);
    if (gc.max) {
      it(`${gc.label}: 属性値スコア(max)`, () => {
        expect(runOracle(input, 'max').attr).toBe(gc.max!.attr);
      });
    }
  }
});
```
> `buildOracleInput(gc)` は GoldenCase → OracleInput を組むヘルパ。`tests/unit/score/helpers/buildOracleInput.ts` に作る（deck を `findCardById` で解決、song を `findSongById` で解決し NoteStage 配列に変換）。このヘルパも本タスクで作成する。

- [ ] **Step 2: ヘルパ `buildOracleInput` を作成**

`tests/unit/score/helpers/buildOracleInput.ts`:
```ts
import type { GoldenCase } from '../../../fixtures/golden/loadGolden';
import { findCardById, findSongById } from '../../../fixtures';
import type { OracleInput, NoteStage } from '../../../oracle/oracleTypes';

export function buildOracleInput(gc: GoldenCase): OracleInput {
  const deck = gc.deck.map((id) => findCardById(id));
  const song = findSongById(gc.songId);
  const noteStages = toNoteStages(song); // 楽曲のステージ別ノート分布へ変換
  return {
    deck,
    center: gc.center,
    friend: gc.friend,
    song: { notes: gc.notes, duration: gc.duration, noteStages },
    trained: gc.trained,
    skillLevels: gc.skillLevels,
    broachAttr: { shout: 0, beat: 0, melody: 0 },
    rabbitAttr: { shout: 0, beat: 0, melody: 0 },
    badgeRate: gc.badgeRate,
    assist: gc.assist,
  };
}

function toNoteStages(song: any): NoteStage[] {
  // 楽曲データのステージ別ノート分布を NoteStage[] に変換する。
  // 変換ロジックは engine の flattenNotes を参照せず、song の生データから構築する。
  // 実装は Task 3 Step 3 で attributeScore と整合させながら確定する。
  return song.__noteStages ?? buildStagesFromSong(song);
}
```
> `toNoteStages` / `buildStagesFromSong` の正確な変換は、属性値スコアがゴールデン値に一致するよう Step 3 で確定する。楽曲データのステージ構造は `docs/spreadsheet-spec-v1.0.5.md` の楽曲データシート定義と `src/lib/data/fetchSongsJson.ts` の属性グループ×サブカラム定義を参照。

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: FAIL（`computeAttributeScore` 未実装 or 値不一致）。

- [ ] **Step 4: `attributeScore.ts` を実装**

`tests/oracle/attributeScore.ts` に diff doc §1-2/§1-3/§1-4 の数式を移植。
```ts
import type { OracleInput } from './oracleTypes';

const NOTE_RATE_WHITE = 0.025;
const NOTE_RATE_COLOR = 0.030;

export function computeAttributeScore(input: OracleInput): number {
  // 1) スロット合算で raw appeal（特訓MAX属性値）+ ブローチ/ラビット加算
  // 2) センター/フレンド 10% を合算後 floor（diff doc §1-4）
  // 3) アシスト時 floor(appeal × 1.2)（§1-3）
  // 4) ステージ別 per-note 2段 floor の総和（§1-2）。Shout白の TRUE 固定バグも再現
  // ...（数式は diff doc を参照し正確に移植）
  // 戻り値: 属性値スコア（= BN21）
}
```
> 実装の正確な式は `docs/spreadsheet-score-calc-diff.md` §1-2〜§1-4 と `tmp/xlsx_extract/.../sheet5.xml` の `AN69`/`AN71`/`AN72`/`BA11:BF18`/`BN21` 数式に厳密に従う。**ゴールデン#1 の attr=2,388,497 に完全一致するまで調整**する（Shout白ノートの素点固定バグ等、スプレッドシートの挙動をそのまま再現する）。

- [ ] **Step 5: テストを実行してパスを確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: PASS（`属性値スコア(max)` が 2,388,497 に一致）。

- [ ] **Step 6: コミット**
```bash
git add tests/oracle/attributeScore.ts tests/unit/score/spreadsheetDiff.test.ts tests/unit/score/helpers/buildOracleInput.ts
git commit -m "test(oracle): 属性値スコアを移植しゴールデン#1で忠実性検証

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: スコアアップスキル コンポーネント（最大値モード）

**Files:**
- Create: `tests/oracle/scoreUpSkill.ts`
- Test: `tests/unit/score/spreadsheetDiff.test.ts`（scoreUp の検証を追加）

数式: `docs/spreadsheet-score-calc-diff.md` §3。カード別 `H38`:
- 種別=スコアアップ かつ 条件(Perfect/コンボ): `$D8/count`（小数保持）× 発動率 × value、タイマー: `$D9/count` × …
- max モード（フル発動 `$B12=TRUE`）: 発動率を 100% 扱い（×1）
- 最後に `ROUNDDOWN`、カード別 `H38:M38` を合算（= D21）

- [ ] **Step 1: 失敗するテストを追加**

`tests/unit/score/spreadsheetDiff.test.ts` の①ブロックに追加:
```ts
if (gc.max) {
  it(`${gc.label}: スコアアップ(max)`, () => {
    expect(runOracle(input, 'max').scoreUp).toBe(gc.max!.scoreUp);
  });
}
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: FAIL（`computeScoreUp` 未実装）。

- [ ] **Step 3: `scoreUpSkill.ts` を実装**

```ts
import type { OracleInput, OracleMode } from './oracleTypes';
import { getApSkillLevel } from '../../src/lib/data/fetchCardsJson';

export function computeScoreUp(input: OracleInput, mode: OracleMode): number {
  // カードごと（スロット）に H38 を計算し合算
  // 種別判定は card.ap_skill_type、条件は ap_skill_req
  // 活動回数 denom/count は小数のまま保持（diff doc §3「小数許容」）
  // mode==='max'(フル発動): per を 100% 扱い（×1）
  // 各カード ROUNDDOWN、合算して返す
  // ...（式は diff doc §3 / sheet5.xml H38 に厳密に従う）
}
```
> ゴールデン#1 の scoreUp=698,524 に完全一致するまで調整。スキルLV→パラメータは `getApSkillLevel(card, level)` を使用。

- [ ] **Step 4: テスト実行でパス確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: PASS（`スコアアップ(max)` = 698,524）。

- [ ] **Step 5: コミット**
```bash
git add tests/oracle/scoreUpSkill.ts tests/unit/score/spreadsheetDiff.test.ts
git commit -m "test(oracle): スコアアップスキル(最大値)を移植しゴールデン#1で検証

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 縮小スキル コンポーネント（最大値モード）

**Files:**
- Create: `tests/oracle/shrinkSkill.ts`
- Test: `tests/unit/score/spreadsheetDiff.test.ts`（shrink の検証を追加）

数式: `docs/spreadsheet-score-calc-diff.md` §5-1（H39/M6/BN22/BN23/H40 の完全形）。要点:
- `H39` カード期待縮小秒数: フル発動時 `floor(denom/count × value)`（denom=ノーツ or 秒）
- `M6` カバー率 = `Σ H39 / 曲秒数`（分母は曲尺そのまま、100% 超過しうる）
- `BN22` 基準スコア = アシスト時 `floor(属性値スコア / 1.2)`、非アシスト時 属性値スコア（§5-1）
- `H40` 寄与: カバー率≥100% は `floor(BN22 × (H39/ΣH39) × (rate−1))`、<100% は `floor(BN22 × H39/曲秒数 × (rate−1))`
- カード別 `H40:M40` 合算（= D22）。**先頭除外なし**

- [ ] **Step 1: 失敗するテストを追加**
```ts
if (gc.max) {
  it(`${gc.label}: 縮小スキル(max)`, () => {
    expect(runOracle(input, 'max').shrink).toBe(gc.max!.shrink);
  });
}
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: FAIL（`computeShrink` 未実装）。

- [ ] **Step 3: `shrinkSkill.ts` を実装**

```ts
import type { OracleInput, OracleMode } from './oracleTypes';

export function computeShrink(input: OracleInput, mode: OracleMode, attrScore: number): number {
  // 1) カードごと H39（縮小秒数）を計算（mode==='max' はフル発動式）
  // 2) M6 カバー率 = Σ H39 / song.duration
  // 3) BN22 = assist ? floor(attrScore / 1.2) : attrScore
  // 4) カードごと H40（寄与）を coverage 分岐で計算し合算
  // ...（式は diff doc §5-1 / sheet5.xml H39/M6/BN22/H40 に厳密に従う）
}
```
> ゴールデン#1 の shrink=1,194,247 に完全一致するまで調整。20ノーツ加算なし(β)は FALSE 前提（BN22 を使用、BN23 は使わない）。

- [ ] **Step 4: テスト実行でパス確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: PASS（`縮小スキル(max)` = 1,194,247）。

- [ ] **Step 5: コミット**
```bash
git add tests/oracle/shrinkSkill.ts tests/unit/score/spreadsheetDiff.test.ts
git commit -m "test(oracle): 縮小スキル(最大値)を移植しゴールデン#1で検証

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 組み立て検証（ライブ終了時・最終リザルト）

**Files:**
- Test: `tests/unit/score/spreadsheetDiff.test.ts`（liveEnd/final の検証を追加）

`runOracle` の組み立て（Task 2 で実装済み: liveEnd=attr+scoreUp+shrink, final=floor(liveEnd×(1+badge%))）をゴールデンで確認。

- [ ] **Step 1: 失敗/パステストを追加**
```ts
if (gc.max) {
  it(`${gc.label}: ライブ終了時(max)`, () => {
    expect(runOracle(input, 'max').liveEnd).toBe(gc.max!.liveEnd);
  });
  it(`${gc.label}: 最終リザルト(max)`, () => {
    expect(runOracle(input, 'max').final).toBe(gc.max!.final);
  });
}
```

- [ ] **Step 2: テスト実行で確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: PASS（liveEnd=4,281,268 / final=4,966,270）。
> もし不一致なら attr/scoreUp/shrink いずれかの誤差。Task 3-5 に戻って調整（バッジ floor 位置は diff doc §1-1 `D24` 参照）。

- [ ] **Step 3: コミット**
```bash
git add tests/unit/score/spreadsheetDiff.test.ts
git commit -m "test(oracle): ライブ終了時・最終リザルトの組み立てをゴールデン#1で検証

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: engine 差分レポート＋分類＋既知差分リスト

**Files:**
- Create: `tests/oracle/knownDiffs.ts`
- Test: `tests/unit/score/spreadsheetDiff.test.ts`（②ブロックを追加）

engine 出力は既存 API で生成（`computeTeam`→`flattenNotes`→`calcMaxScore`/`calcExpectedScore`）。オラクル（=スプレッドシート）と項目別に比較し分類する。

- [ ] **Step 1: 既知差分リストを作成**

`tests/oracle/knownDiffs.ts`:
```ts
/** 既知の意図的差分。ここに該当する (component) は unexpected ではなく known-diff に分類する。 */
export interface KnownDiff {
  component: 'attr' | 'scoreUp' | 'shrink' | 'liveEnd' | 'final';
  reason: string;     // 根拠（spec 参照）
}

export const KNOWN_DIFFS: KnownDiff[] = [
  { component: 'shrink', reason: '縮小: 基準スコアのアシスト剥離/先頭除外なし/カバー率分母=全曲尺/rate加重平均。docs/shrink-skill-spec.md と diff doc §5' },
  { component: 'scoreUp', reason: 'スコアアップ: 活動回数を engine は floor、スプレッドシートは小数保持。diff doc §3' },
];

export function classify(
  component: KnownDiff['component'],
  oracle: number,
  engine: number,
): 'match' | 'known-diff' | 'unexpected' {
  if (oracle === engine) return 'match';
  return KNOWN_DIFFS.some((k) => k.component === component) ? 'known-diff' : 'unexpected';
}
```

- [ ] **Step 2: 失敗するテスト（②差分レポート）を追加**

`tests/unit/score/spreadsheetDiff.test.ts` に②ブロックを追加:
```ts
import { computeTeam, flattenNotes, calcMaxScore } from '../../../src/lib/score/engine';
import { allBroachs } from '../../fixtures';
import { classify } from '../../oracle/knownDiffs';

describe('スプレッドシート v1.0.6 オラクル — ②engine差分レポート', () => {
  for (const gc of goldenCases) {
    if (!gc.max) continue;
    const input = buildOracleInput(gc);
    const oracle = runOracle(input, 'max');

    const deck = gc.deck.map((id) => findCardById(id));
    const song = findSongById(gc.songId);
    const team = computeTeam(deck, allBroachs, song);
    const notes = flattenNotes(song, 42);
    const engineMax = calcMaxScore(team, notes, { scoreUpAssist: gc.assist, scoreUpBadgeRate: gc.badgeRate });

    it(`${gc.label}: 最終リザルト分類に unexpected が無い`, () => {
      const cls = classify('final', oracle.final, engineMax);
      // レポート出力
      console.log(`[diff] ${gc.label} final: oracle=${oracle.final} engine=${engineMax} delta=${engineMax - oracle.final} class=${cls}`);
      expect(cls).not.toBe('unexpected');
    });
  }
});
```
> `calcMaxScore` は単一の最終値を返す。項目別（attr/scoreUp/shrink）の engine 内訳比較は `calcExpectedScore` の内訳（max 相当が無いものは liveEnd 構成で近似）か、engine 側に内訳取得が無い項目はレポート対象外とする。最小限、`final` の分類で回帰ガードを成立させる。内訳比較を増やす場合は engine の内訳 API（`calcExpectedScore` の戻り）を併用。

- [ ] **Step 3: テスト実行で確認**

Run: `npm run test:unit -- spreadsheetDiff`
Expected: PASS（final は known-diff 要因の差分を含みうるが unexpected ではない）。差分値が `console.log` に出る。

- [ ] **Step 4: コミット**
```bash
git add tests/oracle/knownDiffs.ts tests/unit/score/spreadsheetDiff.test.ts
git commit -m "test(oracle): engine差分レポートと分類(match/known-diff/unexpected)を追加

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 差分ドキュメントを v1.0.6 で更新

**Files:**
- Modify: `docs/spreadsheet-score-calc-diff.md`

- [ ] **Step 1: 冒頭の対象バージョン・採取情報を更新**

先頭の比較対象ブロックを v1.0.6 / engine 現行 HEAD / 採取日 2026-06-09 / ゴールデン#1 に更新。v1.0.5→v1.0.6 の数式差分確認結果（sheet5.xml と既存 doc の突き合わせ）を「## 変更履歴(v1.0.5→v1.0.6)」節として追記。

- [ ] **Step 2: オラクル検証で確定した差分を反映**

Task 7 の `console.log` 差分値と分類を §0 サマリーに反映。各既知差分（縮小4点・スコアアップ活動回数）にゴールデン#1 の実数値（oracle 値 / engine 値 / delta）を併記。

- [ ] **Step 3: コミット**
```bash
git add docs/spreadsheet-score-calc-diff.md
git commit -m "docs(score): 差分ドキュメントを v1.0.6 + オラクル検証結果で更新

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: リリース

- [ ] **Step 1: 全テスト緑を確認**

Run: `npm run test:unit`
Expected: 全テストパス（既存 + spreadsheetDiff）。

- [ ] **Step 2: push**
```bash
git push -u origin feat/spreadsheet-oracle
```

- [ ] **Step 3: PR 作成**
```bash
gh pr create --title "test(score): スプレッドシート v1.0.6 オラクル化＋差分検証(サブB)" --body "$(cat <<'EOF'
## 概要
ota-life.com スプレッドシート v1.0.6 の計算を engine 非依存の独立オラクルで再現し、ライブ採取ゴールデン値で忠実性を担保した上で engine との差分を項目別にレポート・明文化する。

設計書: `docs/superpowers/specs/2026-06-09-spreadsheet-v1.0.6-oracle-design.md`（サブB）

## 内容
- `tests/oracle/` に独立オラクル（属性値/スコアアップ/縮小/組み立て）を構築
- ゴールデン#1(最大値モード)で①ポート忠実性を完全一致検証
- engine との②項目別差分レポート + 分類(match/known-diff/unexpected) + 回帰ガード
- `docs/spreadsheet-score-calc-diff.md` を v1.0.6 で更新

## スコープ外（増分/後続）
- 期待値モードの検証・追加デッキ(計5-10件)はゴールデン採取に依存し増分追加
- engine 自体のロジック変更はサブC

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: squash マージ + ブランチ削除**
```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: main を取得しタグ push でリリース**
```bash
git checkout main && git pull --ff-only origin main
git tag v1.12.20 && git push origin v1.12.20
```
Expected: `release.yml` + `deploy.yml` が発火（テスト/docs のみのため挙動変化なし）。CI 完了は待たない（プロジェクト規約）。

---

## Self-Review

**1. Spec coverage:**
- spec「アーキテクチャ：2つの比較」→ Task 3-6（①忠実性）+ Task 7（②差分レポート）✓
- spec「オラクル構成（tests/oracle/ 責務別）」→ Task 2-5, 7（oracleTypes/attributeScore/scoreUpSkill/shrinkSkill/spreadsheetOracle/knownDiffs）✓。`rabbitNote.ts` はゴールデン#1 がラビット無し構成のため本計画では `rabbitAttr` 入力で代替し、専用ファイルは追加デッキで必要になった時点で作成（YAGNI）。spec のファイル一覧と差異あり＝この簡略化を Task 1 で確認。
- spec「ゴールデンスキーマ/採取手順」→ Task 1 ✓
- spec「比較ハーネス（①②）」→ Task 3-7 ✓
- spec「差分 doc v1.0.6 更新」→ Task 8 ✓
- spec「完了条件 1-4」→ Task 6（①全項目）/ Task 7（②unexpectedゼロ）/ Task 8（doc）/ Task 1（ゴールデン、ただし本リリースは#1のみ・残りは増分）✓（ケース数 5-10 は増分前提と spec スコープ外節で明記済み）

**2. Placeholder scan:** オラクルの数式実装（Task 3-5 Step 3/4）は「diff doc §N と sheet5.xml に厳密に従い、ゴールデン値に完全一致するまで調整」と具体的な一次資料と数値目標を指定。817 数式の全文転記は非現実的かつ diff doc が権威ある一次資料のため、参照指定とする（ハンドウェーブではない）。`toNoteStages` の変換は Task 3 で attr 一致により確定する旨を明記。

**3. Type consistency:** `OracleInput`/`OracleResult`/`OracleMode`/`GoldenCase`/`GoldenComponents` を Task 1-2 で定義し Task 3-7 で一貫使用。`runOracle(input, mode)` / `classify(component, oracle, engine)` / `buildOracleInput(gc)` の呼び出し名はタスク間で一致。`computeAttributeScore`/`computeScoreUp(input,mode)`/`computeShrink(input,mode,attrScore)` のシグネチャは Task 2 のエントリ呼び出しと Task 3-5 の定義で一致。

**既知のリスク（実装者へ）:** オラクルがゴールデン#1 の各項目に bit-exact 一致しない場合、ポートの理解不足を示す。その場合は sheet5.xml の該当セル数式を直接確認し、スプレッドシートのバグ（Shout白 TRUE 固定等）も含めて忠実に再現する。どうしても一致しない項目があれば DONE_WITH_CONCERNS で差分を報告すること（捏造での一致は禁止）。
