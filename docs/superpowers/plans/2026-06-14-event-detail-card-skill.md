# イベント詳細ページの衣装スキル表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント詳細ページの特効衣装グリッドに各衣装のスコアスキルを表示し、判定縮小スキル持ちをピンクのバッジとカード枠で強調する。

**Architecture:** ビルド時に取得済みの `Card` から `ap_skill_type` / `ap_skill_req` を `EventBonusCardGrid` へ props で渡し、既存の `formatSkillBadge`（`src/lib/score/skillFormatter.ts`）でラベルと `isShrink` 判定を取得して表示する。新規データフェッチや新規整形ロジックは追加しない。SNS 共有パネル（`EventSharePanel.astro`）と同一配色で一貫させる。

**Tech Stack:** Astro 6（`.astro` ページ）/ Svelte 5（`.svelte` コンポーネント、runes `$props`/`$derived`）/ Tailwind CSS v4 / Playwright（E2E）

---

## File Structure

- `src/pages/events/[id].astro`（修正）— `getStaticPaths` の card props マッピングに `apSkillType` / `apSkillReq` を追加する責務。
- `src/components/EventBonusCardGrid.svelte`（修正）— カードセルにスキルバッジ行と縮小強調枠を追加する責務。`formatSkillBadge` を import する。
- `tests/event-detail.test.ts`（修正）— スキルバッジ表示と縮小強調のアサーションを追加する責務。
- `docs/adr/0008-event-detail-card-skill.md`（新規）+ `docs/adr/README.md`（修正）— 意思決定記録。

参考（変更しない、再利用するだけ）:
- `src/lib/score/skillFormatter.ts` の `formatSkillBadge(skillType): { label, isShrink }`
- `src/components/EventSharePanel.astro` の配色（縮小 `bg-pink-500 text-white`、非縮小 `bg-gray-50 dark:bg-slate-700`）

---

## Task 1: `EventBonusCardGrid` にスキル props を受け取らせ、バッジと縮小強調を表示する

**Files:**
- Modify: `src/components/EventBonusCardGrid.svelte`

このコンポーネントは Svelte 5 runes（`$props` / `$derived`）を使う。現状の `EventBonusCardItem` 型は `ID / cardname / name / attribute / rarity` を持つ。ここに 2 フィールドを足し、各セルにスキル行を追加する。

- [ ] **Step 1: `formatSkillBadge` を import する**

ファイル冒頭の import 群（既存の `import CountInput from './cards/CountInput.svelte';` の付近）に追加する:

```svelte
import { formatSkillBadge } from '../lib/score/skillFormatter';
```

- [ ] **Step 2: `EventBonusCardItem` 型にスキルフィールドを追加する**

既存の型定義:

```svelte
  interface EventBonusCardItem {
    ID: number;
    cardname: string;
    name: string;
    attribute: string;
    rarity: string;
  }
```

を次に置き換える:

```svelte
  interface EventBonusCardItem {
    ID: number;
    cardname: string;
    name: string;
    attribute: string;
    rarity: string;
    apSkillType: string | null;
    apSkillReq: string | null;
  }
```

- [ ] **Step 3: カードセルにスキル行を追加し、縮小持ちのセル枠を強調する**

現状の各カードセルは次の構造（`{#each cards as card (card.ID)}` 内）:

```svelte
      <div class="flex flex-col p-2 rounded border border-gray-200 dark:border-slate-700">
        <a
          href={`${base}cards/${card.ID}/`}
          class="flex items-center gap-2 rounded hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors"
        >
          ...（サムネ・バッジ・名前。変更しない）...
        </a>
        <div class="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <span class="text-[10px] text-gray-500 dark:text-slate-400">所持</span>
          <CountInput cardId={card.ID} />
        </div>
      </div>
```

これを次のように変更する。`{#each}` ブロックの直下で `formatSkillBadge` を呼び、外側 `<div>` の class を `isShrink` で出し分け、所持行の直前にスキル行を挿入する:

```svelte
    {#each cards as card (card.ID)}
      {@const skill = formatSkillBadge(card.apSkillType)}
      <div
        class={`flex flex-col p-2 rounded border ${
          skill.isShrink
            ? 'border-pink-400 ring-1 ring-pink-300 dark:border-pink-500 dark:ring-pink-500'
            : 'border-gray-200 dark:border-slate-700'
        }`}
      >
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
        <div class="mt-1.5 flex items-center gap-1 flex-wrap">
          <span
            class={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
              skill.isShrink
                ? 'bg-pink-500 text-white'
                : 'bg-gray-50 text-gray-800 dark:bg-slate-700 dark:text-slate-100'
            }`}
            data-testid="skill-badge"
          >{skill.label}</span>
          {#if card.apSkillReq}
            <span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">{card.apSkillReq}</span>
          {/if}
        </div>
        <div class="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <span class="text-[10px] text-gray-500 dark:text-slate-400">所持</span>
          <CountInput cardId={card.ID} />
        </div>
      </div>
    {/each}
```

注: 既存セルの `<a>` 〜サムネ・名前部分は変更不要だが、外側 `<div>` の class を出し分けに変えるため、上記の通りブロック全体を置き換えるのが安全。

- [ ] **Step 4: コミット**

```bash
git add src/components/EventBonusCardGrid.svelte
git commit -m "feat: イベント特効グリッドに衣装スキルバッジと縮小強調を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `events/[id].astro` からスキルフィールドを props に渡す

**Files:**
- Modify: `src/pages/events/[id].astro`

`getStaticPaths` で生成した `Card`（`pick()` の結果）には `ap_skill_type` / `ap_skill_req` が含まれる。`EventBonusCardGrid` の `cards` prop マッピング（現状 144-149 行付近）にこの 2 フィールドを追加する。

- [ ] **Step 1: card マッピングにスキルフィールドを追加する**

現状（`<EventBonusCardGrid ... />` 内）:

```astro
        cards={t.cards.map(c => ({
          ID: c.ID!,
          cardname: c.cardname || '',
          name: c.name || '',
          attribute: c.attribute || '',
          rarity: c.rarity || '',
        }))}
```

を次に置き換える:

```astro
        cards={t.cards.map(c => ({
          ID: c.ID!,
          cardname: c.cardname || '',
          name: c.name || '',
          attribute: c.attribute || '',
          rarity: c.rarity || '',
          apSkillType: c.ap_skill_type ?? null,
          apSkillReq: c.ap_skill_req ?? null,
        }))}
```

- [ ] **Step 2: dev サーバーで表示確認する**

CLAUDE.md の検証フローに従い HMR で確認する。

```bash
npm run dev
```

`astro v6.x.x ready in XXX ms` が出たら、Playwright/chrome-devtools MCP で `http://localhost:4321/events/<金特効ありイベントID>/` を開き、特効グリッドの各衣装にスキルバッジが出ていること・縮小持ちがピンク強調されていることをスクショで確認する。スクショは `tmp/` に保存する。確認後 dev サーバーを停止する。

- [ ] **Step 3: コミット**

```bash
git add src/pages/events/[id].astro
git commit -m "feat: イベント詳細から特効グリッドへスキルフィールドを渡す

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: E2E テストでスキルバッジと縮小強調を検証する

**Files:**
- Modify: `tests/event-detail.test.ts`

既存テストは `beforeAll` で金特効を持つイベント ID を解決し、`describe('イベント詳細 特効所持枚数')` に所持枚数のテストを置いている。同ファイルに新しい `describe` を追加してスキル表示を検証する。

ローカル実行は CLAUDE.md に従い、先に `npm run dev` を起動してから `npx playwright test tests/event-detail.test.ts`（dev サーバー再利用でビルドなし）で回す。

- [ ] **Step 1: スキル表示の失敗するテストを追加する**

ファイル末尾（最後の `});` の後）に追加する:

```typescript
test.describe('イベント詳細 特効スキル表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/events/${eventId}/`);
  });

  test('金特効セクションの各衣装にスキルバッジが表示される', async ({ page }) => {
    const gold = page.locator('section', { hasText: '金特効' }).first();
    const badges = gold.getByTestId('skill-badge');
    await expect(badges.first()).toBeVisible();
    expect(await badges.count()).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: テストを実行して通ることを確認する**

別ターミナルで `npm run dev` 起動済みの状態で:

Run: `npx playwright test tests/event-detail.test.ts -g "スキルバッジが表示される"`
Expected: PASS（Task 1・2 実装済みのため通る。バッジ `data-testid="skill-badge"` が金特効セクションに 1 つ以上ある）

- [ ] **Step 3: 縮小強調テストを追加する**

判定縮小持ちの特効衣装はイベントによって有無が変わるため、テストは「縮小バッジが存在する場合はピンク配色である」ことを条件付きで検証する（フレーク回避）。Step 1 で追加した `describe` 内に追加する:

```typescript
  test('判定縮小スキルのバッジはピンク強調される', async ({ page }) => {
    const shrink = page.getByTestId('skill-badge').filter({ hasText: '判定縮小' });
    const count = await shrink.count();
    test.skip(count === 0, 'このイベントに判定縮小持ちの特効衣装がいないためスキップ');
    await expect(shrink.first()).toHaveClass(/bg-pink-500/);
  });
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx playwright test tests/event-detail.test.ts`
Expected: PASS（縮小衣装ありなら検証、なしなら skip）。既存の所持枚数テストも引き続き PASS。

- [ ] **Step 5: コミット**

```bash
git add tests/event-detail.test.ts
git commit -m "test: イベント詳細の特効スキルバッジ表示を検証

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: ADR を追加する

**Files:**
- Create: `docs/adr/0008-event-detail-card-skill.md`
- Modify: `docs/adr/README.md`

`docs/adr/README.md` のフォーマットと既存 ADR（特に `0006-event-share-dense-layout.md`）に倣う。

- [ ] **Step 1: ADR 本文を作成する**

`docs/adr/0008-event-detail-card-skill.md` を作成する:

```markdown
# 0008. イベント詳細ページに特効衣装のスキルを表示する

- ステータス: 承認
- 日付: 2026-06-14

## 背景

イベント詳細ページの特効衣装グリッドはサムネ・属性・名前・所持数のみを表示し、各衣装のスコアスキルが分からなかった。編成上重要な判定縮小スキル持ちをこのページ単体で判別できなかった。

## 決定

特効衣装グリッドの各セルにスキル情報を表示する。

- スキル整形は既存の `formatSkillBadge`（`src/lib/score/skillFormatter.ts`）を再利用し、短縮ラベル + 発動条件（`ap_skill_req`）を表示する。
- 判定縮小スキル持ちは、SNS 共有パネルと同一配色のピンクバッジ（`bg-pink-500`）に加え、カードセルの枠を `ring-1 ring-pink-300` で強調し、グリッド内で一目で判別できるようにする。
- 新規データフェッチは行わず、ビルド時に取得済みの `Card` から props で渡す純粋な表示拡張とする。

## 検討した代替案

- **数値込みの効果全文（`formatSkillEffect`）を表示**: 情報量は多いが各セルが縦に伸びてグリッドの一覧性を損なうため不採用。粒度は短縮ラベル + 発動条件に留めた。
- **縮小をバッジ色だけで強調**: SNS 共有パネルと同等だが、一覧グリッドでは埋もれやすい。カード枠の ring 強調を加えて視認性を優先した。

## 影響

- 変更は `events/[id].astro` と `EventBonusCardGrid.svelte` の 2 ファイル。
- 配色・強調方針は `EventSharePanel.astro` と一貫させた。
```

- [ ] **Step 2: README.md の一覧表に行を追加する**

`docs/adr/README.md` の ADR 一覧表に、既存の最終行（0007）の下へ追加する:

```markdown
| [0008](0008-event-detail-card-skill.md) | イベント詳細ページに特効衣装のスキルを表示する | 承認 |
```

（表のカラム構成は README.md の既存行に合わせること。番号・タイトル・ステータスの順でない場合は既存行の並びに従う。）

- [ ] **Step 3: コミット**

```bash
git add docs/adr/0008-event-detail-card-skill.md docs/adr/README.md
git commit -m "docs: ADR 0008 イベント詳細の特効スキル表示を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: リリースノート更新と仕上げ

**Files:**
- Modify: リリースノート（`src/pages/releases/index.astro` または既存のリリースノートデータ。実ファイルを確認して既存パターンに従う）

CLAUDE.md「git に commit する前に必ずリリースノートを更新する」に従う。

- [ ] **Step 1: リリースノートの記載先を特定する**

Run: `grep -rln "リリースノート\|releases" src/pages/releases/ src/lib 2>/dev/null`
既存のリリースノート項目のフォーマットを確認する。

- [ ] **Step 2: 項目を追加する**

既存パターンに合わせ「イベント詳細ページの特効衣装にスキル表示を追加（判定縮小を強調）」相当の項目を追加する。日付・バージョン採番は既存の最新項目の形式に従う。

- [ ] **Step 3: コミット**

```bash
git add -A
git commit -m "docs: リリースノートにイベント詳細スキル表示を追記

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: PR を作成する**

```bash
git push -u origin feature/event-detail-card-skill
gh pr create --title "feat: イベント詳細ページに特効衣装スキル表示を追加 (ADR 0008)" --body "$(cat <<'EOF'
## 概要
イベント詳細ページの特効衣装グリッドに各衣装のスコアスキルを表示し、判定縮小スキル持ちをピンクバッジ + カード枠 ring で強調する。

## 変更点
- `EventBonusCardGrid.svelte`: スキルバッジ行 + 縮小強調枠（既存 `formatSkillBadge` 再利用）
- `events/[id].astro`: 特効グリッドへ `apSkillType` / `apSkillReq` を props で渡す
- `tests/event-detail.test.ts`: スキルバッジ表示・縮小ピンク強調の E2E
- ADR 0008 追加

## 設計
- spec: `docs/superpowers/specs/2026-06-14-event-detail-card-skill-design.md`
- plan: `docs/superpowers/plans/2026-06-14-event-detail-card-skill.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage**: spec の「データ受け渡し」=Task 2、「グリッド表示（バッジ・配色・req・枠強調）」=Task 1、「エラー欠損（null→'-'）」=`formatSkillBadge` 既存挙動（Task 1 で再利用）、「テスト」=Task 3、「ADR」=Task 4。全項目に対応タスクあり。
- **型整合**: `EventBonusCardItem` に追加するのは `apSkillType: string | null` / `apSkillReq: string | null`（Task 1）。`events/[id].astro` 側も同じキー名 `apSkillType` / `apSkillReq` で渡す（Task 2）。`formatSkillBadge` の引数は `string | null` で `apSkillType` を渡せる。一致を確認済み。
- **配色一貫性**: 縮小バッジ `bg-pink-500 text-white` は `EventSharePanel.astro` と同一。
- **プレースホルダ**: なし（Task 5 のリリースノートのみ実ファイル確認を指示しているが、これは既存フォーマット追従のため）。
