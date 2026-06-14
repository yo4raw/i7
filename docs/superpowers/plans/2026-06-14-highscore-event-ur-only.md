# ハイスコアイベント UR のみ表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** イベント詳細ページで、ハイスコアライブイベントのときは特効衣装を UR のみ表示し、その旨の注記を出す。

**Architecture:** `isHighScoreEvent` 判定ヘルパーを追加。`events/[id].astro` の `getStaticPaths` でハイスコアイベントのみ各ティアのカードを UR に絞り、テンプレートに注記を追加。表示のみの変更。

**Tech Stack:** Astro 6 / TypeScript / Tailwind CSS v4 / Vitest / Playwright

---

## File Structure

- `src/lib/data/eventBonusTiers.ts`（修正）— `isHighScoreEvent` を追加。
- `tests/unit/eventHighScore.test.ts`（新規）— `isHighScoreEvent` の単体テスト。
- `src/pages/events/[id].astro`（修正）— UR フィルタ + 注記。
- `tests/event-detail.test.ts`（修正）— ハイスコアイベントの E2E 追加。
- `docs/adr/0012-highscore-event-ur-only.md`（新規）+ `docs/adr/README.md`（修正）。

---

## Task 1: `isHighScoreEvent` ヘルパーを TDD で追加

**Files:**
- Modify: `src/lib/data/eventBonusTiers.ts`
- Test: `tests/unit/eventHighScore.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/eventHighScore.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { isHighScoreEvent } from '../../src/lib/data/eventBonusTiers';

describe('isHighScoreEvent', () => {
  it('ハイスコアライブイベントは true', () => {
    expect(isHighScoreEvent('ハイスコアライブイベント')).toBe(true);
  });
  it('「ハイスコア」を含めば true（表記揺れ吸収）', () => {
    expect(isHighScoreEvent('ハイスコア')).toBe(true);
  });
  it('他のイベント種別は false', () => {
    expect(isHighScoreEvent('ポイントライブイベント')).toBe(false);
    expect(isHighScoreEvent('ミッションイベント')).toBe(false);
  });
  it('空・null・undefined は false', () => {
    expect(isHighScoreEvent('')).toBe(false);
    expect(isHighScoreEvent(null)).toBe(false);
    expect(isHighScoreEvent(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npm run test:unit -- eventHighScore`
Expected: FAIL（`isHighScoreEvent` が無い）

- [ ] **Step 3: 実装を追加**

`src/lib/data/eventBonusTiers.ts` の末尾に追加:
```typescript
/** イベント種別がハイスコア系か判定する（表記揺れに備え includes 判定）。 */
export function isHighScoreEvent(eventtype: string | null | undefined): boolean {
  return !!eventtype && eventtype.includes('ハイスコア');
}
```

- [ ] **Step 4: 実行して通ることを確認**

Run: `npm run test:unit -- eventHighScore`
Expected: PASS（全4ケース）

- [ ] **Step 5: コミット**

```bash
git add src/lib/data/eventBonusTiers.ts tests/unit/eventHighScore.test.ts
git commit -m "feat: イベント種別のハイスコア判定 isHighScoreEvent を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: イベント詳細で UR フィルタと注記を実装

**Files:**
- Modify: `src/pages/events/[id].astro`

### 現状の `getStaticPaths`（9-30 行）
```astro
  const pick = (ids: number[]): Card[] =>
    [...new Set(ids)].map(id => cardMap.get(id)).filter((c): c is Card => !!c);

  return (events as EventRow[]).map(ev => ({
    params: { id: String(ev.id) },
    props: {
      event: ev,
      goldCards: pick(ev.gold.cardIds),
      silverCards: pick(ev.silver.cardIds),
      bronzeCards: pick(ev.bronze.cardIds),
    },
  }));
```

- [ ] **Step 1: import に `isHighScoreEvent` を追加**

5 行目付近の import 群に追加:
```astro
import { isHighScoreEvent } from '../../lib/data/eventBonusTiers';
```

- [ ] **Step 2: `getStaticPaths` でハイスコア時に UR フィルタ**

`pick` 定義の後に UR フィルタ付きの取得関数を足し、props を差し替える:
```astro
  const pick = (ids: number[]): Card[] =>
    [...new Set(ids)].map(id => cardMap.get(id)).filter((c): c is Card => !!c);

  return (events as EventRow[]).map(ev => {
    const urOnly = isHighScoreEvent(ev.eventtype);
    const pickTier = (ids: number[]): Card[] => {
      const picked = pick(ids);
      return urOnly ? picked.filter(c => c.rarity === 'UR') : picked;
    };
    return {
      params: { id: String(ev.id) },
      props: {
        event: ev,
        goldCards: pickTier(ev.gold.cardIds),
        silverCards: pickTier(ev.silver.cardIds),
        bronzeCards: pickTier(ev.bronze.cardIds),
      },
    };
  });
```

- [ ] **Step 3: コンポーネントスコープで `isHighScore` を算出**

props 分割代入（`const { event, goldCards, silverCards, bronzeCards } = Astro.props as Props;`）の直後に追加:
```astro
const isHighScore = isHighScoreEvent(event.eventtype);
```

- [ ] **Step 4: 注記を追加**

ヘッダー `<div class="mb-6"> ... </div>`（`event.comment` ブロックを含む div）の閉じ `</div>` の直後、`{tiers.map(t => (` の直前に挿入:
```astro
  {isHighScore && (
    <p
      data-testid="highscore-ur-note"
      class="mb-6 text-sm text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded px-3 py-2"
    >
      ハイスコアライブイベントのため、UR 衣装のみ表示しています。
    </p>
  )}
```

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 0 errors。

- [ ] **Step 6: コミット**

```bash
git add "src/pages/events/[id].astro"
git commit -m "feat: ハイスコアイベントの特効衣装を UR のみ表示し注記を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: E2E テストを追加

**Files:**
- Modify: `tests/event-detail.test.ts`

既存ファイルは `beforeAll` で `fetchEventsCsv` を読み金特効ありイベント ID を解決し、`BASE=''`、dev サーバー再利用で動く。ハイスコアイベント用に別の `describe` を追加する。

- [ ] **Step 1: import とテストを追加**

ファイル冒頭の import に追加:
```typescript
import { isHighScoreEvent } from '../src/lib/data/eventBonusTiers';
```

ファイル末尾（最後の `});` の後）に追加:
```typescript
test.describe('イベント詳細 ハイスコアUR限定', () => {
  let highScoreId = 0;

  test.beforeAll(async () => {
    const events = await fetchEventsCsv();
    const target = events.find(
      (ev) => isHighScoreEvent(ev.eventtype) &&
        (ev.gold.cardIds.length + ev.silver.cardIds.length + ev.bronze.cardIds.length) > 0,
    );
    highScoreId = target?.id ?? 0;
  });

  test('ハイスコアイベントは UR 注記が表示され、特効バッジが UR のみ', async ({ page }) => {
    test.skip(highScoreId === 0, 'ハイスコアイベントが events.csv に無いためスキップ');
    await page.goto(`${BASE}/events/${highScoreId}/`);

    await expect(page.getByTestId('highscore-ur-note')).toBeVisible();

    // 特効セクションのレアリティバッジ（RARITY_BADGE_CLASSES のテキスト）が UR のみ
    const sections = page.locator('section');
    const rarityBadges = sections.locator('span', { hasText: /^(UR|SSR|SR|R|N)$/ });
    await rarityBadges.first().waitFor({ timeout: 10000 });
    const texts = await rarityBadges.allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.trim()).toBe('UR');
    }
  });
});
```

注: 既存ファイルは `fetchEventsCsv` を既に import 済み（先頭で利用）。重複 import しないこと。レアリティバッジは `EventBonusCardGrid.svelte` で `{card.rarity || '?'}` を `<span class="...">` に出している。`/^(UR|SSR|SR|R|N)$/` で属性バッジ等と区別する。

- [ ] **Step 2: テスト実行（dev サーバー再利用）**

別ターミナルで `npm run dev` 起動済みの前提で:

Run: `npx playwright test tests/event-detail.test.ts -g "ハイスコア"`
Expected: PASS（ハイスコアイベントがあれば検証、無ければ skip）。

- [ ] **Step 3: 既存 event-detail テストも通ることを確認**

Run: `npx playwright test tests/event-detail.test.ts`
Expected: 全 PASS/skip。

- [ ] **Step 4: コミット**

```bash
git add tests/event-detail.test.ts
git commit -m "test: ハイスコアイベントの UR 限定表示を検証

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: ADR 0012 を追加

**Files:**
- Create: `docs/adr/0012-highscore-event-ur-only.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: ADR 本文を作成**

`docs/adr/0012-highscore-event-ur-only.md`:
```markdown
# 0012. ハイスコアイベントの特効衣装は UR のみ表示する

- ステータス: 承認
- 日付: 2026-06-14

## 背景

イベント詳細ページは特効衣装を全レアリティ表示する。ハイスコアライブイベントでは UR 衣装のみが実質的に重要で、他レアリティの表示が情報過多だった。

## 決定

`eventtype` が「ハイスコア」を含むイベントでは、特効衣装グリッド（金/銀/銅）を `rarity === 'UR'` のみに絞り込んで表示する。判定は表記揺れに備え `includes('ハイスコア')`（`isHighScoreEvent`）で行う。UR 以外を隠していることをユーザーに明示するため、ページ上部に注記「ハイスコアライブイベントのため、UR 衣装のみ表示しています。」を表示する。フィルタはビルド時（`getStaticPaths`）に行い、所持枚数サマリーや OGP も UR のみを反映する。

## 検討した代替案

- **注記なしで UR のみ表示**: シンプルだがカード欠落と誤解されうるため注記ありを採用。
- **完全一致判定（`=== 'ハイスコアライブイベント'`）**: 表記揺れに弱いため `includes` を採用。

## 影響

- 変更は `events/[id].astro` と判定ヘルパー（`eventBonusTiers.ts`）。非ハイスコアイベントは挙動不変。
```

- [ ] **Step 2: README.md に追記**

`docs/adr/README.md` の `0011` 行の下に追加:
```markdown
| [0012](0012-highscore-event-ur-only.md) | ハイスコアイベントの特効衣装は UR のみ表示する | 承認 |
```

- [ ] **Step 3: コミット**

```bash
git add docs/adr/0012-highscore-event-ur-only.md docs/adr/README.md
git commit -m "docs: ADR 0012 ハイスコアイベント UR のみ表示を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: 目視確認・PR 作成（リリースは制御側）

- [ ] **Step 1: 制御側が dev サーバーで目視確認**
  - ハイスコアライブイベントを開き、UR のみ表示＋注記が出ること。
  - 非ハイスコアイベント（ポイントライブ等）で従来どおり全レアリティ表示・注記なしであること。
  - スクショを `tmp/` に保存。

- [ ] **Step 2: push して PR 作成**

```bash
git push -u origin feature/highscore-event-ur-only
gh pr create --title "feat: ハイスコアイベントの特効衣装を UR のみ表示 (ADR 0012)" --body "$(cat <<'EOF'
## 概要
イベント詳細ページで、ハイスコアライブイベントのときは特効衣装を UR のみに絞って表示し、その旨の注記を出す。

## 変更点
- `src/lib/data/eventBonusTiers.ts`: `isHighScoreEvent`（`includes('ハイスコア')`）追加 + 単体テスト
- `events/[id].astro`: getStaticPaths でハイスコア時に各ティアを `rarity === 'UR'` に絞り、注記を表示
- `tests/event-detail.test.ts`: ハイスコアイベントの UR 限定 + 注記の E2E
- ADR 0012 追加

## 確認
- `npm run test:unit`: 全緑（新規含む）
- `npm run typecheck`: 0 errors
- Playwright（event-detail）: 該当 E2E 含め PASS
- dev サーバー目視: ハイスコアで UR のみ+注記 / 非ハイスコアで従来どおり

## 設計
- spec: `docs/superpowers/specs/2026-06-14-highscore-event-ur-only-design.md`
- plan: `docs/superpowers/plans/2026-06-14-highscore-event-ur-only.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage**: 判定ヘルパー+単体=Task 1、UR フィルタ+注記=Task 2、E2E=Task 3、ADR=Task 4、PR/リリース=Task 5。全項目に対応あり。
- **型整合**: `isHighScoreEvent(eventtype: string | null | undefined)`。`event.eventtype` は `string`。`pickTier` は `Card[]` を返す。props 型 `Props` は変更不要（goldCards 等は引き続き `Card[]`）。
- **回帰防止**: 非ハイスコアでは `urOnly=false` → `pick` と同じ結果。注記は `{isHighScore && ...}` ガード。
- **プレースホルダ**: なし。
