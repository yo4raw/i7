# スコア計算画面に共通ブローチ スコア寄与 TOP10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スコア計算画面で楽曲を選択すると、共通ブローチ スコア寄与 TOP10 が折りたたみセクションに表示されるようにする。

**Architecture:** 楽曲詳細にインライン展開していたバーチャートを Svelte コンポーネント `BroachRankingChart.svelte` に切り出して共有する。`ScoreCalc.svelte` は `selectedSong` から `$derived` でランキングを算出してこのコンポーネントを描画。楽曲詳細（Astro）は同コンポーネントを `client:` 指定なしで静的描画して流用（ゼロ JS のまま）。計算は既存の `buildBroachRanking` を再利用。

**Tech Stack:** Svelte 5（runes）/ Astro 6 / Tailwind CSS v4 / Playwright（E2E）

---

## File Structure

- `src/components/score/BroachRankingChart.svelte`（新規）— バーチャート描画の単一責務。props `{ ranking: BroachRankingEntry[] }`。
- `src/pages/songs/[id].astro`（修正）— インラインの `<ol>` を `<BroachRankingChart>` に置換、未使用になる定数を削除。
- `src/components/ScoreCalc.svelte`（修正）— `$derived` ランキング + 折りたたみセクション追加。
- `tests/score-calc.test.ts`（修正）— 楽曲選択でランキング表示の E2E 追加。
- `docs/adr/0010-song-broach-score-ranking.md`（修正）— 追記。

再利用（変更しない）: `buildBroachRanking` / `BroachRankingEntry`（`src/lib/score/songBroachRanking.ts`）。

---

## Task 1: `BroachRankingChart.svelte` を抽出し、楽曲詳細を置換する

**Files:**
- Create: `src/components/score/BroachRankingChart.svelte`
- Modify: `src/pages/songs/[id].astro`

### 現状の楽曲詳細インラインマークアップ（置換対象、`src/pages/songs/[id].astro` 178-199 行）
```astro
  <!-- 共通ブローチ スコア寄与 TOP10 -->
  {broachRanking.length > 0 && (
    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
      <h2 class="text-lg font-semibold mb-1">共通ブローチ スコア寄与 TOP10</h2>
      <p class="text-xs text-gray-500 dark:text-slate-400 mb-4">この楽曲のノーツ分布における各共通ブローチ単独のスコア寄与（デッキ非依存の目安）。</p>
      <ol class="space-y-2">
        {broachRanking.map((entry, i) => (
          ... 各行 ...
        ))}
      </ol>
    </section>
  )}
```
frontmatter（66-74 行付近）に `broachRanking` / `broachMaxScore` / `BROACH_BAR_BG` が定義されている。

- [ ] **Step 1: `BroachRankingChart.svelte` を作成**

`src/components/score/BroachRankingChart.svelte`:

```svelte
<script lang="ts">
  import type { BroachRankingEntry } from '../../lib/score/songBroachRanking';

  let { ranking }: { ranking: BroachRankingEntry[] } = $props();

  const maxScore = $derived(ranking.length > 0 ? ranking[0].score : 0);

  const BAR_BG: Record<string, string> = {
    Shout: 'bg-red-500',
    Beat: 'bg-green-500',
    Melody: 'bg-blue-500',
    All: 'bg-indigo-500',
  };
</script>

{#if ranking.length > 0}
  <ol class="space-y-2">
    {#each ranking as entry, i (entry.id)}
      <li class="flex items-center gap-2 text-sm">
        <span class="w-5 text-right tabular-nums text-gray-400 dark:text-slate-500 flex-shrink-0">{i + 1}</span>
        <span class="w-32 sm:w-40 truncate flex-shrink-0" title={entry.name}>{entry.name}</span>
        <div class="flex-1 bg-gray-100 dark:bg-slate-700 rounded h-4 overflow-hidden">
          <div
            class={`h-full rounded ${BAR_BG[entry.attribute] || 'bg-indigo-500'}`}
            style={`width: ${maxScore > 0 ? (entry.score / maxScore) * 100 : 0}%`}
          ></div>
        </div>
        <span class="w-16 text-right tabular-nums font-medium flex-shrink-0">{entry.score.toLocaleString()}</span>
      </li>
    {/each}
  </ol>
{/if}
```

- [ ] **Step 2: 楽曲詳細ページの import を追加**

`src/pages/songs/[id].astro` の frontmatter import 群に追加:
```astro
import BroachRankingChart from '../../components/score/BroachRankingChart.svelte';
```

- [ ] **Step 3: 楽曲詳細ページの `<ol>` を置換**

178-199 行のセクションを次に置換する（外枠 `<section>`・見出し・キャプション・`broachRanking.length > 0` ガードは残し、`<ol>...</ol>` だけをコンポーネント呼び出しに替える）:
```astro
  <!-- 共通ブローチ スコア寄与 TOP10 -->
  {broachRanking.length > 0 && (
    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
      <h2 class="text-lg font-semibold mb-1">共通ブローチ スコア寄与 TOP10</h2>
      <p class="text-xs text-gray-500 dark:text-slate-400 mb-4">この楽曲のノーツ分布における各共通ブローチ単独のスコア寄与（デッキ非依存の目安）。</p>
      <BroachRankingChart ranking={broachRanking} />
    </section>
  )}
```
`client:` 指定は付けない（ビルド時に静的 HTML へ描画される）。

- [ ] **Step 4: 未使用になった定数を削除**

frontmatter から、置換後に未使用となる `broachMaxScore` と `BROACH_BAR_BG` の定義を削除する（`broachRanking` の定義は残す）。現状:
```astro
const broachRanking = buildBroachRanking(song);
const broachMaxScore = broachRanking.length > 0 ? broachRanking[0].score : 0;
const BROACH_BAR_BG: Record<string, string> = {
  Shout: 'bg-red-500',
  Beat: 'bg-green-500',
  Melody: 'bg-blue-500',
  All: 'bg-indigo-500',
};
```
を次にする:
```astro
const broachRanking = buildBroachRanking(song);
```

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 0 errors（未使用変数の警告も出ないこと）。

- [ ] **Step 6: コミット**

```bash
git add src/components/score/BroachRankingChart.svelte "src/pages/songs/[id].astro"
git commit -m "refactor: ブローチランキング棒グラフを BroachRankingChart に抽出

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `ScoreCalc.svelte` に折りたたみランキングセクションを追加

**Files:**
- Modify: `src/components/ScoreCalc.svelte`

`ScoreCalc.svelte` は Svelte 5 runes。`selectedSong` は `$state<Song | null>`。楽曲サマリーバー `<section>`（楽曲 select + song-info + ドーナツ）の直後、「スキルオプション」`<details>` の直前に新しい折りたたみセクションを挿入する。

- [ ] **Step 1: import を追加**

`<script>` の import 群に追加:
```svelte
import { buildBroachRanking } from '../lib/score/songBroachRanking';
import BroachRankingChart from './score/BroachRankingChart.svelte';
```

- [ ] **Step 2: `$derived` ランキングを追加**

`selectedSong` 宣言の近く（既存の `songAttrCounts` / `songChartSvg` の `$derived` 群の付近）に追加:
```svelte
const broachRanking = $derived(selectedSong ? buildBroachRanking(selectedSong) : []);
```

- [ ] **Step 3: 折りたたみセクションのマークアップを挿入**

楽曲サマリーバーの `</section>`（song-info-chart を含む `<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">` の閉じ）の直後、`<!-- スキルオプション` コメントの直前に挿入する:

```svelte
  <!-- 共通ブローチ スコア寄与 TOP10 -->
  {#if selectedSong && broachRanking.length > 0}
    <details id="broach-ranking-section" class="bg-white dark:bg-slate-800 rounded-lg shadow mb-4 group" open>
      <summary class="p-4 cursor-pointer font-bold text-sm text-gray-700 dark:text-slate-200 flex items-center justify-between select-none">
        <span>🏅 共通ブローチ スコア寄与 TOP10</span>
        <svg class="w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div class="px-4 pb-4 border-t border-gray-100 dark:border-slate-800 pt-3">
        <p class="text-[11px] text-gray-500 dark:text-slate-400 mb-3">この楽曲のノーツ分布における各共通ブローチ単独のスコア寄与（デッキ非依存の目安）。</p>
        <BroachRankingChart ranking={broachRanking} />
      </div>
    </details>
  {/if}
```

実ファイルの楽曲サマリーバー `</section>` の位置を確認してから挿入すること。構造が想定と大きく異なる場合は STOP して NEEDS_CONTEXT を報告。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 0 errors。

- [ ] **Step 5: コミット**

```bash
git add src/components/ScoreCalc.svelte
git commit -m "feat: スコア計算画面に共通ブローチ スコア寄与 TOP10 を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: E2E テストを追加

**Files:**
- Modify: `tests/score-calc.test.ts`

既存テストは `beforeEach` で `/score-calc/` を開き、`#song-select` の option が読み込まれるのを待つ。`BASE=''`、dev サーバー再利用で実行可能。

- [ ] **Step 1: テストを追加**

`tests/score-calc.test.ts` の `test.describe('スコア計算ページ', ...)` ブロック内（既存 test の後）に追加:

```typescript
  test('楽曲を選択すると共通ブローチ スコア寄与 TOP10 が表示される', async ({ page }) => {
    const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
    await page.locator('#song-select').selectOption(firstValue!);

    const section = page.locator('#broach-ranking-section');
    await expect(section).toBeVisible();
    await expect(section).toContainText('共通ブローチ スコア寄与 TOP10');
    // ランキング行が 1 件以上ある
    const items = section.locator('ol li');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);
    // 1 位の行にスコア値（数字）が出る
    await expect(items.first()).toContainText(/[\d,]+/);
  });
```

- [ ] **Step 2: テスト実行（dev サーバー再利用）**

別ターミナルで `npm run dev` 起動済みの前提で:

Run: `npx playwright test tests/score-calc.test.ts -g "共通ブローチ"`
Expected: PASS。タイミングで落ちる場合は `await expect(section).toBeVisible()` が GViz 楽曲ロード後の選択に依存するため、`beforeEach` の option 待ちが効いていることを確認（既存パターン）。アサーションは弱めないこと。

- [ ] **Step 3: 既存 score-calc テストも通ることを確認**

Run: `npx playwright test tests/score-calc.test.ts`
Expected: 全 PASS。

- [ ] **Step 4: コミット**

```bash
git add tests/score-calc.test.ts
git commit -m "test: スコア計算画面のブローチランキング表示を検証

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: ADR 0010 を追記

**Files:**
- Modify: `docs/adr/0010-song-broach-score-ranking.md`

- [ ] **Step 1: 「影響」セクションに追記**

`docs/adr/0010-song-broach-score-ranking.md` の「## 影響」セクションに次の項目を追加する（既存の決定の延長のため新規 ADR は立てない）:

```markdown
- スコア計算画面（`ScoreCalc.svelte`）でも楽曲選択時に同ランキングを折りたたみセクションで表示する（2026-06-14 追記）。
- バーチャートは `src/components/score/BroachRankingChart.svelte` に共有コンポーネント化し、楽曲詳細（Astro）は `client:` 指定なしの静的描画で流用、スコア計算（Svelte）は `selectedSong` から `$derived` でリアクティブ描画する。
```

- [ ] **Step 2: コミット**

```bash
git add docs/adr/0010-song-broach-score-ranking.md
git commit -m "docs: ADR 0010 にスコア計算画面での表示・共有コンポーネント化を追記

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: 目視確認・PR 作成（リリースは制御側で実施）

- [ ] **Step 1: 制御側が dev サーバーで目視確認**
  - `/score-calc/` で楽曲を選択 → 折りたたみセクションにランキングが表示され、別の楽曲に切り替えると再計算されることをスクショで確認。
  - `/songs/1/` で抽出後もランキング表示が不変であることを確認。
  - スクショは `tmp/` に保存。

- [ ] **Step 2: push して PR 作成**

```bash
git push -u origin feature/score-calc-broach-ranking
gh pr create --title "feat: スコア計算画面に共通ブローチ スコア寄与 TOP10 を追加" --body "$(cat <<'EOF'
## 概要
ADR 0010 のブローチランキングを、スコア計算画面でも楽曲選択時に折りたたみセクションで表示する。

## 変更点
- `src/components/score/BroachRankingChart.svelte`（新規）: バーチャートを共有コンポーネント化
- `songs/[id].astro`: インラインマークアップを共有コンポーネントに置換（静的描画のまま、表示不変）
- `ScoreCalc.svelte`: `selectedSong` から `$derived` でランキング算出 + 折りたたみセクション（デフォルト開）
- `tests/score-calc.test.ts`: 楽曲選択でランキング表示の E2E 追加
- ADR 0010 追記（新規 ADR なし）

## 確認
- `npm run typecheck`: 0 errors
- Playwright（score-calc）: 該当 E2E 含め PASS
- dev サーバー目視確認済み（楽曲切替で再計算 / 楽曲詳細の表示不変）
- 計算ロジックは既存 `buildBroachRanking`（単体テスト済み）を再利用

## 設計
- spec: `docs/superpowers/specs/2026-06-14-score-calc-broach-ranking-design.md`
- plan: `docs/superpowers/plans/2026-06-14-score-calc-broach-ranking.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage**: 共有コンポーネント化=Task 1、楽曲詳細置換=Task 1、ScoreCalc 統合=Task 2、E2E=Task 3、ADR 追記=Task 4、PR/リリース=Task 5。全項目に対応あり。
- **型整合**: `BroachRankingChart` の props は `{ ranking: BroachRankingEntry[] }`。楽曲詳細は `ranking={broachRanking}`（`BroachRankingEntry[]`）、ScoreCalc は `ranking={broachRanking}`（`$derived` で `BroachRankingEntry[]` か `[]`）。型一致。
- **回帰防止**: 楽曲詳細は外枠・ガードを残し `<ol>` のみ差し替え。未使用化する `broachMaxScore`/`BROACH_BAR_BG` は Step 4 で削除（typecheck で検出）。
- **0除算**: コンポーネント内 `maxScore > 0` ガード + 空配列時 `{#if}` 非描画。
- **プレースホルダ**: なし。
