# キャラクターカラー・アイデンティティ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サイトの主色を Tailwind デフォルトの indigo からキャラクター 16 色 + 無彩色クロームへ置き換え、アイドリッシュセブン固有のビジュアルアイデンティティを与える。

**Architecture:** 色を 3 チャンネル（属性=塗りチップ / キャラ=線と点 / 構造=無彩色）に分け、色相ではなく形で分離する。キャラ 16 色の単一情報源を `src/lib/constants.ts` に置き、同じ 16 色の並びをヘッダー・一覧フィルタ・ホームの 3 スケールで反復して署名要素とする。

**Tech Stack:** Astro 6 / Svelte / Tailwind CSS v4（`@theme` + `@utility`）/ Vitest / Playwright

**設計仕様:** [docs/superpowers/specs/2026-07-29-character-color-identity-design.md](../specs/2026-07-29-character-color-identity-design.md)

## Global Constraints

- **キャラ色は面を塗らない。** 線・縁・小さな点のみ。テキスト色に使うことは禁止（キャラ名は `gray-900` のまま）
- **キャラ色は近黒 `#14151A` の上でのみ 16 色が成立する。** 白背景に 16 色を並べてはならない（実測: 白に対する最小コントラストは 1.41）
- **属性色 `#ef4444` / `#22c55e` / `#3b82f6` は変更しない。** 属性は塗りチップ、キャラは線、という形の分離を崩さない
- **本文テキストを載せる面は完全不透明**（ADR 0046 の `surface-card`）。リスト行・タイルに `backdrop-filter` を使わない
- **`dark:` バリアントを使わない**（ADR 0020 でダークモード廃止済み）
- **ユーザー可視テキストでは「カード」ではなく「衣装」**、共有ブローチは「共通ブローチ」。内部識別子は `card` / `sharedBroach` のまま
- **色値の単一情報源は `src/lib/constants.ts`。** `global.css` の `@theme` へ複製する場合は「変更時は両方を更新する」コメントを添える（`ATTR_HEX` と同じ扱い）
- **一括の正規表現置換で class 属性を書き換えない。** Svelte の `class:` ディレクティブを破壊しても `astro check` では検出されず `astro build` でのみ露見する。クラス編集を含むタスクは必ず `npm run build` まで通す
- 検証は原則 `npm run dev`（約 1 秒で起動、HMR）で行う。`npm run build` は約 340 秒かかるため、Bash の timeout は 420000ms 以上を確保する

---

### Task 1: キャラクターカラーのデータと参照ヘルパー

色値の単一情報源を作る。以降のすべてのタスクがここを参照する。

**Files:**
- Modify: `src/lib/constants.ts`
- Test: `tests/unit/characterColor.test.ts`（新規）

**Interfaces:**
- Consumes: 既存の `CHARACTERS`（16 名の名前配列）、`CHARACTER_GROUPS`
- Produces:
  - `CHARACTER_HEX: Record<string, string>` — キャラ名 → HEX（`#RRGGBB` 小文字許容せず大文字）
  - `characterColor(name: string): string` — 未知の名前には無彩色 `'#6B7280'` を返す（八乙女楽の `#9AA3AD` と紛れないよう別の値にする）
  - `CHROME_INK = '#14151A'` — 無彩色クロームの基準色

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/characterColor.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_HEX, characterColor, CHROME_INK } from '../../src/lib/constants';

/** WCAG 相対輝度 */
function luminance(hex: string): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe('CHARACTER_HEX', () => {
  it('16 名すべてに色が定義されている', () => {
    for (const name of CHARACTERS) {
      expect(CHARACTER_HEX[name], `${name} の色が未定義`).toBeDefined();
    }
  });

  it('CHARACTERS に存在しないキーを含まない', () => {
    const known = new Set<string>(CHARACTERS);
    for (const key of Object.keys(CHARACTER_HEX)) {
      expect(known.has(key), `${key} は CHARACTERS に存在しない`).toBe(true);
    }
  });

  it('すべて #RRGGBB 形式である', () => {
    for (const [name, hex] of Object.entries(CHARACTER_HEX)) {
      expect(hex, `${name}: ${hex}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('色値に重複がない', () => {
    const values = Object.values(CHARACTER_HEX);
    expect(new Set(values).size).toBe(values.length);
  });

  it('全色が近黒クロームに対して 3:1 (WCAG 1.4.11) を満たす', () => {
    for (const [name, hex] of Object.entries(CHARACTER_HEX)) {
      const ratio = contrast(hex, CHROME_INK);
      expect(ratio, `${name} (${hex}) のコントラストが ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('characterColor', () => {
  it('既知のキャラは CHARACTER_HEX の値を返す', () => {
    expect(characterColor('七瀬陸')).toBe('#E4373B');
  });

  it('未知の名前はフォールバック色を返す', () => {
    expect(characterColor('存在しない人')).toBe('#6B7280');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- characterColor`
Expected: FAIL（`CHARACTER_HEX` / `characterColor` / `CHROME_INK` が `constants.ts` から export されていない）

- [ ] **Step 3: 最小実装を書く**

`src/lib/constants.ts` の `ATTR_HEX` 定義の直前に追記:

```ts
/** 無彩色クロームの基準色。ヘッダー等の構造面に使う */
export const CHROME_INK = '#14151A';

/**
 * キャラクターカラー 16 色。色の単一情報源。
 * 変更時は src/styles/global.css の @theme も更新する。
 *
 * 公式のカラーコードは公開されていない。定着した色名から校正した候補値であり、
 * 全色が CHROME_INK に対して WCAG 1.4.11 の 3:1 を満たすよう調整してある。
 * 十龍之介は原作では和泉一織と同じ「紺」だが、16 色を判別可能にするため彩度を下げている。
 */
export const CHARACTER_HEX: Record<string, string> = {
  和泉一織: '#3D5FC4',
  二階堂大和: '#43B75D',
  和泉三月: '#F08322',
  四葉環: '#56C5E8',
  逢坂壮五: '#8A6BC8',
  六弥ナギ: '#F5C518',
  七瀬陸: '#E4373B',
  八乙女楽: '#9AA3AD',
  九条天: '#F2A7C3',
  十龍之介: '#5878A6',
  百: '#FF3D8B',
  千: '#C3E829',
  亥清悠: '#6FDCC0',
  狗丸トウマ: '#C0353D',
  棗巳波: '#D8C3A0',
  御堂虎於: '#C77FC0',
};

/** キャラ名から色を引く。未知の名前には無彩色を返す */
export function characterColor(name: string): string {
  return CHARACTER_HEX[name] ?? '#6B7280';
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test:unit -- characterColor`
Expected: PASS（12 アサーション相当、8 テスト）

- [ ] **Step 5: 型チェック**

Run: `npx astro check`
Expected: `constants.ts` に関するエラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/constants.ts tests/unit/characterColor.test.ts
git commit -m "feat: キャラクターカラー 16 色の単一情報源を追加"
```

---

### Task 2: 無彩色トークンと material-chrome の無彩色化

クロームの色を indigo から近黒へ置き換える。この時点でヘッダーの見た目が変わる。

**Files:**
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 1 の `CHROME_INK`（値のみ。CSS からは import できないため `@theme` に複製する）
- Produces: `--color-chrome-ink` / `--color-chrome-ink-soft` トークン、無彩色化した `material-chrome`

- [ ] **Step 1: `@theme` に無彩色トークンを追加**

`src/styles/global.css` の `@theme` ブロック内、属性色定義の直後に追記:

```css
  /* 無彩色クローム。単一情報源は src/lib/constants.ts の CHROME_INK。変更時は両方を更新する */
  --color-chrome-ink: #14151A;
  --color-chrome-ink-soft: #2A2C33;
```

- [ ] **Step 2: `material-chrome` を無彩色に置き換える**

`@utility material-chrome` の中身を以下に差し替える（`indigo-700` / `indigo-800` への参照を削除する）:

```css
@utility material-chrome {
  background-color: color-mix(in srgb, var(--color-chrome-ink) 88%, transparent);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);

  @media (prefers-reduced-transparency: reduce) {
    background-color: var(--color-chrome-ink);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  @media (prefers-contrast: more) {
    background-color: #000;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
```

- [ ] **Step 3: body 背景の indigo ティントを除去**

`@layer base` の `body` ルールを以下に差し替える。半透明クロームの背後に色を置く意義は無彩色化で失われるため、ティントをやめて素の `bg-gray-50` に戻す:

```css
  /* 背景は素のグレー。無彩色クロームの背後に色ティントを置く意義がなくなったため (ADR 0047) */
  body {
    background-image: none;
  }
```

- [ ] **Step 4: dev サーバーで確認**

```bash
npm run dev
```

`http://localhost:4321/` を開き、ヘッダーが紫から近黒に変わり、白文字が読めることを確認する。

- [ ] **Step 5: `theme-color` メタタグを合わせる**

`src/layouts/BaseLayout.astro:88` の `<meta name="theme-color" content="#4338ca" />` を以下に変更:

```html
    <meta name="theme-color" content="#14151A" />
```

- [ ] **Step 6: コミット**

```bash
git add src/styles/global.css src/layouts/BaseLayout.astro
git commit -m "feat: クロームを indigo から無彩色へ置き換え"
```

---

### Task 3: indigo の一掃と回帰ガード

残る indigo（179 箇所・39 ファイル）を無彩色へ置き換える。**このタスクが最も事故を起こしやすい。**

**Files:**
- Modify: `src/` 配下の indigo を含む全ファイル（`grep -rl indigo src/` で列挙）
- Test: `tests/unit/noIndigo.test.ts`（新規）

**Interfaces:**
- Consumes: Task 2 の無彩色トークン
- Produces: `src/` に `indigo` が 1 箇所も残らない状態

**置換方針（用途ごとに手で判断する。一括正規表現は使わない）:**

| 現行 | 置換後 | 用途 |
| --- | --- | --- |
| `text-indigo-600` / `text-indigo-700`（リンク） | `text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-900` | リンク |
| `text-indigo-600` / `text-indigo-700`（見出し） | `text-gray-900` | 見出し。下線を付けない |
| `bg-indigo-600` / `bg-indigo-700`（主ボタン） | `bg-chrome-ink hover:bg-chrome-ink-soft` | 主ボタン |
| `hover:bg-indigo-50` | `hover:bg-gray-100` | メニュー項目のホバー |
| `hover:text-indigo-200`（クローム内） | `hover:text-gray-300` | 暗色クローム上のリンク |
| `focus:ring-indigo-*` | `focus:ring-chrome-ink` | フォーカスリング |
| `border-indigo-*` | `border-gray-300`（通常）/ `border-chrome-ink`（選択状態） | 境界 |
| `accent-indigo-600` | `accent-chrome-ink` | ネイティブ input |
| `from-indigo-* to-indigo-*` | 該当箇所を確認し無彩色階調へ | グラデーション |

> リンクの下線はテーブル内では過剰になる。`CardTableRow.svelte` など行内のリンクは `text-gray-900 hover:underline` とし、常時下線を付けない。行全体のホバー着色が既に affordance を担っている。

- [ ] **Step 1: 失敗するガードテストを書く**

`tests/unit/noIndigo.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(svelte|astro|ts|css)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('無彩色クローム (ADR 0047)', () => {
  it('src/ に indigo が残っていない', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const text = readFileSync(file, 'utf-8');
      text.split('\n').forEach((line, i) => {
        if (line.includes('indigo')) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `indigo が残存:\n${offenders.join('\n')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- noIndigo`
Expected: FAIL（179 箇所が列挙される）

- [ ] **Step 3: ファイルを 1 つずつ置換する**

`npm run test:unit -- noIndigo` の出力に従い、上表の方針で 1 ファイルずつ手で編集する。

**やってはいけないこと:** `sed -i 's/indigo-600/gray-900/g'` のような一括置換。Svelte の `class:` ディレクティブや動的クラス文字列を壊し、`astro check` では検出されない。

`src/lib/score/specDiagrams.ts` は SVG を文字列生成しているため、クラス名ではなく HEX 値の可能性がある。該当行を読んでから置換する。

- [ ] **Step 4: ガードテストが通ることを確認**

Run: `npm run test:unit -- noIndigo`
Expected: PASS

- [ ] **Step 5: 既存の単体テストが壊れていないことを確認**

Run: `npm run test:unit`
Expected: 全 PASS

- [ ] **Step 6: 本番ビルドを通す（必須）**

Run: `npm run build`（timeout は 420000ms 以上を指定する）
Expected: エラーなく完了

> このステップを飛ばさないこと。class 属性の破壊は build でしか検出されない。

- [ ] **Step 7: コミット**

```bash
git add -A src tests/unit/noIndigo.test.ts
git commit -m "refactor: indigo を無彩色へ一掃し回帰ガードを追加"
```

---

### Task 4: ヘッダーの 16 色バー（署名要素・3px）

**Files:**
- Create: `src/components/CharacterColorBar.svelte`
- Modify: `src/components/HeaderNav.svelte:106-110`（`<header>` 要素の直下）
- Test: `tests/character-color-bar.test.ts`（新規・Playwright）

**Interfaces:**
- Consumes: Task 1 の `CHARACTER_HEX`、既存の `CHARACTER_GROUPS`
- Produces: `CharacterColorBar.svelte` — props `{ height?: number }`（既定 3）。ルート要素は `data-testid="character-color-bar"`、各セグメントは `data-testid="character-color-segment"` と `data-character={名前}`

- [ ] **Step 1: コンポーネントを作る**

`src/components/CharacterColorBar.svelte` を新規作成:

```svelte
<script lang="ts">
  import { CHARACTER_GROUPS, characterColor } from '../lib/constants';

  type Props = { height?: number };
  let { height = 3 }: Props = $props();
</script>

<!--
  16 色バー。ユニットで区切るのは装飾ではなく、ピンク 3 色・緑 2 色・紺 2 色を
  含む 16 色を並び位置で判別可能にするための構造 (ADR 0047)。
  純粋な識別記号なので支援技術からは隠す。
-->
<div
  class="flex w-full gap-2"
  style="height:{height}px"
  data-testid="character-color-bar"
  aria-hidden="true"
>
  {#each CHARACTER_GROUPS as group (group.name)}
    <div class="flex flex-1 gap-px" style="flex-grow:{group.members.length}">
      {#each group.members as member (member)}
        <span
          class="flex-1"
          style="background-color:{characterColor(member)}"
          data-testid="character-color-segment"
          data-character={member}
        ></span>
      {/each}
    </div>
  {/each}
</div>
```

- [ ] **Step 2: ヘッダーへ差し込む**

`src/components/HeaderNav.svelte` の `<script>` に import を追加:

```ts
  import CharacterColorBar from './CharacterColorBar.svelte';
```

`</nav>` の直後（`{#if mobileOpen}` の直前）に挿入:

```svelte
  <CharacterColorBar />
```

- [ ] **Step 3: dev サーバーで確認**

```bash
npm run dev
```

`http://localhost:4321/` でヘッダー下端に 16 色の帯が出て、4 ユニットの間に隙間があることを確認する。

- [ ] **Step 4: E2E テストを書く**

`tests/character-color-bar.test.ts` を新規作成:

```ts
import { test, expect } from '@playwright/test';

test('ヘッダーに 16 色バーが表示される', async ({ page }) => {
  await page.goto('/');
  const bar = page.getByTestId('character-color-bar');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('character-color-segment')).toHaveCount(16);
});

test('七瀬陸のセグメントが赤である', async ({ page }) => {
  await page.goto('/');
  const riku = page.locator('[data-character="七瀬陸"]');
  await expect(riku).toHaveCSS('background-color', 'rgb(228, 55, 59)');
});
```

- [ ] **Step 5: E2E を実行**

dev サーバーを起動したまま:

Run: `npx playwright test tests/character-color-bar.test.ts`
Expected: 2 件 PASS

- [ ] **Step 6: コミット**

```bash
git add src/components/CharacterColorBar.svelte src/components/HeaderNav.svelte tests/character-color-bar.test.ts
git commit -m "feat: ヘッダーに 16 色バーを追加"
```

---

### Task 5: 衣装一覧行のキャラスパイン

**Files:**
- Modify: `src/components/cards/CardTableRow.svelte:36`（`borderColor` の隣に追加）、同ファイルの `<tr>` と先頭 `<td>`
- Modify: `src/components/cards/CardMobileCard.svelte`
- Modify: `src/components/cards/CardTileCard.svelte`

**Interfaces:**
- Consumes: Task 1 の `characterColor`
- Produces: 行の左端 4px にキャラ色のスパイン。`data-testid="character-spine"`

**前提:** 属性色は既に `border-top: 2px` を占有している（`CardTableRow.svelte:77`）。左端は空いているのでスパインを置ける。

- [ ] **Step 1: `CardTableRow.svelte` に色を導出する**

import 行（5 行目）を変更:

```ts
  import { ATTR_BG, ATTR_BG_HOVER, ATTR_HEX, characterColor } from '../../lib/constants';
```

`borderColor` の定義（36 行目）の直後に追加:

```ts
  const spineColor = $derived(characterColor(card.name || ''));
```

> `CardListItem` では `name` がキャラ名、`cardname` が衣装名（`CardTableRow.svelte:87-89` で確認済み）。取り違えないこと。

- [ ] **Step 2: 先頭セルにスパインを描く**

`CardTableRow.svelte` の最初の `<td>`（画像セル）の `class` に `relative` を足し、セル内の先頭に挿入:

```svelte
      <span
        class="absolute left-0 top-1 bottom-1 w-1 rounded-r"
        style="background-color:{spineColor}"
        data-testid="character-spine"
        aria-hidden="true"
      ></span>
```

> スパインは純粋な視覚索引で、同じ行にキャラ名テキストが既にある。支援技術には重複情報なので `aria-hidden` にする。

- [ ] **Step 3: dev サーバーで確認**

`http://localhost:4321/cards/` を開き、各行の左端にキャラ色の縦線が出ること、属性の上ボーダーと混同しないことを確認する。

- [ ] **Step 4: モバイル表示とタイル表示にも同じスパインを入れる**

`CardMobileCard.svelte` と `CardTileCard.svelte` に同様の `characterColor` import と 4px スパインを追加する。タイル表示ではカード上端ではなく左端に置き、属性色と役割が重ならないようにする。

- [ ] **Step 5: E2E テストを追加**

`tests/character-color-bar.test.ts` に追記:

```ts
test('衣装一覧の行にキャラスパインが出る', async ({ page }) => {
  await page.goto('/cards/');
  await expect(page.getByTestId('character-spine').first()).toBeVisible();
});
```

- [ ] **Step 6: E2E を実行**

Run: `npx playwright test tests/character-color-bar.test.ts`
Expected: 3 件 PASS

- [ ] **Step 7: コミット**

```bash
git add src/components/cards tests/character-color-bar.test.ts
git commit -m "feat: 衣装一覧の行にキャラクターカラーのスパインを追加"
```

---

### Task 6: キャラクターフィルタチップの着色

既存の `CardFilterChips` は `activeClass` を option ごとに受け取れる。ただしキャラ色は 16 通りの動的な値なので、Tailwind クラスではなくインラインスタイルが必要になる。

**Files:**
- Modify: `src/components/cards/CardFilterChips.svelte`
- Modify: `src/components/CardList.svelte:96-99`（`characterGroups` の生成）

**Interfaces:**
- Consumes: Task 1 の `characterColor`
- Produces: `ChipOption` に `activeStyle?: string` を追加。選択中はキャラ色、未選択は無彩色

- [ ] **Step 1: `ChipOption` 型に `activeStyle` を足す**

`src/components/cards/CardFilterChips.svelte:2` を変更:

```ts
  export type ChipOption = { value: string; label: string; activeClass?: string; activeStyle?: string };
```

- [ ] **Step 2: `chip` スニペットで `activeStyle` を適用**

`{#snippet chip(option: ChipOption)}` の `<button>` に `style` 属性を追加:

```svelte
  <button
    type="button"
    aria-pressed={selected.has(option.value)}
    onclick={() => toggle(option.value)}
    style={selected.has(option.value) ? (option.activeStyle ?? '') : ''}
    class="{chipBase} {selected.has(option.value)
      ? `${option.activeClass ?? 'bg-chrome-ink border-chrome-ink'} text-white font-semibold`
      : chipOff}"
  >
    {selected.has(option.value) ? '✓ ' : ''}{option.label}
  </button>
```

- [ ] **Step 3: `CardList.svelte` でキャラ色を渡す**

import 行に `characterColor` を追加し、`characterGroups`（96-99 行目）を差し替える:

```ts
  const characterGroups = CHARACTER_GROUPS.map((g) => ({
    name: g.name,
    options: g.members.map((m) => ({
      value: m,
      label: m,
      // 選択中のみキャラ色で塗る。チップは名前を必ず表示するので色は索引、名前はラベル (ADR 0047)
      activeStyle: `background-color:${characterColor(m)};border-color:${characterColor(m)};color:#14151A`,
    })),
  }));
```

> 文字色を白ではなく近黒 `#14151A` にするのは、六弥ナギ（黄）や千（蛍光黄緑）のような明るい色の上で白文字が読めないため。全 16 色は近黒に対して 3:1 以上を確保済みだが、チップ内はテキストなので暗い文字を載せる。

- [ ] **Step 4: dev サーバーで確認**

`http://localhost:4321/cards/` でキャラクターフィルタを開き、各チップを選択すると本人の色になること、**全 16 色でラベルが読めること**を目視確認する。特に八乙女楽（グレー）・棗巳波（ベージュ）・九条天（淡ピンク）を確認する。

- [ ] **Step 5: 読めない色があれば文字色を調整**

近黒 `#14151A` で読みにくい色があれば、その色のチップだけ選択時の塗りを薄くする（`background-color` に `color-mix(in srgb, {色} 22%, white)` を使い、境界線のみ原色にする）方式へ切り替える。判断はスクリーンショットで行う。

- [ ] **Step 6: コミット**

```bash
git add src/components/cards/CardFilterChips.svelte src/components/CardList.svelte
git commit -m "feat: キャラクターフィルタのチップにキャラクターカラーを適用"
```

---

### Task 7: ホームのヒーローを 16 色バーにする

現行ホームは白カード + 左罫線が 11 枚並ぶ。先頭の紹介カードをヒーローに置き換える。

**Files:**
- Create: `src/components/CharacterColorHero.svelte`
- Modify: `src/pages/index.astro`（先頭の紹介ブロック）

**Interfaces:**
- Consumes: Task 1 の `CHARACTER_HEX`、`CHARACTER_GROUPS`
- Produces: `CharacterColorHero.svelte` — props `{ base: string }`。各セグメントは `/cards/?char={名前}` へのリンク

- [ ] **Step 1: ヒーローコンポーネントを作る**

`src/components/CharacterColorHero.svelte` を新規作成:

```svelte
<script lang="ts">
  import { CHARACTER_GROUPS, characterColor } from '../lib/constants';

  type Props = { base: string };
  let { base }: Props = $props();
</script>

<!-- 大判の 16 色バー。ヘッダーの 3px 線と同じ並びを大きなスケールで反復する (ADR 0047) -->
<section class="rounded-card overflow-hidden" style="background-color:var(--color-chrome-ink)">
  <div class="px-5 pt-5 pb-4">
    <h1 class="text-display text-2xl font-bold text-white">i7マネ部屋</h1>
    <p class="mt-1.5 text-sm text-gray-300">
      アイドリッシュセブンの衣装・楽曲・イベントを調べて、デッキのスコアを試算できます。
    </p>
  </div>
  <div class="flex gap-3 px-5 pb-5">
    {#each CHARACTER_GROUPS as group (group.name)}
      <div class="min-w-0" style="flex-grow:{group.members.length};flex-basis:0">
        <div class="flex gap-px">
          {#each group.members as member (member)}
            <a
              href={`${base}cards/?char=${encodeURIComponent(member)}`}
              class="h-9 flex-1 pressable transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style="background-color:{characterColor(member)}"
              aria-label={`${member}の衣装一覧`}
            ></a>
          {/each}
        </div>
        <div class="mt-1.5 truncate text-[10px] tracking-wide text-gray-400">{group.name}</div>
      </div>
    {/each}
  </div>
</section>
```

- [ ] **Step 2: ホームに差し込む**

`src/pages/index.astro` の先頭にある紹介カード（サイト名・説明・件数バッジのブロック）を `<CharacterColorHero base={base} client:load />` に置き換える。件数バッジ（衣装 2,789 枚など）はヒーロー直下の既存レイアウトへ残す。

import を追加:

```astro
import CharacterColorHero from '../components/CharacterColorHero.svelte';
```

- [ ] **Step 3: dev サーバーで確認**

`http://localhost:4321/` を開き、ヒーローが表示され、セグメントをクリックすると該当キャラで絞り込まれた衣装一覧へ遷移することを確認する。

- [ ] **Step 4: キーボード操作を確認**

Tab でセグメントを辿れること、フォーカスリングが見えることを確認する。

- [ ] **Step 5: E2E テストを追加**

`tests/character-color-bar.test.ts` に追記:

```ts
test('ホームのヒーローからキャラで絞り込める', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('七瀬陸の衣装一覧').click();
  await expect(page).toHaveURL(/char=/);
});
```

- [ ] **Step 6: E2E を実行**

Run: `npx playwright test tests/character-color-bar.test.ts`
Expected: 4 件 PASS

- [ ] **Step 7: コミット**

```bash
git add src/components/CharacterColorHero.svelte src/pages/index.astro tests/character-color-bar.test.ts
git commit -m "feat: ホームのヒーローを 16 色バーに置き換え"
```

---

### Task 8: 衣装詳細とデッキスロットへのキャラ色適用

**Files:**
- Modify: `src/pages/cards/[id].astro:64` 付近（キャラクター行）
- Modify: `src/components/score/DeckSlots.svelte:371` 付近（スロット内のキャラ名）
- Modify: `src/components/RabbitNoteEditor.svelte:11-16, 67`（`GROUP_COLORS`）
- Modify: `src/components/SharedBroachEditor.svelte:7, 51`（`GROUP_COLORS`）

**Interfaces:**
- Consumes: Task 1 の `characterColor`
- Produces: なし（表示のみ）

> **衣装比較のチャートには適用しない。** `src/components/compare/ShrinkChart.svelte:95` の系列枠線は既に属性色（`ATTR_HEX`）が占有しており、キャラ色を重ねると「属性＝塗り／キャラ＝線」の分離規則を破る。

- [ ] **Step 1: 衣装詳細のキャラクター行にドットを出す**

`src/pages/cards/[id].astro` のフロントマターに import を追加:

```astro
import { characterColor } from '../../lib/constants';
```

64 行目付近の定義リスト生成で、`キャラクター` 行だけ値の前に色ドットを描く。定義リストの描画箇所を読み、値セル内の先頭に以下を挿入する:

```astro
<span
  class="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
  style={`background-color:${characterColor(card.name)}`}
  aria-hidden="true"
></span>
```

> 同じセルにキャラ名テキストがあるため、ドットは支援技術には重複情報。`aria-hidden` にする。

- [ ] **Step 2: dev サーバーで確認**

`http://localhost:4321/cards/3810/` を開き、キャラクター行にそのキャラの色ドットが出ることを確認する。

- [ ] **Step 3: デッキスロットにスパインを足す**

`src/components/score/DeckSlots.svelte` の `<script>` に import を追加:

```ts
  import { characterColor } from '../../lib/constants';
```

371 行目付近、キャラ名を表示している要素を含むスロットのコンテナに `relative` を足し、その中に挿入:

```svelte
        <span
          class="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
          style="background-color:{characterColor(card.name || '')}"
          aria-hidden="true"
        ></span>
```

- [ ] **Step 4: dev サーバーで確認**

`http://localhost:4321/score-calc/` でデッキに衣装を入れ、スロット左端にキャラ色が出ることを確認する。スロットは小さいのでスパインは 2px にしてある。潰れて見える場合は色ドットへ切り替える。

- [ ] **Step 5: ユニット別セクションの恣意的なグループ色を廃する**

`RabbitNoteEditor.svelte` と `SharedBroachEditor.svelte` は、ユニットごとのセクションに `border-l-4` + `GROUP_COLORS`（TRIGGER=amber / Re:vale=pink / ŹOOĻ=emerald）を当てている。この 3 色はキャラ 16 色でも属性 3 色でもなく、「意味を持つ色は 16 色と属性 3 色だけ」という原則に反する。

`GROUP_COLORS` を削除し、左罫線を**そのユニットのメンバー色を縦に積んだ帯**へ置き換える。ヘッダーの 16 色バーと同じ並びを縦向き・グループ単位で反復する形になり、かつ「誰が所属しているか」という実際の情報を持つ。

両ファイルで、`GROUP_COLORS` の定義と `border-l-4 {GROUP_COLORS[...]}` を削除し、`<section>` に `relative overflow-hidden` を足したうえで先頭に挿入する:

```svelte
      <span class="absolute left-0 top-0 bottom-0 flex w-1 flex-col" aria-hidden="true">
        {#each group.members as member (member)}
          <span class="flex-1" style="background-color:{characterColor(member)}"></span>
        {/each}
      </span>
```

`characterColor` を import すること。`group.members` が使えない場合（`SharedBroachEditor` の `GroupKey` は `CHARACTER_GROUPS` と別構造の可能性がある）、`CHARACTER_GROUPS` から該当ユニットのメンバーを引いて使う。

- [ ] **Step 6: dev サーバーで確認**

`http://localhost:4321/rabbit-note/` と `http://localhost:4321/shared-broach/` を開き、各ユニットのセクション左端にメンバー色の帯が出ること、IDOLiSH7 が 7 段・TRIGGER が 3 段・Re:vale が 2 段・ŹOOĻ が 4 段になっていることを確認する。

- [ ] **Step 7: 単体テストとビルドを通す**

Run: `npm run test:unit`
Expected: 全 PASS

Run: `npm run build`（timeout 600000ms 以上）
Expected: エラーなく完了

- [ ] **Step 8: コミット**

```bash
git add "src/pages/cards/[id].astro" src/components/score/DeckSlots.svelte src/components/RabbitNoteEditor.svelte src/components/SharedBroachEditor.svelte
git commit -m "feat: 衣装詳細・デッキスロット・ユニット別セクションにキャラクターカラーを適用"
```

---

### Task 9: 数字・欧文フォント（Barlow Semi Condensed）

**Files:**
- Create: `public/fonts/barlow-semi-condensed-{400,600,700}.woff2`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: なし
- Produces: `--font-numeric` トークンと `tabular-nums` の既存利用箇所に効くフォント指定

- [ ] **Step 1: フォントを取得しサブセットする**

Barlow Semi Condensed（SIL Open Font License 1.1。再配布可）の 400 / 600 / 700 を取得し、数字・基本ラテン・約物にサブセットして `woff2` へ変換する。

```bash
mkdir -p public/fonts
pip install 'fonttools[woff]' brotli

# Google Fonts の GitHub リポジトリから TTF を取得
BASE=https://raw.githubusercontent.com/google/fonts/main/ofl/barlowsemicondensed
for w in Regular:400 SemiBold:600 Bold:700; do
  name=${w%%:*}; num=${w##*:}
  curl -fsSL "$BASE/BarlowSemiCondensed-$name.ttf" -o "/tmp/bsc-$num.ttf"
  pyftsubset "/tmp/bsc-$num.ttf" \
    --unicodes="U+0020-007E,U+00A0,U+2000-206F,U+2212" \
    --layout-features="kern,tnum" \
    --flavor=woff2 \
    --output-file="public/fonts/barlow-semi-condensed-$num.woff2"
done

ls -l public/fonts/
```

ライセンス表記のため `public/fonts/OFL.txt` に元リポジトリの `OFL.txt` を配置する。

各ファイルが 10KB 以下、合計 25KB 以下であることを確認する。超える場合は `--layout-features` を `tnum` のみに絞る。

- [ ] **Step 2: `@font-face` と `@theme` トークンを追加**

`src/styles/global.css` の `@import "tailwindcss";` の直後に追記:

```css
/* 数字・欧文専用。CJK には適用しない (ADR 0047 / ADR 0046 §5 の限定的な例外) */
@font-face {
  font-family: 'Barlow Semi Condensed';
  src: url('/fonts/barlow-semi-condensed-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
  unicode-range: U+0020-007E, U+00A0, U+2000-206F, U+2212;
}
@font-face {
  font-family: 'Barlow Semi Condensed';
  src: url('/fonts/barlow-semi-condensed-600.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
  unicode-range: U+0020-007E, U+00A0, U+2000-206F, U+2212;
}
@font-face {
  font-family: 'Barlow Semi Condensed';
  src: url('/fonts/barlow-semi-condensed-700.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
  unicode-range: U+0020-007E, U+00A0, U+2000-206F, U+2212;
}
```

`@theme` の `--font-sans` を、Barlow を先頭に置いた形へ差し替える。`unicode-range` により CJK には適用されない:

```css
  --font-sans:
    'Barlow Semi Condensed', system-ui, -apple-system, "Hiragino Kaku Gothic ProN",
    "Hiragino Sans", "Yu Gothic", "YuGothic", "Meiryo", sans-serif;
```

- [ ] **Step 3: dev サーバーで確認**

`http://localhost:4321/cards/` を開き、スコア値（6,818 など）がコンデンス体になり、日本語が従来のゴシックのままであることを確認する。

- [ ] **Step 4: `tabular-nums` が効くか実機確認**

スコア計算ページで数値列の桁が揃うことを確認する。揃わない場合は `font-feature-settings: "tnum"` を該当箇所に明示するか、数値列のみ等幅フォントへフォールバックする。

- [ ] **Step 5: ビルドしてフォントが配信されることを確認**

Run: `npm run build`（timeout 420000ms 以上）
Expected: 完了後 `dist/fonts/` に 3 ファイルが存在する

- [ ] **Step 6: SW のキャッシュ対象を確認**

`public/sw.js` の CacheFirst 対象に `/fonts/` が含まれるか確認し、含まれなければ追加する。`SW_VERSION` を上げる。

- [ ] **Step 7: コミット**

```bash
git add public/fonts src/styles/global.css public/sw.js
git commit -m "feat: 数字・欧文に Barlow Semi Condensed を導入"
```

---

### Task 10: ADR 記録と実データ画面での承認ゲート

**Files:**
- Create: `docs/adr/0047-character-color-identity.md`
- Modify: `docs/adr/README.md`（一覧表に行を追加）
- Modify: `docs/adr/0046-apple-design-redesign.md`（部分的に上書きされた旨を追記）
- Modify: `CLAUDE.md`（デザイン規約の節）
- Modify: `src/pages/releases/index.astro`

- [ ] **Step 1: ADR 0047 を書く**

`docs/adr/0047-character-color-identity.md` を作成し、設計仕様の「決定」節を ADR 形式へ要約する。検討した代替案（グループ 4 色 / 1 画面 1 キャラ色 / indigo 継承 / キャラ色を面で使う）を必ず含める。実装の詳細は書かない。

- [ ] **Step 2: ADR 0046 に上書き注記を入れる**

`docs/adr/0046-apple-design-redesign.md` の「影響」節の末尾に追記:

```markdown
- 本 ADR の §1（クロームの indigo 材）と §5（カスタム Web フォントを導入しない）は、[0047](0047-character-color-identity.md) により部分的に上書きされた。マテリアル 3 層の構造とアクセシビリティ・モーションの方針は引き続き有効。
```

- [ ] **Step 3: README.md の一覧表に行を追加**

- [ ] **Step 4: CLAUDE.md のデザイン規約を更新**

「デザイン規約（apple-design / ADR 0046）」の節に、色の 3 チャンネル分離・キャラ色は面を塗らない・indigo 廃止を追記する。

- [ ] **Step 5: リリースノートを更新**

`src/pages/releases/index.astro` に今回の変更を追加する。

- [ ] **Step 6: 実データ画面のスクリーンショットを撮る（承認ゲート）**

dev サーバーを起動し、以下を `tmp/` に保存する:

- `http://localhost:4321/cards/`（デスクトップ 1440px / モバイル 390px）
- `http://localhost:4321/score-calc/`（同上）
- `http://localhost:4321/`（同上）
- キャラクターフィルタを 16 色すべて選択した状態

- [ ] **Step 7: ユーザーの承認を取る**

ADR 0001 の教訓に従い、**ホームではなく衣装一覧とスコア計算の実データ画面**でユーザーの承認を取る。承認が得られるまで次へ進まない。

- [ ] **Step 8: 全テストとビルドを通す**

```bash
npm run test:unit
npm run build
npx playwright test
```

- [ ] **Step 9: コミット**

```bash
git add docs CLAUDE.md src/pages/releases/index.astro
git commit -m "docs: ADR 0047 キャラクターカラー・アイデンティティを記録"
```

---

## 完了条件

- `npm run test:unit` が全 PASS（`characterColor` / `noIndigo` を含む）
- `npm run build` がエラーなく完了
- `npx playwright test` が全 PASS
- `grep -rn indigo src/` が 0 件
- 衣装一覧・スコア計算の実データ画面でユーザーの承認済み
- ADR 0047 がコミット済み
