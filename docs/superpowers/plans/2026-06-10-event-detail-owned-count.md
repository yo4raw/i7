# イベント詳細ページ 特効所持枚数編集 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント詳細ページ（`/events/[id]/`）の特効衣装（金/銀/銅）に所持枚数ステッパーと「対象 N 枚・所持 M 枚」サマリーを追加し、`i7_card_counts`（localStorage）と双方向に同期させる。

**Architecture:** 特効 tier ごとに 1 つの Svelte アイランド `EventBonusCardGrid.svelte`（`client:load`、ページに 3 つ）を配置する。コンポーネントは tier セクションの中身全体（バッジ見出し行・効果サマリー・衣装タイルグリッド）を描画し、既存の `cardCounts.svelte.ts` ストアと `CountInput.svelte` を流用する。Astro 側は `<section>` ラッパーと slim な props の組み立てのみ。

**Tech Stack:** Astro 6（静的生成）/ Svelte 5 runes / Tailwind CSS v4 / Playwright E2E

**スペック:** `docs/superpowers/specs/2026-06-10-event-detail-owned-count-design.md`

**スペックからの設計上の微修正:** スペックでは「バッジは Astro 側に残す」としていたが、「対象 N 枚・所持 M 枚」はバッジと同じ flex 行の右端に表示されており、アイランドは単一の DOM サブツリーしか持てないため、現行レイアウトを維持するにはバッジ見出し行ごとコンポーネントに移す必要がある。よって tier セクションの中身全体（バッジ・効果サマリー・銅特効の対象メンバー表記・グリッド）をコンポーネントが描画する。`<section>` ラッパー（枠・左ボーダー色）は Astro に残す。

**テスト方針の注記:** UI コンポーネントのため厳密なテストファースト（E2E 先行）は採らない。E2E 実行には `npm run preview`（本番ビルド約 10 分）が必要なため、実装 → dev サーバーで動作確認 → E2E 追加・実行の順とする。新規ロジックはサマリー集計（reduce 1 行）のみで、ストア・ステッパーは既存実装の流用。

**リリースノート:** `/releases/` ページは git タグ・コミット履歴から自動生成されるため手動更新は不要。コミットメッセージを conventional commit 形式で書くこと。

---

### Task 0: 作業ブランチ作成

- [ ] **Step 1: ブランチを作成**

```bash
cd /Users/yo4raw/git/i7
git checkout -b feat/event-bonus-owned-count
```

---

### Task 1: `EventBonusCardGrid.svelte` コンポーネント作成

**Files:**
- Create: `src/components/EventBonusCardGrid.svelte`

**依存する既存コード（変更しない）:**
- `src/lib/stores/cardCounts.svelte.ts` — `getCount(cardId)` は所持数を返す Svelte 5 runes ストア。`$derived` 内で呼ぶとリアクティブに追跡される
- `src/components/cards/CountInput.svelte` — `cardId: number` を受け取る `+ / − / 数値入力` ステッパー。ストアへの書き込みと `stopPropagation` は実装済み
- `src/lib/ui.ts` の `cardThumbUrl(id)` — サムネイル URL 生成
- `src/lib/constants.ts` の `ATTR_BADGE_BG` / `RARITY_BADGE_CLASSES` — バッジ色クラス

- [ ] **Step 1: コンポーネントを作成**

`src/components/EventBonusCardGrid.svelte` を以下の内容で新規作成:

```svelte
<script lang="ts">
  import { ATTR_BADGE_BG, RARITY_BADGE_CLASSES } from '../lib/constants';
  import { getCount } from '../lib/stores/cardCounts.svelte';
  import { cardThumbUrl } from '../lib/ui';
  import CountInput from './cards/CountInput.svelte';

  interface EventBonusCardItem {
    ID: number;
    cardname: string;
    name: string;
    attribute: string;
    rarity: string;
  }

  type Props = {
    label: string;
    badgeClass: string;
    effectSummary?: string;
    targetNote?: string;
    cards: EventBonusCardItem[];
    base: string;
  };

  let { label, badgeClass, effectSummary = '', targetNote = '', cards, base }: Props = $props();

  // 所持枚数合計（同一衣装の重複所持を含む）。getCount がストアを読むため $derived で即時連動する
  const owned = $derived(cards.reduce((sum, c) => sum + getCount(c.ID), 0));
</script>

<div class="flex items-center justify-between gap-2 flex-wrap mb-3">
  <span class={`inline-block px-3 py-1 rounded text-sm font-bold border ${badgeClass}`}>{label}</span>
  <span class="text-xs text-gray-500 dark:text-slate-400">対象 {cards.length} 枚 ・ 所持 {owned} 枚</span>
</div>

{#if effectSummary}
  <p class="text-sm text-gray-700 dark:text-slate-200 mb-2">{effectSummary}</p>
{/if}
{#if targetNote}
  <p class="text-xs text-gray-500 dark:text-slate-400 mb-3">対象: {targetNote}</p>
{/if}

{#if cards.length === 0}
  <p class="text-sm text-gray-400 dark:text-slate-500">対象衣装なし</p>
{:else}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
    {#each cards as card (card.ID)}
      <div class="flex flex-col p-2 rounded border border-gray-200 dark:border-slate-700">
        <a
          href={`${base}cards/${card.ID}/`}
          class="flex items-center gap-2 rounded hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors"
        >
          <img
            src={cardThumbUrl(card.ID)}
            alt={card.cardname}
            class="w-12 h-auto rounded flex-shrink-0"
            loading="lazy"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1 mb-0.5">
              <span class={`px-1 py-0.5 text-[9px] font-bold text-white rounded ${RARITY_BADGE_CLASSES[card.rarity] || 'bg-gray-300'}`}>{card.rarity || '?'}</span>
              {#if card.attribute}
                <span class={`px-1 py-0.5 text-[9px] font-bold text-white rounded ${ATTR_BADGE_BG[card.attribute] || 'bg-gray-400'}`}>{card.attribute}</span>
              {/if}
            </div>
            <div class="text-xs font-medium truncate text-gray-800 dark:text-slate-100">{card.cardname || '-'}</div>
            <div class="text-[11px] text-gray-500 dark:text-slate-400 truncate">{card.name}</div>
          </div>
        </a>
        <div class="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <span class="text-[10px] text-gray-500 dark:text-slate-400">所持</span>
          <CountInput cardId={card.ID} />
        </div>
      </div>
    {/each}
  </div>
{/if}
```

設計上のポイント:
- タイルは旧実装の `<a>` 全体ラップをやめ、画像 + テキスト部分のみリンクにし、その下にリンク外の「所持」行を置く（`CardTileCard.svelte` と同じ分離パターン）。これによりステッパー操作でリンク遷移しない
- `badgeClass` 等の Tailwind クラス文字列は呼び出し元 `[id].astro` のリテラルとして存在するため、Tailwind のクラス検出に問題なし
- ダークバリアントは全クラスでペア指定済み

- [ ] **Step 2: コミット**

```bash
git add src/components/EventBonusCardGrid.svelte
git commit -m "feat(events): 特効衣装グリッドの Svelte コンポーネントを追加"
```

---

### Task 2: `events/[id].astro` をコンポーネント呼び出しに置換

**Files:**
- Modify: `src/pages/events/[id].astro`

- [ ] **Step 1: import を更新**

frontmatter の import 群を変更する。`ATTR_BADGE_BG` / `RARITY_BADGE_CLASSES` はテンプレートから使われなくなるため削除（`cardThumbUrl` は OG 画像生成で使用中のため残す）:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import EventStatusBadge from '../../components/EventStatusBadge.svelte';
import EventBonusCardGrid from '../../components/EventBonusCardGrid.svelte';
import { fetchEventsCsv, formatEffectSummary, type EventRow, type EventSpecialTier } from '../../lib/data/fetchEventsCsv';
import { fetchCardsJson, type Card } from '../../lib/data/fetchCardsJson';
import { cardThumbUrl } from '../../lib/ui';
```

`getStaticPaths()` / OG メタ / JSON-LD / `tiers` 配列の定義（`TierView` interface 含む）は変更しない。

- [ ] **Step 2: tier セクションのテンプレートを置換**

現在の `{tiers.map(t => (...))}` ブロック（`<section>` の中身: バッジ見出し行・効果サマリー・銅特効対象表記・タイルグリッド全部）を以下に置き換える。`bg-white` のダークバリアント欠落もここで修正する:

```astro
{tiers.map(t => (
  <section class={`mb-6 rounded-lg bg-white dark:bg-slate-800 shadow p-4 ${t.borderClass}`}>
    <EventBonusCardGrid
      label={t.label}
      badgeClass={t.badgeClass}
      effectSummary={formatEffectSummary(t.tier)}
      targetNote={t.key === 'bronze' ? event.special3_member : ''}
      cards={t.cards.map(c => ({
        ID: c.ID!,
        cardname: c.cardname || '',
        name: c.name || '',
        attribute: c.attribute || '',
        rarity: c.rarity || '',
      }))}
      base={base}
      client:load
    />
  </section>
))}
```

ポイント:
- props にはフルの `Card` ではなく slim なオブジェクト（5 フィールド）だけを渡し、HTML に直列化されるデータ量を抑える
- `c.ID!` は `getStaticPaths()` の `pick()` が `ID != null` の衣装のみ通すため安全

- [ ] **Step 3: dev サーバーで描画されることを確認**

```bash
npm run dev   # run_in_background: true で起動
# ログに "ready in" が出るまで待つ（数秒）
curl -s http://localhost:4321/events/1/ | grep -c "所持"
```

Expected: 1 以上（SSR された HTML に「所持」が含まれる）。`grep` が 0 件で exit 1 になる場合は統合ミス。
（イベント ID 1 が存在しない場合は `public/events/events.csv` の 2 行目の ID 列を使う）

- [ ] **Step 4: コミット**

```bash
git add src/pages/events/[id].astro
git commit -m "feat(events): イベント詳細の特効衣装に所持枚数ステッパーとサマリーを追加"
```

---

### Task 3: dev サーバーでのブラウザ動作確認（スクリーンショット提示）

**Files:** なし（検証のみ。スクリーンショットは `tmp/` に保存）

- [ ] **Step 1: dev サーバーを起動（Task 2 で起動済みならそのまま）**

```bash
npm run dev   # run_in_background: true
```

- [ ] **Step 2: Playwright MCP（または chrome-devtools MCP）でイベント詳細ページを開く**

`http://localhost:4321/events/{id}/`（開催中 or 直近イベントの ID を `public/events/events.csv` から選ぶ）に navigate し、以下を確認:

1. 金/銀/銅の各セクションに「対象 N 枚 ・ 所持 M 枚」が表示される（初期 M=0）
2. 各タイルに「所持 [−][0][+]」ステッパーが表示される
3. `+` を 2 回クリック → 入力値が 2 になり、セクションの「所持 2 枚」が即時更新される
4. ステッパー操作でページ遷移しない（URL が変わらない）
5. タイルの画像/名前クリックでは衣装詳細へ遷移する
6. `localStorage.getItem('i7_card_counts')` に値が入る（browser_evaluate で確認）
7. ダークモード切替（フッターの月アイコン）で背景・ボーダーが破綻しない

- [ ] **Step 3: スクリーンショットを保存しユーザーに提示**

ライト/ダーク各 1 枚を `tmp/event-detail-count-light.png` / `tmp/event-detail-count-dark.png` に保存し、ユーザーに提示して確認を取る。

- [ ] **Step 4: 検証用の localStorage を掃除し dev サーバーを停止**

browser_evaluate で `localStorage.removeItem('i7_card_counts')` を実行（自分のテスト入力を消す）。その後 dev サーバーのタスクを TaskStop で停止する。

---

### Task 4: Playwright E2E テスト追加

**Files:**
- Test: `tests/event-detail.test.ts`

**注記:** 既存テストのうち `mycard.test.ts` 等は旧ベースパス前提で `playwright.config.ts` の `testIgnore` に入っている。現行の書き方は `score-calc-spec.test.ts`（`const BASE = ''`）に倣う。テスト対象イベントは `fetchEventsCsv()`（純 Node 実装、`process.cwd()` 基準で CSV を読む）で動的に選ぶ。

- [ ] **Step 1: テストを作成**

`tests/event-detail.test.ts` を以下の内容で新規作成:

```ts
import { test, expect } from '@playwright/test';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';

const BASE = '';

let eventId = 0;

test.beforeAll(async () => {
  const events = await fetchEventsCsv();
  const target = events.find((ev) => ev.gold.cardIds.length > 0);
  if (!target) throw new Error('金特効衣装を持つイベントが events.csv にありません');
  eventId = target.id;
});

test.describe('イベント詳細 特効所持枚数', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/events/${eventId}/`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
  });

  test('金特効セクションに所持サマリーとステッパーが表示される', async ({ page }) => {
    const gold = page.locator('section', { hasText: '金特効' }).first();
    await expect(gold.getByText(/対象 \d+ 枚 ・ 所持 0 枚/)).toBeVisible();
    await expect(gold.getByRole('button', { name: '所持数を1増やす' }).first()).toBeVisible();
  });

  test('ステッパーで増やすとサマリーと localStorage に反映され、ページ遷移しない', async ({ page }) => {
    const gold = page.locator('section', { hasText: '金特効' }).first();
    const plus = gold.getByRole('button', { name: '所持数を1増やす' }).first();

    await plus.click();
    await plus.click();

    await expect(gold.locator('input[type="number"]').first()).toHaveValue('2');
    await expect(gold.getByText(/所持 2 枚/)).toBeVisible();
    expect(page.url()).toContain(`/events/${eventId}/`);

    const counts = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('i7_card_counts') || '{}')
    );
    expect(Object.values(counts)).toContain(2);
  });

  test('減らすと 0 で localStorage からキーが消える', async ({ page }) => {
    const gold = page.locator('section', { hasText: '金特効' }).first();
    const plus = gold.getByRole('button', { name: '所持数を1増やす' }).first();
    const minus = gold.getByRole('button', { name: '所持数を1減らす' }).first();

    await plus.click();
    await minus.click();

    await expect(gold.locator('input[type="number"]').first()).toHaveValue('0');
    await expect(gold.getByText(/所持 0 枚/)).toBeVisible();

    const counts = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('i7_card_counts') || '{}')
    );
    expect(Object.keys(counts)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: E2E テストを実行**

preview ビルドが走るため約 10 分かかる（`playwright.config.ts` の webServer timeout は 15 分確保済み）。Bash timeout は 600000 ms を指定し、`run_in_background: true` で起動して待つ:

```bash
npx playwright test tests/event-detail.test.ts
```

Expected: `3 passed`

注意: 選ばれたイベントの金特効衣装がカードマスター（Google Sheets）に未登録だとタイルが 0 件になりテストが失敗しうる。その場合は `beforeAll` の `find` 条件を別イベント（より古い ID）にフォールバックするよう調整する。

- [ ] **Step 3: 単体テストのリグレッション確認**

```bash
npm run test:unit
```

Expected: 既存テスト全 PASS（今回の変更はスコアエンジンに触れないため）

- [ ] **Step 4: コミット**

```bash
git add tests/event-detail.test.ts
git commit -m "test(events): イベント詳細の所持枚数編集の E2E テストを追加"
```

---

### Task 5: PR 作成〜リリース

- [ ] **Step 1: push して PR を作成**

```bash
git push -u origin feat/event-bonus-owned-count
gh pr create --title "feat(events): イベント詳細の特効衣装に所持枚数編集を追加" --body "$(cat <<'EOF'
## 概要
イベント詳細ページの特効衣装（金/銀/銅）に所持枚数ステッパーと「対象 N 枚・所持 M 枚」サマリーを追加。所持衣装ページと同じ `i7_card_counts` (localStorage) に同期する。

## 変更内容
- `EventBonusCardGrid.svelte` 新規追加（tier ごとに 1 アイランド、既存 `cardCounts` ストア + `CountInput` を流用）
- `events/[id].astro` のタイルグリッドをコンポーネント呼び出しに置換、セクションのダークバリアント欠落を修正
- E2E テスト `tests/event-detail.test.ts` 追加

## スペック
docs/superpowers/specs/2026-06-10-event-detail-owned-count-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: マージ後にリリースタグを push**

PR マージ後（CLAUDE.md の Workflow に従い CI 完了は待たなくてよい）:

```bash
git checkout main && git pull
git tag v<次のパッチバージョン>   # 既存タグは git tag --sort=-creatordate | head で確認
git push origin v<次のパッチバージョン>
```

`deploy.yml` が Cloudflare Workers へ自動デプロイし、`release.yml` が GitHub Release を作成する。
