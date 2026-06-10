# max-score-finder 探索ロジック抽出 + Worker 並列化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 編成組合計算（max-score-finder）の総当たり探索ロジックを `SecretsTool.svelte` から純粋モジュールに抽出して単体テストを整備し、チャンクキュー方式の Web Worker プールで並列実行する。

**Architecture:** 探索ロジック（組合せ数学・チャンク分割・デッキ列挙・評価・Top-K マージ）を `src/lib/score/maxScoreFinder.ts` に集約。`maxScoreFinder.worker.ts` は init / chunk / abort を受けて progress / result を返す薄いラッパー。`SecretsTool.svelte` は UI と Worker プール管理のみ。スコア評価関数（`engine.ts` 等）は無変更で、結果は現行実装と完全一致する（同点順位の並びのみ変動しうる）。

**Tech Stack:** Svelte 5 ($state/$derived) / TypeScript / Web Worker (module worker, Vite バンドル) / Vitest

**Spec:** `docs/superpowers/specs/2026-06-10-max-score-finder-parallel-design.md`

---

## 前提知識（このコードベース固有）

- **作業ブランチ**: `feat/max-score-finder-parallel`（作成済み・spec コミット済み）。main では作業しない。
- **テスト実行**: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`（Vitest、1 ファイル指定）。全件は `npm run test:unit`（約 1 秒〜数秒）。
- **フィクスチャ**: `tests/fixtures/index.ts` が `allCards` / `allSongs` / `allBroachs` / `findCardById(id)` / `findSongById(id)` / `findBroachsByCardId(id)` をエクスポート。実データの JSON スナップショット。
- **Svelte 5 の $state プロキシは structured clone できない**。`postMessage` に渡すデータは必ず `$state.snapshot()` でプレーン化すること（怠ると実行時に DataCloneError）。
- **用語ポリシー**: ユーザー可視テキストは「衣装」、コード内識別子は `card`。
- **エンジン API**（無変更で利用、`src/lib/score/engine.ts` から import）:
  - `computeTeam(deck, allBroachs, song, bonusTiers?, trainedFlags?, selectedBroachIds?, sharedBroachSelections?, skillLevels?, rabbitNotes?) → ComputedTeam`
  - `computeShrinkExclusion(team, groupSizes)` / `computeGroupSizes(song)`
  - `flattenNotes(song, seed?, exclusion?) → FlatNote[]`（engine.ts から再エクスポート済み）
  - `calcExpectedScore(team, notes, notesCount, options?) → ExpectedScore`（`.finalScore` 等を持つ）
  - `calcMaxScore(team, notes, options?) → number`
- **判定縮小スキル判定**: `c.ap_skill_type` が `SKILL_TYPE.SHRINK`（`'判定縮小スコアアップ'`）と一致、または `SKILL_TYPE.SHRINK_PREFIX`（`'判定縮小（'`）で始まる場合。`SKILL_TYPE` は `src/lib/data/fetchCardsJson.ts` から import。
- **現行の探索ロジック**は `src/components/SecretsTool.svelte` の 126〜263 行（組合せ数学・ジェネレーター）と 273〜519 行（`runSearch` / `requestAbort`）にある。Task 1〜4 はここからの移植であり、**ロジックの意味を変えないこと**（変数名の整理は可）。

---

### Task 1: モジュール骨格と組合せ数学の抽出

**Files:**
- Create: `src/lib/score/maxScoreFinder.ts`
- Create: `tests/unit/score/maxScoreFinder.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/maxScoreFinder.test.ts` を新規作成:

```typescript
import { describe, it, expect } from 'vitest';

import {
  binomial,
  multichoose,
  countMultisetsWithLimits,
  multisetIndices,
  multisetIndicesOrEmpty,
  isShrinkCard,
} from '../../../src/lib/score/maxScoreFinder';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import { allCards } from '../../fixtures';

describe('組合せ数学ユーティリティ', () => {
  it('binomial: C(5,2)=10, C(4,0)=1, C(3,5)=0, C(-1,0)=0', () => {
    expect(binomial(5, 2)).toBe(10);
    expect(binomial(4, 0)).toBe(1);
    expect(binomial(3, 5)).toBe(0);
    expect(binomial(-1, 0)).toBe(0);
  });

  it('multichoose: H(3,2)=6, H(7,4)=210, H(1,4)=1', () => {
    expect(multichoose(3, 2)).toBe(6);
    expect(multichoose(7, 4)).toBe(210);
    expect(multichoose(1, 4)).toBe(1);
  });

  it('countMultisetsWithLimits: 上限付き多重集合の数え上げ', () => {
    // 各 1 枚ずつ 3 種から 2 枚 → {a,b},{a,c},{b,c} の 3 通り
    expect(countMultisetsWithLimits([1, 1, 1], 2)).toBe(3);
    // a×2, b×1 から 2 枚 → {a,a},{a,b} の 2 通り
    expect(countMultisetsWithLimits([2, 1], 2)).toBe(2);
    // 上限なし相当 (上限 ≥ k) なら multichoose と一致
    expect(countMultisetsWithLimits([4, 4, 4], 4)).toBe(multichoose(3, 4));
    // 合計上限が k 未満なら 0
    expect(countMultisetsWithLimits([1, 1], 3)).toBe(0);
  });

  it('multisetIndices: 列挙数が multichoose と一致し非減少列のみ', () => {
    const seen: string[] = [];
    for (const idx of multisetIndices(4, 3)) {
      // ジェネレーターは同一配列を破壊的に再利用するため必ずコピーする
      seen.push([...idx].join(','));
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
    }
    expect(seen.length).toBe(multichoose(4, 3));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('multisetIndices: N=0 または k=0 では何も yield しない', () => {
    expect([...multisetIndices(0, 2)].length).toBe(0);
    expect([...multisetIndices(3, 0)].length).toBe(0);
  });

  it('multisetIndicesOrEmpty: k=0 のとき空配列を 1 回だけ yield する', () => {
    const out = [...multisetIndicesOrEmpty(3, 0)].map((a) => [...a]);
    expect(out).toEqual([[]]);
    expect([...multisetIndicesOrEmpty(3, 2)].length).toBe(multichoose(3, 2));
  });
});

describe('isShrinkCard', () => {
  it('フィクスチャに判定縮小持ちと非縮小の UR が両方存在する', () => {
    const ur = allCards.filter((c) => c.rarity === 'UR' && c.ap_skill_type);
    expect(ur.some((c) => isShrinkCard(c))).toBe(true);
    expect(ur.some((c) => !isShrinkCard(c))).toBe(true);
  });

  it('null は false', () => {
    expect(isShrinkCard(null)).toBe(false);
  });

  it('スキルタイプ文字列で判定する', () => {
    const fake = (t: string | null) => ({ ap_skill_type: t }) as unknown as Card;
    expect(isShrinkCard(fake('判定縮小スコアアップ'))).toBe(true);
    expect(isShrinkCard(fake('判定縮小（タイマー）'))).toBe(true);
    expect(isShrinkCard(fake('スコアアップ'))).toBe(false);
    expect(isShrinkCard(fake(null))).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: FAIL（`maxScoreFinder.ts` が存在しないため import エラー）

- [ ] **Step 3: 実装を書く**

`src/lib/score/maxScoreFinder.ts` を新規作成。組合せ数学は `SecretsTool.svelte` 126〜152 行・246〜263 行からの移植、`isShrinkCard` は同 76〜80 行からの移植:

```typescript
/**
 * max-score-finder (編成組合計算) の総当たり探索ロジック。
 *
 * UI (SecretsTool.svelte) と Web Worker (maxScoreFinder.worker.ts) の両方から
 * import される純粋モジュール。Svelte やブラウザ API に依存しない。
 */
import type { Card } from '../data/fetchCardsJson';
import { SKILL_TYPE } from '../data/fetchCardsJson';

/** デッキ6枠中の判定縮小スキル持ち枚数を固定する条件 (shrinkPairOnly 有効時) */
export const SHRINK_PAIR_TARGET = 2;

/** parseSkill (engine.ts) と同じ判定で「判定縮小スキル持ち」かどうかを返す */
export function isShrinkCard(c: Card | null): boolean {
  const t = c?.ap_skill_type;
  return !!t && (t === SKILL_TYPE.SHRINK || t.startsWith(SKILL_TYPE.SHRINK_PREFIX));
}

export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

export function multichoose(n: number, k: number): number {
  return binomial(n + k - 1, k);
}

// 各カード i の出現上限を limits[i] とした k-多重集合の総数
// = ∏(1 + x + ... + x^{limits[i]}) における x^k の係数
export function countMultisetsWithLimits(limits: number[], k: number): number {
  let poly: number[] = [1];
  for (const lim of limits) {
    const newLen = Math.min(poly.length + lim, k + 1);
    const next = new Array<number>(newLen).fill(0);
    for (let d = 0; d < poly.length; d++) {
      if (poly[d] === 0) continue;
      const jMax = Math.min(lim, k - d);
      for (let j = 0; j <= jMax; j++) next[d + j] += poly[d];
    }
    poly = next;
  }
  return poly[k] ?? 0;
}

/**
 * 0..N-1 から重複ありで k 個選ぶ非減少インデックス列を列挙する。
 * yield される配列は次の iteration で破壊的に書き換えられるため、
 * 保持する場合は呼び出し側でコピーすること。
 */
export function* multisetIndices(N: number, k: number): Generator<number[]> {
  if (N <= 0 || k <= 0) return;
  const idx = new Array(k).fill(0);
  while (true) {
    yield idx;
    let i = k - 1;
    while (i >= 0 && idx[i] === N - 1) i--;
    if (i < 0) break;
    const v = idx[i] + 1;
    for (let j = i; j < k; j++) idx[j] = v;
  }
}

/** multisetIndices の k=0 対応版: k=0 のとき空組合せを 1 回だけ yield する */
export function* multisetIndicesOrEmpty(N: number, k: number): Generator<number[]> {
  if (k === 0) { yield []; return; }
  yield* multisetIndices(N, k);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: PASS（全テスト green）

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/maxScoreFinder.ts tests/unit/score/maxScoreFinder.test.ts
git commit -m "refactor(max-score-finder): 組合せ数学ユーティリティを純粋モジュールに抽出

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: SearchInput / SearchContext / countCombos

**Files:**
- Modify: `src/lib/score/maxScoreFinder.ts`（末尾に追記）
- Modify: `tests/unit/score/maxScoreFinder.test.ts`（末尾に追記）

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/maxScoreFinder.test.ts` の import に追記:

```typescript
import {
  createSearchContext,
  countCombos,
  type SearchInput,
} from '../../../src/lib/score/maxScoreFinder';
import type { EventBonusTier } from '../../../src/lib/data/eventBonusTiers';
import { allBroachs, findSongById } from '../../fixtures';
```

テスト末尾に追記:

```typescript
/** テスト用候補: 縮小持ち UR 3 枚 + 非縮小 UR 4 枚 */
const urPool = allCards.filter((c) => c.rarity === 'UR' && c.ID != null && c.ap_skill_type);
const shrinkUr = urPool.filter((c) => isShrinkCard(c)).slice(0, 3);
const nonShrinkUr = urPool.filter((c) => !isShrinkCard(c)).slice(0, 4);
const testCandidates = [...shrinkUr, ...nonShrinkUr];
const testSong = findSongById(2); // MONSTER GENERATiON (EXPERT+)
const testTiers: Record<string, EventBonusTier> = Object.fromEntries(
  testCandidates.map((c) => [String(c.ID), 'gold' as EventBonusTier])
);

function buildInput(overrides: Partial<SearchInput> = {}): SearchInput {
  return {
    evalMode: 'expected',
    ownedOnly: false,
    shrinkPairOnly: false,
    scoreOptions: { scoreUpAssist: false, scoreUpBadgeRate: 0 },
    candidates: testCandidates,
    ownedCounts: {},
    song: testSong,
    broachs: allBroachs,
    tierByCardId: testTiers,
    rabbitNotes: {},
    ...overrides,
  };
}

describe('createSearchContext', () => {
  it('縮小/非縮小・所持候補を分割し、notesCount を解決する', () => {
    const ownedCounts = {
      [String(testCandidates[0].ID)]: 2,
      [String(testCandidates[3].ID)]: 1,
    };
    const ctx = createSearchContext(buildInput({ ownedCounts }));
    expect(ctx.candidates.length).toBe(7);
    expect(ctx.shrink.length).toBe(3);
    expect(ctx.nonShrink.length).toBe(4);
    expect(ctx.owned.length).toBe(2);
    expect(ctx.ownedLimit.get(testCandidates[0].ID!)).toBe(2);
    expect(ctx.notesCount).toBeGreaterThan(0);
  });
});

describe('countCombos', () => {
  it('通常モード: multichoose(N,2) × multichoose(N,4)', () => {
    const ctx = createSearchContext(buildInput());
    expect(countCombos(ctx)).toBe(multichoose(7, 2) * multichoose(7, 4)); // 28 × 210 = 5880
  });

  it('縮小2枚条件: s2 ごとのペア数 × メンバー組合せの合計', () => {
    const ctx = createSearchContext(buildInput({ shrinkPairOnly: true }));
    // S=3, T=4:
    //   s2=0: H(4,2)=10 ペア × H(3,2)=6 × H(4,2)=10 = 600
    //   s2=1: 3×4=12 ペア × H(3,1)=3 × H(4,3)=20 = 720
    //   s2=2: H(3,2)=6 ペア × H(3,0)=1 × H(4,4)=35 = 210
    expect(countCombos(ctx)).toBe(600 + 720 + 210);
  });

  it('所持衣装検索: センターごとの上限付き 4-多重集合 × フレンド候補数', () => {
    // 2 種を各 1 枚ずつ所持 → センター+メンバー4枚 (計5枠) は枚数不足で 0 通り
    const fewOwned = {
      [String(testCandidates[0].ID)]: 1,
      [String(testCandidates[1].ID)]: 1,
    };
    expect(countCombos(createSearchContext(buildInput({ ownedOnly: true, ownedCounts: fewOwned })))).toBe(0);

    // 1 種 5 枚所持 → センター 1 通り × メンバー {同一カード×4} 1 通り × フレンド 7
    const fiveOwned = { [String(testCandidates[0].ID)]: 5 };
    expect(countCombos(createSearchContext(buildInput({ ownedOnly: true, ownedCounts: fiveOwned })))).toBe(7);
  });

  it('候補 0 枚なら全モードで 0', () => {
    const empty = buildInput({ candidates: [] });
    expect(countCombos(createSearchContext(empty))).toBe(0);
    expect(countCombos(createSearchContext({ ...empty, shrinkPairOnly: true }))).toBe(0);
    expect(countCombos(createSearchContext({ ...empty, ownedOnly: true }))).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: FAIL（`createSearchContext` / `countCombos` が未エクスポート）

- [ ] **Step 3: 実装を書く**

`src/lib/score/maxScoreFinder.ts` の import 部に追記:

```typescript
import type { Song } from '../data/fetchSongsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { ScoreOptions } from './types';
import type { EventBonusTier } from '../data/eventBonusTiers';
import type { RabbitNoteMap } from '../data/rabbitNote';
import { computeGroupSizes, flattenNotes } from './engine';
```

末尾に追記。`countCombos` のロジックは `SecretsTool.svelte` の `comboCount` $derived（159〜211 行）の移植:

```typescript
/** flattenNotes のシード (現行 SecretsTool と同値。結果再現性のため固定) */
export const FLATTEN_SEED = 42;

export type EvalMode = 'expected' | 'max';

export interface SearchInput {
  evalMode: EvalMode;
  /** センター+メンバー4枚を所持枚数の範囲内に制限する */
  ownedOnly: boolean;
  /** デッキ6枠中の判定縮小持ちをちょうど SHRINK_PAIR_TARGET 枚に絞る */
  shrinkPairOnly: boolean;
  scoreOptions: ScoreOptions;
  /** 評価対象の特効 UR 候補 */
  candidates: Card[];
  /** cardId(文字列) → 所持枚数 (ownedOnly 時に使用) */
  ownedCounts: Record<string, number>;
  song: Song;
  broachs: FixedBroach[];
  /** cardId(文字列) → 特効 tier */
  tierByCardId: Record<string, EventBonusTier>;
  rabbitNotes: RabbitNoteMap;
}

/** SearchInput から導出した探索用の前計算データ (Worker 内で 1 回だけ作る) */
export interface SearchContext {
  input: SearchInput;
  candidates: Card[];
  /** 所持候補 (ownedCounts ≥ 1) */
  owned: Card[];
  shrink: Card[];
  nonShrink: Card[];
  ownedLimit: Map<number, number>;
  groupSizes: Record<string, number>;
  notesCount: number;
}

export function createSearchContext(input: SearchInput): SearchContext {
  const owned = input.candidates.filter((c) => (input.ownedCounts[String(c.ID)] ?? 0) >= 1);
  const ownedLimit = new Map<number, number>();
  for (const c of owned) ownedLimit.set(c.ID!, input.ownedCounts[String(c.ID)] ?? 0);
  return {
    input,
    candidates: input.candidates,
    owned,
    shrink: input.candidates.filter((c) => isShrinkCard(c)),
    nonShrink: input.candidates.filter((c) => !isShrinkCard(c)),
    ownedLimit,
    groupSizes: computeGroupSizes(input.song),
    notesCount: input.song.notes_count || flattenNotes(input.song, FLATTEN_SEED).length,
  };
}

/**
 * 評価対象の組合せ総数。
 * ownedOnly 時: 各 owned カードを center に置いた時の「残り所持枚数で 4-多重集合」の総和 × フレンド候補数。
 * ownedOnly=false 時: (center, friend) は UR/UR で対称、(member1..4) は多重集合
 *   → multichoose(N,2) × multichoose(N,4)。
 * shrinkPairOnly 時: 縮小持ち / それ以外に分割し、6枠合計でちょうど SHRINK_PAIR_TARGET 枚に
 *   なる組合せのみ数える。
 */
export function countCombos(ctx: SearchContext): number {
  const { input } = ctx;
  if (input.ownedOnly) {
    if (ctx.owned.length < 1 || ctx.candidates.length < 1) return 0;
    if (!input.shrinkPairOnly) {
      const limits = ctx.owned.map((c) => ctx.ownedLimit.get(c.ID!) ?? 0);
      let centerSum = 0;
      for (let ci = 0; ci < ctx.owned.length; ci++) {
        const adjusted = limits.slice();
        adjusted[ci] -= 1;
        centerSum += countMultisetsWithLimits(adjusted, 4);
      }
      return centerSum * ctx.candidates.length;
    }
    // 縮小2枚条件 (所持衣装検索): スロット0-4の縮小枚数がちょうど2枚なら非縮小フレンド、
    // それ以外 (0枚 / 1枚 / 3枚以上) は縮小フレンドのみを組合せる（除外はしない）
    let total = 0;
    for (let ci = 0; ci < ctx.owned.length; ci++) {
      const center = ctx.owned[ci];
      const cs = isShrinkCard(center) ? 1 : 0;
      const shrinkLimits: number[] = [];
      const nonShrinkLimits: number[] = [];
      for (const c of ctx.owned) {
        let lim = ctx.ownedLimit.get(c.ID!) ?? 0;
        if (c === center) lim -= 1;
        (isShrinkCard(c) ? shrinkLimits : nonShrinkLimits).push(lim);
      }
      for (let j = 0; j <= 4; j++) {
        const own5 = cs + j; // スロット0-4 の縮小枚数
        const friendPool = own5 === SHRINK_PAIR_TARGET ? ctx.nonShrink.length : ctx.shrink.length;
        if (friendPool < 1) continue;
        total += countMultisetsWithLimits(shrinkLimits, j)
          * countMultisetsWithLimits(nonShrinkLimits, 4 - j)
          * friendPool;
      }
    }
    return total;
  }
  if (ctx.candidates.length < 1) return 0;
  if (!input.shrinkPairOnly) {
    return multichoose(ctx.candidates.length, 2) * multichoose(ctx.candidates.length, 4);
  }
  // 縮小2枚条件: (center, friend) ペア内の縮小枚数 s2 ごとにメンバーの縮小枚数 k が決まる
  const S = ctx.shrink.length;
  const T = ctx.nonShrink.length;
  let total = 0;
  for (let s2 = 0; s2 <= SHRINK_PAIR_TARGET; s2++) {
    const k = SHRINK_PAIR_TARGET - s2;
    if (k < 0 || k > 4) continue;
    const pairs = s2 === 0 ? multichoose(T, 2) : s2 === 1 ? S * T : multichoose(S, 2);
    total += pairs * multichoose(S, k) * multichoose(T, 4 - k);
  }
  return total;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/maxScoreFinder.ts tests/unit/score/maxScoreFinder.test.ts
git commit -m "refactor(max-score-finder): SearchContext と countCombos をモジュールに移管

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: チャンク分割とデッキ列挙

**Files:**
- Modify: `src/lib/score/maxScoreFinder.ts`（末尾に追記）
- Modify: `tests/unit/score/maxScoreFinder.test.ts`（末尾に追記）

- [ ] **Step 1: 失敗するテストを書く**

import に追記:

```typescript
import {
  generateChunks,
  enumerateChunkDecks,
  type ChunkDescriptor,
} from '../../../src/lib/score/maxScoreFinder';
```

テスト末尾に追記:

```typescript
/** 全チャンクの全デッキを列挙して個数と正規化キーを集める */
function enumerateAll(input: SearchInput): { count: number; keys: Set<string>; decks: Card[][] } {
  const ctx = createSearchContext(input);
  const keys = new Set<string>();
  const decks: Card[][] = [];
  let count = 0;
  for (const chunk of generateChunks(ctx)) {
    for (const deck of enumerateChunkDecks(ctx, chunk)) {
      count++;
      decks.push([...deck]); // yield された配列は再利用されるためコピー
      // 正規化キー: (center,friend) は対称なのでソートしたペア + ソートしたメンバー
      const pair = [deck[0].ID!, deck[5].ID!].sort((a, b) => a - b).join('+');
      const members = deck.slice(1, 5).map((c) => c.ID!).sort((a, b) => a - b).join(',');
      keys.add(`${pair}|${members}`);
    }
  }
  return { count, keys, decks };
}

/** ownedOnly 用キー: center は役割が固定なので分離する */
function enumerateAllOwned(input: SearchInput): { count: number; keys: Set<string>; decks: Card[][] } {
  const ctx = createSearchContext(input);
  const keys = new Set<string>();
  const decks: Card[][] = [];
  let count = 0;
  for (const chunk of generateChunks(ctx)) {
    for (const deck of enumerateChunkDecks(ctx, chunk)) {
      count++;
      decks.push([...deck]);
      const members = deck.slice(1, 5).map((c) => c.ID!).sort((a, b) => a - b).join(',');
      keys.add(`${deck[0].ID}|${members}|${deck[5].ID}`);
    }
  }
  return { count, keys, decks };
}

describe('generateChunks + enumerateChunkDecks', () => {
  it('通常モード: 列挙数 = countCombos、重複なし', () => {
    const input = buildInput();
    const ctx = createSearchContext(input);
    const { count, keys } = enumerateAll(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count); // 正規化キーに重複がない = 同一編成を二度列挙しない
  });

  it('通常モード: チャンク数 = multichoose(N,2)', () => {
    const ctx = createSearchContext(buildInput());
    expect([...generateChunks(ctx)].length).toBe(multichoose(7, 2));
  });

  it('縮小2枚条件: 列挙数 = countCombos、全デッキの縮小枚数がちょうど 2', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAll(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      expect(deck.filter((c) => isShrinkCard(c)).length).toBe(2);
    }
  });

  it('所持衣装検索: 列挙数 = countCombos、スロット0-4 が所持上限内', () => {
    const ownedCounts = {
      [String(testCandidates[0].ID)]: 2, // 縮小持ち
      [String(testCandidates[1].ID)]: 1, // 縮小持ち
      [String(testCandidates[3].ID)]: 3, // 非縮小
      [String(testCandidates[4].ID)]: 1, // 非縮小
    };
    const input = buildInput({ ownedOnly: true, ownedCounts });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAllOwned(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      const usage = new Map<number, number>();
      for (let i = 0; i < 5; i++) usage.set(deck[i].ID!, (usage.get(deck[i].ID!) ?? 0) + 1);
      for (const [id, n] of usage) expect(n).toBeLessThanOrEqual(ownedCounts[String(id)] ?? 0);
    }
  });

  it('所持×縮小2枚条件: 列挙数 = countCombos、フレンドプール規則が守られる', () => {
    const ownedCounts = {
      [String(testCandidates[0].ID)]: 2,
      [String(testCandidates[1].ID)]: 1,
      [String(testCandidates[3].ID)]: 3,
      [String(testCandidates[4].ID)]: 1,
    };
    const input = buildInput({ ownedOnly: true, shrinkPairOnly: true, ownedCounts });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAllOwned(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      const shrink5 = deck.slice(0, 5).filter((c) => isShrinkCard(c)).length;
      // スロット0-4 が縮小2枚なら非縮小フレンド、それ以外は縮小フレンド
      expect(isShrinkCard(deck[5])).toBe(shrink5 !== 2);
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: FAIL（`generateChunks` / `enumerateChunkDecks` が未エクスポート）

- [ ] **Step 3: 実装を書く**

`src/lib/score/maxScoreFinder.ts` 末尾に追記。列挙ロジックは `SecretsTool.svelte` の `runSearch` 内 363〜465 行の 3 分岐を「チャンク = 外側ループ 1 周分」として分解したもの:

```typescript
/**
 * チャンク = Worker に渡す作業単位。
 * - pair: 通常モード。(center, friend) 多重集合ペア 1 つ (centerIdx ≤ friendIdx)
 * - shrinkPair: 縮小2枚条件。s2 = ペア内の縮小枚数。s2=0 は非縮小内ペア (aIdx ≤ bIdx)、
 *   s2=1 は (縮小 aIdx, 非縮小 bIdx) の直積、s2=2 は縮小内ペア (aIdx ≤ bIdx)
 * - center: 所持衣装検索。owned[centerIdx] をセンターに固定
 */
export type ChunkDescriptor =
  | { kind: 'pair'; centerIdx: number; friendIdx: number }
  | { kind: 'shrinkPair'; s2: 0 | 1 | 2; aIdx: number; bIdx: number }
  | { kind: 'center'; centerIdx: number };

export function* generateChunks(ctx: SearchContext): Generator<ChunkDescriptor> {
  const { input } = ctx;
  if (input.ownedOnly) {
    for (let ci = 0; ci < ctx.owned.length; ci++) yield { kind: 'center', centerIdx: ci };
    return;
  }
  if (input.shrinkPairOnly) {
    const S = ctx.shrink.length;
    const T = ctx.nonShrink.length;
    for (let a = 0; a < T; a++) for (let b = a; b < T; b++) yield { kind: 'shrinkPair', s2: 0, aIdx: a, bIdx: b };
    for (let a = 0; a < S; a++) for (let b = 0; b < T; b++) yield { kind: 'shrinkPair', s2: 1, aIdx: a, bIdx: b };
    for (let a = 0; a < S; a++) for (let b = a; b < S; b++) yield { kind: 'shrinkPair', s2: 2, aIdx: a, bIdx: b };
    return;
  }
  const N = ctx.candidates.length;
  for (let c = 0; c < N; c++) for (let f = c; f < N; f++) yield { kind: 'pair', centerIdx: c, friendIdx: f };
}

/**
 * チャンク内の全デッキを列挙する。
 * yield される配列は次の iteration で破壊的に書き換えられるため、
 * 保持する場合は呼び出し側でコピーすること。
 * deck の並びは [center, member1..4, friend]。
 */
export function* enumerateChunkDecks(ctx: SearchContext, chunk: ChunkDescriptor): Generator<Card[]> {
  const deck: Card[] = new Array(6);

  if (chunk.kind === 'pair') {
    // (center, friend) は UR/UR でセンタースキルレートが等しく team 値が入れ替え対称
    deck[0] = ctx.candidates[chunk.centerIdx];
    deck[5] = ctx.candidates[chunk.friendIdx];
    for (const m of multisetIndices(ctx.candidates.length, 4)) {
      deck[1] = ctx.candidates[m[0]];
      deck[2] = ctx.candidates[m[1]];
      deck[3] = ctx.candidates[m[2]];
      deck[4] = ctx.candidates[m[3]];
      yield deck;
    }
    return;
  }

  if (chunk.kind === 'shrinkPair') {
    const S = ctx.shrink;
    const T = ctx.nonShrink;
    if (chunk.s2 === 0) {
      deck[0] = T[chunk.aIdx];
      deck[5] = T[chunk.bIdx];
    } else if (chunk.s2 === 1) {
      deck[0] = S[chunk.aIdx];
      deck[5] = T[chunk.bIdx];
    } else {
      deck[0] = S[chunk.aIdx];
      deck[5] = S[chunk.bIdx];
    }
    const k = SHRINK_PAIR_TARGET - chunk.s2; // メンバー4枠中の縮小枚数
    if (k < 0 || k > 4) return;
    for (const sm of multisetIndicesOrEmpty(S.length, k)) {
      for (const nm of multisetIndicesOrEmpty(T.length, 4 - k)) {
        for (let i = 0; i < k; i++) deck[1 + i] = S[sm[i]];
        for (let i = 0; i < 4 - k; i++) deck[1 + k + i] = T[nm[i]];
        yield deck;
      }
    }
    return;
  }

  // kind === 'center': 所持衣装検索
  // center + member1..4 を所持枚数の範囲内で組合せ、フレンドは全候補
  // ((center, friend) 対称性は所持プールが非対称なため利用しない)
  const owned = ctx.owned;
  deck[0] = owned[chunk.centerIdx];
  for (const m of multisetIndices(owned.length, 4)) {
    deck[1] = owned[m[0]];
    deck[2] = owned[m[1]];
    deck[3] = owned[m[2]];
    deck[4] = owned[m[3]];

    // 5 スロット内の所持枚数違反を skip
    const usage = new Map<number, number>();
    for (let i = 0; i < 5; i++) {
      const id = deck[i].ID!;
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    let valid = true;
    for (const [id, n] of usage) {
      if (n > (ctx.ownedLimit.get(id) ?? 0)) { valid = false; break; }
    }
    if (!valid) continue;

    // 縮小2枚条件: スロット0-4の縮小がちょうど2枚なら非縮小フレンド、
    // それ以外 (0枚 / 1枚 / 3枚以上) は縮小フレンドのみ（組合せ自体は除外しない）
    let friendPool = ctx.candidates;
    if (ctx.input.shrinkPairOnly) {
      let shrinkCount5 = 0;
      for (let i = 0; i < 5; i++) {
        if (isShrinkCard(deck[i])) shrinkCount5++;
      }
      friendPool = shrinkCount5 === SHRINK_PAIR_TARGET ? ctx.nonShrink : ctx.shrink;
    }

    for (const f of friendPool) {
      deck[5] = f;
      yield deck;
    }
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/maxScoreFinder.ts tests/unit/score/maxScoreFinder.test.ts
git commit -m "feat(max-score-finder): チャンク分割とデッキ列挙ジェネレーターを実装

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: デッキ評価・チャンク実行・Top-K マージ・フレンド差し替え

**Files:**
- Modify: `src/lib/score/maxScoreFinder.ts`（末尾に追記）
- Modify: `tests/unit/score/maxScoreFinder.test.ts`（末尾に追記）

- [ ] **Step 1: 失敗するテストを書く**

import に追記:

```typescript
import {
  evaluateDeck,
  evaluateChunk,
  mergeTopK,
  evaluateFriendSwap,
  TOP_K,
  type DeckRecord,
} from '../../../src/lib/score/maxScoreFinder';
```

テスト末尾に追記。実エンジン評価が走るため候補は 5 枚に絞る（H(5,2)×H(5,4) = 15×70 = 1,050 デッキ）:

```typescript
describe('evaluateChunk / mergeTopK (実エンジン評価)', () => {
  // 評価コストを抑えるため候補 5 枚 (縮小 2 + 非縮小 3)
  const smallInput = buildInput({
    candidates: [...shrinkUr.slice(0, 2), ...nonShrinkUr.slice(0, 3)],
  });

  async function runAllChunks(input: SearchInput, shuffle: boolean): Promise<{ top: DeckRecord[]; evaluated: number }> {
    const ctx = createSearchContext(input);
    const chunks = [...generateChunks(ctx)];
    if (shuffle) chunks.reverse(); // 順序を変えても結果が同じことの検証
    const tops: DeckRecord[][] = [];
    let evaluated = 0;
    for (const chunk of chunks) {
      const r = await evaluateChunk(ctx, chunk);
      tops.push(r.topK);
      evaluated += r.evaluated;
    }
    return { top: mergeTopK(tops, TOP_K), evaluated };
  }

  it('順次実行とチャンク順入れ替え実行で Top-K が一致する (分割の完全性)', async () => {
    const a = await runAllChunks(smallInput, false);
    const b = await runAllChunks(smallInput, true);
    const ctx = createSearchContext(smallInput);
    expect(a.evaluated).toBe(countCombos(ctx));
    expect(b.evaluated).toBe(a.evaluated);
    expect(a.top.map((r) => r.score)).toEqual(b.top.map((r) => r.score));
    expect(a.top[0].cardIds.slice().sort()).toEqual(b.top[0].cardIds.slice().sort());
  });

  it('evalMode=max でも動作しスコアは expected と異なりうる', async () => {
    const r = await runAllChunks({ ...smallInput, evalMode: 'max' }, false);
    expect(r.top.length).toBeGreaterThan(0);
    expect(r.top[0].score).toBeGreaterThan(0);
  });

  it('evaluateDeck: expected モードでは内訳フィールドが埋まる', () => {
    const ctx = createSearchContext(smallInput);
    const deck = new Array(6).fill(ctx.candidates[0]);
    const rec = evaluateDeck(ctx, deck);
    expect(rec.cardIds).toEqual(deck.map((c) => c.ID));
    expect(rec.score).toBe(rec.finalScore);
    expect(rec.baseScore).toBeGreaterThan(0);
    expect(rec.liveEndScore).toBeDefined();
  });

  it('onTick が true を返すと中断され、部分結果が整合する', async () => {
    const ctx = createSearchContext(smallInput);
    const chunk = [...generateChunks(ctx)][0];
    let ticks = 0;
    // yieldEvery=10 で 1 回目の tick (10 評価後) に中断
    const r = await evaluateChunk(ctx, chunk, { onTick: () => { ticks++; return true; } }, 10);
    expect(r.aborted).toBe(true);
    expect(r.evaluated).toBe(10);
    expect(ticks).toBe(1);
    expect(r.topK.length).toBeLessThanOrEqual(TOP_K);
    for (let i = 1; i < r.topK.length; i++) {
      expect(r.topK[i].score).toBeLessThanOrEqual(r.topK[i - 1].score);
    }
  });

  it('onTick は yieldEvery ごとと完了時の端数で呼ばれ、delta 合計 = evaluated', async () => {
    const ctx = createSearchContext(smallInput);
    const chunk = [...generateChunks(ctx)][0]; // 1 チャンク = H(5,4) = 70 デッキ
    let total = 0;
    const r = await evaluateChunk(ctx, chunk, { onTick: (delta) => { total += delta; return false; } }, 30);
    expect(r.evaluated).toBe(70);
    expect(total).toBe(70); // 30 + 30 + 10 (端数)
    expect(r.aborted).toBe(false);
  });
});

describe('mergeTopK', () => {
  const rec = (score: number): DeckRecord => ({ cardIds: [1, 2, 3, 4, 5, 6], score });

  it('空リスト・空配列を許容する', () => {
    expect(mergeTopK([], 10)).toEqual([]);
    expect(mergeTopK([[], []], 10)).toEqual([]);
  });

  it('スコア降順にマージして k 件に切り詰める', () => {
    const merged = mergeTopK([[rec(5), rec(1)], [rec(3)], [rec(9), rec(2)]], 3);
    expect(merged.map((r) => r.score)).toEqual([9, 5, 3]);
  });

  it('k 件未満ならあるだけ返す', () => {
    expect(mergeTopK([[rec(1)]], 10).length).toBe(1);
  });

  it('同点は件数を失わない', () => {
    expect(mergeTopK([[rec(5), rec(5)], [rec(5)]], 2).map((r) => r.score)).toEqual([5, 5]);
  });
});

describe('evaluateFriendSwap', () => {
  it('最適編成のフレンド差し替え Top 5 を返す (スコア降順)', async () => {
    const ctx = createSearchContext(smallInput);
    const chunks = [...generateChunks(ctx)];
    const tops: DeckRecord[][] = [];
    for (const chunk of chunks) tops.push((await evaluateChunk(ctx, chunk)).topK);
    const best = mergeTopK(tops, 1)[0];
    const friends = evaluateFriendSwap(ctx, best.cardIds);
    expect(friends.length).toBe(Math.min(5, ctx.candidates.length));
    for (let i = 1; i < friends.length; i++) {
      expect(friends[i].score).toBeLessThanOrEqual(friends[i - 1].score);
    }
    // 最良フレンドのスコアは全体ベストと一致する (best 自身が候補に含まれるため)
    expect(friends[0].score).toBe(best.score);
  });

  it('縮小2枚条件: 固定5枠の縮小枚数に応じてプールが絞られる', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    // 固定5枠 = 縮小2枚 (center 縮小 + member1 縮小) → フレンドは非縮小プール
    const fixedIds = [
      shrinkUr[0].ID!, shrinkUr[1].ID!,
      nonShrinkUr[0].ID!, nonShrinkUr[1].ID!, nonShrinkUr[2].ID!,
      nonShrinkUr[3].ID!,
    ];
    const friends = evaluateFriendSwap(ctx, fixedIds);
    const ids = new Set(ctx.nonShrink.map((c) => c.ID));
    for (const f of friends) expect(ids.has(f.cardId)).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: FAIL（`evaluateDeck` / `evaluateChunk` / `mergeTopK` / `evaluateFriendSwap` / `TOP_K` が未エクスポート）

- [ ] **Step 3: 実装を書く**

`src/lib/score/maxScoreFinder.ts` の engine import を拡張:

```typescript
import {
  computeGroupSizes,
  computeShrinkExclusion,
  computeTeam,
  calcExpectedScore,
  calcMaxScore,
  flattenNotes,
} from './engine';
```

末尾に追記。`evaluateDeck` は `SecretsTool.svelte` 326〜352 行、`pushTop` は 305〜313 行、フレンド差し替えは 472〜502 行の移植:

```typescript
export const TOP_K = 10;
/** この評価数ごとに onTick を呼ぶ (進捗報告・中断確認・イベントループへの yield) */
export const YIELD_EVERY = 3000;

export interface DeckRecord {
  /** [center, member1..4, friend] の cardID */
  cardIds: number[];
  score: number;
  liveEndScore?: number;
  baseScore?: number;
  scoreUpExpected?: number;
  shrinkExpected?: number;
  finalScore?: number;
}

export interface FriendCandidate {
  cardId: number;
  score: number;
}

export interface ChunkCallbacks {
  /**
   * yieldEvery 評価ごとと、チャンク完了時の端数で呼ばれる。
   * true を返すとチャンクを中断する (完了時の端数呼び出しの返り値は無視される)。
   */
  onTick?: (evaluatedDelta: number, localBest: DeckRecord | null) => boolean | Promise<boolean>;
}

export interface ChunkResult {
  topK: DeckRecord[];
  evaluated: number;
  aborted: boolean;
}

// 探索条件は全カード スキルLv5・特訓済み・共有ブローチなしで固定 (現行 SecretsTool と同値)
const SEARCH_SKILL_LEVELS: (1 | 2 | 3 | 4 | 5)[] = [5, 5, 5, 5, 5, 5];
const SEARCH_TRAINED: boolean[] = [true, true, true, true, true, true];
const SEARCH_EMPTY_SHARED: number[][] = [[], [], [], [], [], []];

export function evaluateDeck(ctx: SearchContext, deck: (Card | null)[]): DeckRecord {
  const { input } = ctx;
  const tiers: EventBonusTier[] = deck.map((c) =>
    c && c.ID != null ? input.tierByCardId[String(c.ID)] ?? 'none' : 'none'
  );
  const team = computeTeam(
    deck, input.broachs, input.song, tiers, SEARCH_TRAINED, undefined,
    SEARCH_EMPTY_SHARED, SEARCH_SKILL_LEVELS, input.rabbitNotes
  );
  const exclusion = computeShrinkExclusion(team, ctx.groupSizes);
  const notes = flattenNotes(input.song, FLATTEN_SEED, exclusion);
  const rec: DeckRecord = {
    cardIds: deck.map((c) => c!.ID!),
    score: 0,
  };
  if (input.evalMode === 'expected') {
    const e = calcExpectedScore(team, notes, ctx.notesCount, input.scoreOptions);
    rec.score = e.finalScore;
    rec.baseScore = e.baseScore;
    rec.scoreUpExpected = e.scoreUpExpected;
    rec.shrinkExpected = e.shrinkExpected;
    rec.liveEndScore = e.liveEndScore;
    rec.finalScore = e.finalScore;
  } else {
    const s = calcMaxScore(team, notes, input.scoreOptions);
    rec.score = s;
    rec.finalScore = s;
  }
  return rec;
}

function pushTop(top: DeckRecord[], rec: DeckRecord, k: number): void {
  if (top.length < k) {
    top.push(rec);
    top.sort((a, b) => b.score - a.score);
  } else if (rec.score > top[k - 1].score) {
    top[k - 1] = rec;
    top.sort((a, b) => b.score - a.score);
  }
}

/** チャンク内の全デッキを評価し、ローカル Top-K と評価件数を返す */
export async function evaluateChunk(
  ctx: SearchContext,
  chunk: ChunkDescriptor,
  callbacks?: ChunkCallbacks,
  yieldEvery: number = YIELD_EVERY,
): Promise<ChunkResult> {
  const top: DeckRecord[] = [];
  let evaluated = 0;
  let sinceTick = 0;
  let aborted = false;
  for (const deck of enumerateChunkDecks(ctx, chunk)) {
    pushTop(top, evaluateDeck(ctx, deck), TOP_K);
    evaluated++;
    sinceTick++;
    if (sinceTick >= yieldEvery && callbacks?.onTick) {
      const stop = await callbacks.onTick(sinceTick, top[0] ?? null);
      sinceTick = 0;
      if (stop) {
        aborted = true;
        break;
      }
    }
  }
  // 完了時の端数を報告 (中断指示は無視: チャンクは既に終わっている)
  if (sinceTick > 0 && callbacks?.onTick) {
    await callbacks.onTick(sinceTick, top[0] ?? null);
  }
  return { topK: top, evaluated, aborted };
}

/** 各 Worker のローカル Top-K をスコア降順にマージして上位 k 件を返す */
export function mergeTopK(lists: DeckRecord[][], k: number = TOP_K): DeckRecord[] {
  return lists.flat().sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * 最適編成の center + member1..4 を固定し、フレンドだけ差し替えた Top 5 を返す。
 * shrinkPairOnly 時はスロット0-4 の縮小枚数に応じてプールを絞る (探索時と同じ規則)。
 */
export function evaluateFriendSwap(ctx: SearchContext, bestCardIds: number[]): FriendCandidate[] {
  const byId = new Map(ctx.candidates.map((c) => [c.ID!, c]));
  const fixed: (Card | null)[] = bestCardIds.map((id) => byId.get(id) ?? null);
  let pool = ctx.candidates;
  if (ctx.input.shrinkPairOnly) {
    let fixedShrink = 0;
    for (let i = 0; i < 5; i++) {
      if (isShrinkCard(fixed[i])) fixedShrink++;
    }
    pool = fixedShrink === SHRINK_PAIR_TARGET ? ctx.nonShrink : ctx.shrink;
  }
  const scores: FriendCandidate[] = [];
  for (const cand of pool) {
    fixed[5] = cand;
    scores.push({ cardId: cand.ID!, score: evaluateDeck(ctx, fixed).score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 5);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:unit -- tests/unit/score/maxScoreFinder.test.ts`
Expected: PASS（実エンジン評価を含むため数秒〜十数秒かかる場合がある）

- [ ] **Step 5: 既存テストが壊れていないことを確認**

Run: `npm run test:unit`
Expected: 全ファイル PASS

- [ ] **Step 6: コミット**

```bash
git add src/lib/score/maxScoreFinder.ts tests/unit/score/maxScoreFinder.test.ts
git commit -m "feat(max-score-finder): チャンク評価・Top-K マージ・フレンド差し替えを実装

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Worker プロトコル型と Worker エントリ

**Files:**
- Modify: `src/lib/score/maxScoreFinder.ts`（プロトコル型を追記）
- Create: `src/lib/score/maxScoreFinder.worker.ts`

Worker エントリは onmessage の配線のみの薄いラッパーであり、ロジックは Task 1〜4 でテスト済みの純粋関数に委譲するため、単体テストは書かない（spec のテスト計画どおり）。動作は Task 7 のブラウザ検証で確認する。

- [ ] **Step 1: プロトコル型を maxScoreFinder.ts に追記**

```typescript
/** メイン → Worker */
export type FinderWorkerRequest =
  | { type: 'init'; input: SearchInput }
  | { type: 'chunk'; descriptor: ChunkDescriptor }
  | { type: 'abort' };

/** Worker → メイン */
export type FinderWorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; evaluatedDelta: number; localBestScore: number | null }
  | { type: 'result'; topK: DeckRecord[]; evaluated: number; aborted: boolean };
```

- [ ] **Step 2: Worker エントリを作成**

`src/lib/score/maxScoreFinder.worker.ts` を新規作成:

```typescript
/// <reference lib="webworker" />
/**
 * max-score-finder 探索 Worker。
 * init で SearchContext を構築し、chunk を受けるたびに evaluateChunk を実行して
 * progress / result を返す。ロジックはすべて maxScoreFinder.ts (テスト済み) に委譲する。
 */
import {
  createSearchContext,
  evaluateChunk,
  type FinderWorkerRequest,
  type FinderWorkerResponse,
  type SearchContext,
} from './maxScoreFinder';

declare const self: DedicatedWorkerGlobalScope;

let ctx: SearchContext | null = null;
let aborted = false;

const post = (msg: FinderWorkerResponse): void => self.postMessage(msg);

self.onmessage = async (e: MessageEvent<FinderWorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    ctx = createSearchContext(msg.input);
    aborted = false;
    post({ type: 'ready' });
    return;
  }

  if (msg.type === 'abort') {
    aborted = true;
    return;
  }

  // msg.type === 'chunk'
  if (!ctx) return;
  const result = await evaluateChunk(ctx, msg.descriptor, {
    onTick: async (evaluatedDelta, localBest) => {
      post({ type: 'progress', evaluatedDelta, localBestScore: localBest?.score ?? null });
      // マクロタスクで yield してメッセージループに制御を返し、
      // キュー済みの abort メッセージを処理させる (Promise.resolve() では不可)
      await new Promise((r) => setTimeout(r, 0));
      return aborted;
    },
  });
  post({ type: 'result', topK: result.topK, evaluated: result.evaluated, aborted: result.aborted });
};
```

- [ ] **Step 3: 型チェックとテストを確認**

Run: `npx astro check 2>&1 | tail -5`（`astro check` が未導入で失敗する場合は `npx svelte-check --threshold error 2>&1 | tail -5`。どちらも未導入ならこのステップはスキップし、Task 7 のビルド/ブラウザ検証で担保する）
Expected: maxScoreFinder.worker.ts に起因するエラーがないこと

Run: `npm run test:unit`
Expected: 全 PASS

- [ ] **Step 4: コミット**

```bash
git add src/lib/score/maxScoreFinder.ts src/lib/score/maxScoreFinder.worker.ts
git commit -m "feat(max-score-finder): 探索 Worker エントリとプロトコル型を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: SecretsTool.svelte を Worker プール方式に配線替え

**Files:**
- Modify: `src/components/SecretsTool.svelte`

マークアップ（572 行目以降）は変更しない。`<script>` ブロックのみ変更する。

- [ ] **Step 1: 抽出済みロジックを削除し import に置き換える**

**削除する**（現行の行番号）:
- 38〜50 行: `DeckRecord` / `FriendCandidate` 型定義（モジュールから import に置換）
- 73〜80 行: `SHRINK_PAIR_TARGET` / `isShrinkCard`（import に置換）
- 126〜152 行: `binomial` / `multichoose` / `countMultisetsWithLimits`
- 154〜211 行: `comboCount` の $derived 本体（Step 2 で新実装に置換）
- 246〜263 行: `multisetIndices` / `multisetIndicesOrEmpty`

**import を変更**: 既存の `engine` import 行を以下に縮小（`computeTeam` のみ残す。`calcMaxScore` / `calcExpectedScore` / `flattenNotes` / `computeShrinkExclusion` / `computeGroupSizes` は不要になる）:

```typescript
import { computeTeam } from '../lib/score/engine';
import {
  countCombos,
  createSearchContext,
  generateChunks,
  mergeTopK,
  evaluateFriendSwap,
  isShrinkCard,
  TOP_K,
  type DeckRecord,
  type FriendCandidate,
  type SearchInput,
  type FinderWorkerResponse,
} from '../lib/score/maxScoreFinder';
```

`SearchResult` 型はコンポーネントに残す（`DeckRecord` / `FriendCandidate` はモジュール型を参照するようになる）。

- [ ] **Step 2: buildSearchInput と comboCount を実装する**

`shrinkCandidates` / `nonShrinkCandidates` / `ownedCandidates` 等の $derived（UI 表示用）はそのまま残す。旧 `comboCount` $derived があった位置（154 行目付近）に以下を追加:

```typescript
  /**
   * 現在の UI 状態から探索入力を構築する。
   * $state プロキシは postMessage (structured clone) できないため
   * $state.snapshot でプレーン化する。
   */
  function buildSearchInput(): SearchInput | null {
    if (!selectedSong) return null;
    const tierByCardId: Record<string, EventBonusTier> = {};
    for (const c of currentCandidates) {
      if (c.ID != null) tierByCardId[String(c.ID)] = currentTierMap.get(c.ID) ?? 'none';
    }
    const ownedCounts: Record<string, number> = {};
    for (const c of ownedCandidates) {
      if (c.ID != null) ownedCounts[String(c.ID)] = ownedCountOf(c);
    }
    return $state.snapshot({
      evalMode,
      ownedOnly,
      shrinkPairOnly,
      scoreOptions: { scoreUpAssist, scoreUpBadgeRate },
      candidates: currentCandidates,
      ownedCounts,
      song: selectedSong,
      broachs: allBroachs,
      tierByCardId,
      rabbitNotes: loadRabbitNotes(),
    }) as SearchInput;
  }

  const comboCount = $derived.by(() => {
    const input = buildSearchInput();
    if (!input) return 0;
    return countCombos(createSearchContext(input));
  });
```

注意: `EventBonusTier` 型 import は既存（12 行目）にある。`loadRabbitNotes` import も既存（16 行目）。

- [ ] **Step 3: runSearch を Worker プール方式に書き換える**

現行の `runSearch`（273〜515 行）と `requestAbort`（517〜519 行）を以下に置き換える。`formatElapsed` / `buildTiersFromDeck` / `getCardById` / `sendToScoreCalc` / `bestContext` は変更しない:

```typescript
  let activeWorkers: Worker[] = [];

  async function runSearch() {
    const input = buildSearchInput();
    if (!input || input.candidates.length < 1) return;

    const ctx = createSearchContext(input);
    const totalEvals = countCombos(ctx);
    if (totalEvals > 5_000_000) {
      const estMinutes = Math.ceil(totalEvals / 300_000 / 60);
      const ok = confirm(
        `評価する組合せが ${totalEvals.toLocaleString()} 通りあります。\n計算時間は目安として ${estMinutes} 分以上かかる可能性があります。\n続行しますか？`
      );
      if (!ok) return;
    }

    abortRequested = false;
    searching = true;
    progressPct = 0;
    progressText = '準備中…';

    const chunks = [...generateChunks(ctx)];
    const workerCount = Math.min(
      8,
      Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
      Math.max(1, chunks.length),
    );

    const t0 = performance.now();
    let evaluated = 0;
    let provisionalBest: number | null = null;
    const localTops: DeckRecord[][] = [];
    let anyAborted = false;
    const workers: Worker[] = [];
    activeWorkers = workers; // requestAbort から abort メッセージを送るため探索中のみ共有

    const updateProgress = () => {
      const pct = Math.min(100, Math.round((evaluated / Math.max(1, totalEvals)) * 100));
      progressPct = pct;
      const speed = evaluated / ((performance.now() - t0) / 1000);
      const etaSec = Math.max(0, (totalEvals - evaluated) / Math.max(1, speed));
      progressText = `探索中… ${pct}%（${workerCount}並列, ${evaluated.toLocaleString()} / ${totalEvals.toLocaleString()}, 残り約 ${formatElapsed(etaSec * 1000)}, 暫定 1位: ${provisionalBest != null ? provisionalBest.toLocaleString() : '-'}）`;
    };

    try {
      await new Promise<void>((resolve, reject) => {
        if (chunks.length === 0) { resolve(); return; }
        let nextChunk = 0;
        let active = 0;

        const dispatch = (w: Worker) => {
          if (abortRequested || nextChunk >= chunks.length) {
            if (active === 0) resolve();
            return;
          }
          active++;
          w.postMessage({ type: 'chunk', descriptor: chunks[nextChunk++] });
        };

        for (let i = 0; i < workerCount; i++) {
          const w = new Worker(
            new URL('../lib/score/maxScoreFinder.worker.ts', import.meta.url),
            { type: 'module' },
          );
          workers.push(w);
          w.onerror = (e) => reject(new Error(`探索 Worker でエラーが発生しました: ${e.message}`));
          w.onmessage = (e: MessageEvent<FinderWorkerResponse>) => {
            const msg = e.data;
            if (msg.type === 'ready') {
              dispatch(w);
              return;
            }
            if (msg.type === 'progress') {
              evaluated += msg.evaluatedDelta;
              if (msg.localBestScore != null && (provisionalBest == null || msg.localBestScore > provisionalBest)) {
                provisionalBest = msg.localBestScore;
              }
              updateProgress();
              return;
            }
            // msg.type === 'result'
            localTops.push(msg.topK);
            if (msg.aborted) anyAborted = true;
            active--;
            dispatch(w);
          };
          w.postMessage({ type: 'init', input });
        }
      });

      const elapsedMs = Math.round(performance.now() - t0);
      const top = mergeTopK(localTops, TOP_K);

      if (top.length === 0) {
        alert('評価できる組合せがありませんでした');
      } else {
        // 最適編成の center + member1..4 を固定し、friend だけ全候補に切り替えて Top 5 を抽出
        const topFriends = evaluateFriendSwap(ctx, top[0].cardIds);
        lastResult = {
          best: top[0],
          top,
          topFriends,
          evaluated,
          elapsedMs,
          evalMode: input.evalMode,
          aborted: abortRequested || anyAborted,
        };
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '探索中にエラーが発生しました');
    } finally {
      for (const w of workers) w.terminate();
      activeWorkers = [];
      searching = false;
    }
  }

  function requestAbort() {
    abortRequested = true;
    for (const w of activeWorkers) w.postMessage({ type: 'abort' });
  }
```

- [ ] **Step 4: 単体テストと dev サーバーで疎通確認**

Run: `npm run test:unit`
Expected: 全 PASS

Run: `npm run dev` をバックグラウンド起動し、ready ログを待つ:

```bash
# run_in_background: true で起動後
until grep -q "ready in" <devサーバーログ>; do sleep 1; done
```

ブラウザ（Playwright MCP / chrome-devtools MCP）で `http://localhost:4321/score-calc/max-score-finder/` を開き:

1. 楽曲を選択 → 評価する組合せ数が表示されること（`countCombos` 疎通）
2. 「総当たり探索を開始」→ 進捗バーが動き「（N並列）」が表示されること
3. 探索完了 → 最適編成・スコア内訳・フレンド候補 TOP5・上位候補 TOP10 が表示されること
4. コンソールに DataCloneError 等のエラーがないこと（$state.snapshot 漏れの検出）
5. もう一度探索を開始し「中断」ボタン → 数秒以内に部分結果が表示されること
6. スクリーンショットを `tmp/` に保存

- [ ] **Step 5: コミット**

```bash
git add src/components/SecretsTool.svelte
git commit -m "feat(max-score-finder): 探索を Worker プールで並列実行するよう配線替え

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 検証（結果一致・性能・E2E）

**Files:** なし（検証のみ。問題があれば該当 Task に戻って修正）

- [ ] **Step 1: 本番サイトとの結果一致確認**

本番 `https://i7.yo4raw.com/score-calc/max-score-finder/` と ローカル dev サーバーで**同一条件**（同じ楽曲・評価指標 expected・SCOREUPアシスト OFF・バッジ 0%・チェックボックス OFF）の探索を実行し、以下が一致することを確認する:

- 最終リザルト（best.score）
- スコア内訳（属性値による楽曲スコア / スコアアップ期待値 / 判定縮小期待値）
- 上位候補 TOP10 のスコア列（同点順位の並び替わりは許容）

マスターデータは同一スプレッドシート・同一イベント CSV を参照するため一致するはず。**不一致の場合は移植バグなので Task 2〜4 を疑い、`systematic-debugging` で原因を特定するまで先に進まない**。

- [ ] **Step 2: 「判定縮小2枚編成」「所持衣装で検索」モードの動作確認**

dev サーバーで:

1. 「判定縮小2枚編成」ON → 組合せ数が減ること、探索結果の 6 枠中縮小持ちがちょうど 2 枚であること
2. 「所持衣装で検索」ON（localStorage に所持データがなければ所持衣装ページで数枚設定）→ 探索が完走すること
3. 探索完了後「この編成をスコア計算ページに送る」→ スコア計算ページに編成が引き継がれること

- [ ] **Step 3: 性能計測**

同一条件で main ブランチ（`git stash` 不要、本番サイトの計測でも可）と並列版の探索時間を比較し、結果を記録する:

```
条件: 楽曲 <名前>, 候補 <N> 枚, 組合せ <M> 通り
本番(逐次): <X> 秒 / 並列版(<K>並列): <Y> 秒 (約 <X/Y> 倍)
```

並列数倍に届かなくても劣化していなければ OK（チャンク粒度や転送オーバーヘッドの改善は別 PR）。**逐次より遅い場合は原因を調査するまでマージしない**。

- [ ] **Step 4: E2E テスト**

Run: `npm run test` （build 込みで 5〜7 分。Bash timeout は 600000 ms を指定）
Expected: 全 PASS（max-score-finder の専用 E2E はないが、ビルド成否と既存ページのリグレッションを担保）

- [ ] **Step 5: 計測結果を記録してコミット**

`docs/superpowers/specs/2026-06-10-max-score-finder-parallel-design.md` の末尾に「## 実測結果」セクションとして Step 1〜3 の結果を追記:

```bash
git add docs/superpowers/specs/2026-06-10-max-score-finder-parallel-design.md
git commit -m "docs(specs): Worker 並列化の実測結果を追記

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 完了後（プロジェクト Workflow に従う）

1. スクリーンショットをユーザーに提示して確認を取る
2. 確認が取れたら `git push` → PR 作成（`gh pr create`）→ マージ後 `git tag v1.12.x && git push origin v1.12.x` でリリース（リリースノートはタグから自動生成）
