# Phase 3: MaxScoreFinder と engine.ts の整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MaxScoreFinder.svelte`（788 行）から Worker 管理と結果表示を抽出し、`engine.ts`（935 行）をチーム計算とシミュレーションに分割する（スペック: `docs/superpowers/specs/2026-06-10-phased-refactoring-design.md` の Phase 3）。

**Architecture:** 完全に振る舞い保存。Worker メッセージプロトコル（init/chunk/abort/ready/progress/result/error）と探索結果は不変。engine.ts は re-export 互換レイヤーとして残し、既存 import（コンポーネント・maxScoreFinder.ts・テスト 3 ファイル）を壊さない。オラクルテスト（spreadsheetDiff.test.ts）と E2E（max-score-finder.test.ts）が回帰防止。各タスク = 1 ブランチ = 1 PR。

**Tech Stack:** Svelte 5 Runes / TypeScript / Web Worker / Vitest / Playwright

**各タスク共通の検証コマンド**（「共通検証」）: `npm run typecheck` → 0 errors、`npm run test:unit` → 228+ PASS、`npx playwright test` → 12 passed / 2 skipped（dev サーバー :4321 再利用。フレーク時は該当のみ単独再実行）。

---

### Task 1: SearchWorkerPool の抽出（スペック 3.1）

**Branch:** `refactor/phase3-worker-pool`

**Files:**
- Create: `src/lib/score/searchWorkerPool.ts`
- Modify: `src/components/MaxScoreFinder.svelte`（runSearch 内の Worker 制御部 約 234〜293 行を置換）

- [ ] **Step 1: searchWorkerPool.ts を作る**

公開インターフェース（厳守）:

```typescript
import type { ChunkDescriptor, DeckRecord, SearchInput } from './maxScoreFinder';

export interface SearchPoolOutcome {
  /** 各 Worker が返した chunk ごとの topK（呼び出し元で mergeTopK する） */
  localTops: DeckRecord[][];
  evaluated: number;
  aborted: boolean;
}

export interface SearchPoolRun {
  promise: Promise<SearchPoolOutcome>;
  /** 全 Worker に abort を送る（既存 requestAbort と同じ動き） */
  abort: () => void;
}

/**
 * Worker プールを起動して chunk を分配し、全 chunk の評価完了（または中断）まで進める。
 * メッセージプロトコル（init/chunk/abort → ready/progress/result/error）は
 * maxScoreFinder.worker.ts と 1:1。終了時（成功/失敗とも）に全 Worker を terminate する。
 */
export function startWorkerSearch(
  input: SearchInput,
  chunks: ChunkDescriptor[],
  workerCount: number,
  onProgress: (evaluatedTotal: number, provisionalBestScore: number | null) => void,
): SearchPoolRun
```

本体は `MaxScoreFinder.svelte` の `runSearch()` 内の Worker 制御部（Worker 生成 `new Worker(new URL('../lib/score/maxScoreFinder.worker.ts', import.meta.url), { type: 'module' })` 相当・dispatch クロージャ・onerror/onmessage ハンドラ・localTops 集約・active カウント・abort 済み判定・finally の terminate）を**忠実に移植**する。Worker URL は `new URL('./maxScoreFinder.worker.ts', import.meta.url)` に変える（同ディレクトリ相対。Vite が静的解決できる形を維持）。進捗の累積（evaluatedDelta 加算）と provisional best（localBestScore の最大値追跡）はプール内で行い、onProgress に集約値を渡す。

- [ ] **Step 2: MaxScoreFinder.svelte を乗せ換える**

`runSearch()` の Worker 制御部を以下に置換（前後の処理 — `createSearchContext` / `countCombos` / 5M confirm / Worker 数決定（`Math.min(8, Math.max(1, (navigator.hardwareConcurrency || 4) - 1))` 等の既存式）/ `mergeTopK` / `evaluateFriendSwap` / `lastResult` 構築 / elapsed 計測 / searching・progress の `$state` 更新 — は親に残す):

```typescript
const run = startWorkerSearch(input, chunks, workerCount, (evaluated, best) => {
  // 既存 updateProgress の本体（progressPct / progressText の更新式）をここに
});
activeRun = run;            // requestAbort 用に保持（activeWorkers: Worker[] を置き換える）
const { localTops, evaluated, aborted } = await run.promise;
```

`requestAbort()` は `abortRequested = true; activeRun?.abort();` に変更（既存のフラグ挙動を維持）。`activeWorkers` と `$effect` の terminate cleanup は `activeRun?.abort()`（abort が terminate も保証するならそれ）に置換 — **コンポーネント破棄時に Worker が残らない**ことを既存同様に保証する設計にする（pool 側の finally で terminate されるが、破棄時の即時 terminate 用に `SearchPoolRun` へ `terminate()` を追加してもよい。追加した場合はインターフェースの追加として報告）。

- [ ] **Step 3: 共通検証** + E2E `tests/max-score-finder.test.ts`（探索完走）は必須。dev サーバーで実機確認: 探索実行 → 進捗表示 → 完走、中断ボタンで中断。`tmp/phase3-worker-pool.png` 保存。

- [ ] **Step 4: コミット**

```bash
git add src/lib/score/searchWorkerPool.ts src/components/MaxScoreFinder.svelte
git commit -m "refactor(max-score-finder): Worker プール制御を searchWorkerPool に抽出"
```

---

### Task 2: SearchResults.svelte の抽出（スペック 3.2）

**Branch:** `refactor/phase3-search-results`

**Files:**
- Create: `src/components/score/SearchResults.svelte`
- Modify: `src/components/MaxScoreFinder.svelte`（結果表示 約 529〜788 行を置換）

- [ ] **Step 1: SearchResults.svelte を作る**

公開インターフェース（厳守）:

```svelte
<script lang="ts">
  let { result, selectedSong, allCards, allBroachs, currentTierMap, base }: {
    result: SearchResult;            // MaxScoreFinder の lastResult と同型（型定義は MaxScoreFinder から移すか共有箇所に置く — 実装時に最小の置き場所を判断して報告）
    selectedSong: Song | null;
    allCards: Card[];
    allBroachs: FixedBroach[];
    currentTierMap: Map<number, EventBonusTier>;
    base: string;                    // sendToScoreCalc の遷移先 URL 用
  } = $props();
</script>
```

移植対象: 最適編成 6 枠（DISPLAY_ORDER 順・特効バッジ・属性枠色）/ 衣装詳細テーブル（bestContext = computeTeam + resolveDeckBroachs の `$derived`）/ スコア内訳 / フレンド候補 TOP 5 / 上位候補 TOP 10 / `sendToScoreCalc()`（localStorage 書き込み + 遷移、既存実装を忠実に）。**見出し文字列（「🎴 最適編成」「🏅 上位候補 TOP 10」等、E2E が依存）・class 集合・表示数値を維持**。

- [ ] **Step 2: 親を乗せ換える**

`{#if lastResult}<SearchResults result={lastResult} selectedSong={selectedSong} {allCards} {allBroachs} {currentTierMap} {base} />{/if}` に置換し、旧テンプレートと `bestContext` / `sendToScoreCalc` / `getCardById` 等の結果表示専用コードを親から削除（探索フォーム・進捗・イベントパネルは親に残す）。

- [ ] **Step 3: 共通検証** + E2E max-score-finder 必須 + dev サーバーで結果表示（最適編成・詳細・フレンド・TOP10・スコア計算へ送るボタン）を目視確認、`tmp/phase3-search-results.png` 保存。

- [ ] **Step 4: コミット**

```bash
git add src/components/score/SearchResults.svelte src/components/MaxScoreFinder.svelte
git commit -m "refactor(max-score-finder): 探索結果表示を SearchResults に抽出"
```

---

### Task 3: engine.ts の分割（スペック 3.3）

**Branch:** `refactor/phase3-engine-split`

**Files:**
- Create: `src/lib/score/teamBuilder.ts`
- Create: `src/lib/score/simulation.ts`
- Modify: `src/lib/score/engine.ts`（re-export 互換レイヤーに縮小）
- Modify: `CLAUDE.md`（スコア計算エンジンの表に 2 ファイルを追記）

- [ ] **Step 1: 機械的に分割する**

コードの**移動のみ**（1 文字も変更しない。import 文の調整のみ可）:

- `teamBuilder.ts`: `getCenterSkillRate` / `computeTeam`（公開）+ private `parseSkill` / `isUsableSkillLevel` / `resolveEffectiveSkillLevel`
- `simulation.ts`: `calcShrinkCoverage` / `calcMinScore` / `calcMaxScore` / `calcExpectedScore` / `calcCardSkillExpected` / `calcCardSkillMaxActivations` / `calcCardSkillMax` / `runSimulation`（公開）+ private `applyFinalBonus` / `getAppeal` / `calcNoteScore` / `shrinkHeadSeconds` / `shrinkDurationNotes` / `isShrinkTimer` / `calcNoteIndexAtTime` / `calcShrinkActivationCount` / `enqueueShrink` / `runOnce` + 内部型（ShrinkQueueItem 等）
- `engine.ts`（全文置換）:

```typescript
// 互換レイヤー: 分割後も既存 import パスを維持する
export { getCenterSkillRate, computeTeam } from './teamBuilder';
export {
  calcShrinkCoverage, calcMinScore, calcMaxScore, calcExpectedScore,
  calcCardSkillExpected, calcCardSkillMaxActivations, calcCardSkillMax,
  runSimulation,
} from './simulation';
export { flattenNotes } from './noteFlattener';
export { computeGroupSizes, computeShrinkExclusion, type ShrinkExclusion } from './shrinkExclusion';
```

※ 既存 engine.ts 末尾の re-export（flattenNotes 等）の正確な形（型 re-export 含む）を実物から確認して維持。private ヘルパーが両グループから使われていないこと（構造マップで確認済み: parseSkill 系は computeTeam のみ、getAppeal 系は simulation のみ）を分割時に再確認し、想定外の共有があれば置き場所を判断して報告。

- [ ] **Step 2: CLAUDE.md の表を更新**

「スコア計算エンジンの主要コンポーネント」表の `engine.ts` 行を実態に合わせて更新し、`teamBuilder.ts`（チーム属性値・センタースキル計算）と `simulation.ts`（理論値・期待値・MC シミュレーション）の行を追加。

- [ ] **Step 3: 共通検証** — オラクルテスト（spreadsheetDiff.test.ts）含む unit 全 PASS が核心。E2E も全件。

- [ ] **Step 4: コミット**

```bash
git add src/lib/score/teamBuilder.ts src/lib/score/simulation.ts src/lib/score/engine.ts CLAUDE.md
git commit -m "refactor(score): engine.ts を teamBuilder と simulation に分割 (re-export 互換)"
```

---

### Task 4: フェーズ最終検証とリリース（コントローラが実施）

- [ ] dev サーバー停止 → `npm run test:unit` && `npm run test`（本番ビルド + E2E）
- [ ] 成功基準: MaxScoreFinder.svelte の行数減（実測報告）、engine.ts が re-export レイヤーのみ、全テスト緑
- [ ] `git tag v1.12.37 && git push origin v1.12.37`
