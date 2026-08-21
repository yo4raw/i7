# トップページ GSAP モーション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IDOLiSH7 衣装データベースのトップページに GSAP による登場演出と数値カウントアップを実装し、サイトの第一印象を強化する。

**Architecture:** GSAP はトップページ 1 枚だけに閉じ込める。`index.astro` の `<script>` から `initHomeMotion()` を呼び、Vite がこのページ専用チャンクへ切り出す。初期非表示は `<html data-motion="on">` フラグが立っているときだけ有効な CSS ルールで行い、JavaScript が失敗しても要素は可視のまま残る。スクロール登場は ScrollTrigger ではなく IntersectionObserver で実装する。

**Tech Stack:** Astro 7 / Svelte 5 / Tailwind CSS v4 / TypeScript / GSAP 3.15 / Vitest（単体）/ Playwright（E2E）

**Spec:** `docs/superpowers/specs/2026-08-21-gsap-home-motion-design.md`
**ADR:** `docs/adr/0054-gsap-home-motion.md`（承認済み・コミット済み）

---

## Global Constraints

すべてのタスクの要件に、以下が暗黙に含まれる。

- **Node.js は 22 を使う。** `.nvmrc` が `22` を指定している。**Node 25 では jsdom の `localStorage` が壊れ、`tests/unit/storage.test.ts` / `tests/unit/data/rabbitNote.test.ts` / `tests/unit/stores/broachCounts.test.ts` / `tests/unit/stores/cardCounts.test.ts` の 22 テストが `localStorage.clear is not a function` で失敗する。これは本計画と無関係の環境起因であり、CI（Node 22）では green。** 作業開始前に `node -v` が `v22.x` であることを確認すること。
- **ライトテーマ固定。** `dark:` バリアントを新規に付けない（ADR 0020）。
- **`indigo` をクラス名・HEX とも `src/` に増やさない**（ADR 0047）。構造の配色は無彩色（近黒 `#14151A` / 白 / グレー階調）。
- **ユーザー可視テキストでは「カード」ではなく「衣装」を使う。** 内部識別子は `card` のまま。
- **影・角丸・イージングは `@theme` のトークンを使い値を直書きしない**（ADR 0046）。
- **`backdrop-filter` を新たに使わない。** リスト行・タイル・繰り返し要素には特に禁止（ADR 0046）。
- **単体テストのカバレッジゲートは `src/lib/**` に対して statements / branches / functions / lines すべて 95%**（ADR 0032、`vitest.config.ts`）。下回ると CI が落ちる。
- **リンターは oxlint のみ。** `npm run lint` が通ること。pre-commit で `*.{ts,js,mjs,cjs,astro,svelte}` に対し自動実行される。
- **ローカルの E2E は dev サーバーを再利用する。** 先に `npm run dev` を起動しておけば `playwright.config.ts` の `reuseExistingServer: true` によりビルドなしで回る（実測 20 秒弱）。サーバー無しで `npm run test` を実行すると本番ビルドが走り 5〜10 分かかる。
- **dev サーバー上では Astro dev toolbar が DOM に要素を注入する。** ロケータは `getByTestId` / `getByLabel` / role / data 属性で特定し、裸の `locator('select')` のような曖昧なセレクタを使わない。
- **dev サーバーは `astro dev stop` で停止する**（デーモン化されており `TaskStop` では止まらない）。

### モジュール分割の原則（このプランの中核）

| ファイル | GSAP 依存 | テスト環境 | カバレッジ |
| --- | --- | --- | --- |
| `src/lib/motion/countUp.ts` | なし | node | 100% を狙う |
| `src/lib/motion/homeMotionDom.ts` | なし | jsdom | 100% を狙う |
| `src/lib/motion/homeMotion.ts` | あり | なし（E2E で検証） | 全体を `/* v8 ignore */` で除外 |

**`homeMotion.ts` に判定ロジックを書かないこと。** テストできるロジックはすべて `countUp.ts` か `homeMotionDom.ts` に置き、`homeMotion.ts` は GSAP を呼ぶだけの薄い層に保つ。既存の `src/lib/score/maxScoreFinder.worker.ts` が同じ方針を取っている。

---

## File Structure

| 種別 | パス | 責務 |
| --- | --- | --- |
| Create | `src/lib/motion/countUp.ts` | 数値の整形・線形補間・`data-count-to` のパース。純粋関数のみ |
| Create | `src/lib/motion/homeMotionDom.ts` | 属性定数、演出パラメータ表、DOM 収集・属性解放・IntersectionObserver 登録 |
| Create | `src/lib/motion/homeMotion.ts` | GSAP タイムライン構築とブートストラップ。`initHomeMotion()` のみ公開 |
| Create | `tests/unit/motion/countUp.test.ts` | `countUp.ts` の単体テスト（node 環境） |
| Create | `tests/unit/motion/homeMotionDom.test.ts` | `homeMotionDom.ts` の単体テスト（jsdom 環境） |
| Create | `tests/home-motion.test.ts` | モーションの E2E |
| Modify | `src/styles/global.css` | 初期非表示ルールを末尾に追加 |
| Modify | `src/layouts/BaseLayout.astro` | `<head>` にモーションフラグ判定のインラインスクリプト |
| Modify | `src/components/CharacterColorHero.svelte` | `data-motion-*` 属性の付与 |
| Modify | `src/components/EventCountdown.svelte` | `data-motion-*` 属性の付与 |
| Modify | `src/pages/index.astro` | `data-motion-*` / `data-count-to` / `sr-only` の付与と `<script>` 追加 |
| Modify | `tests/home.test.ts` | カウントアップ完了待ちを入れて安定化 |
| Modify | `tests/character-color-bar.test.ts` | ヒーロー登場完了待ちを入れて安定化 |
| Modify | `CLAUDE.md` | モーション規約に GSAP の適用範囲を追記 |

---

## Task 1: `countUp.ts` の純粋関数

**Files:**
- Create: `src/lib/motion/countUp.ts`
- Test: `tests/unit/motion/countUp.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `formatCount(value: number): string` — 四捨五入して `ja-JP` のカンマ区切り整数文字列にする
  - `interpolateCount(from: number, to: number, progress: number): number` — `progress` を 0..1 にクランプして線形補間する
  - `parseCountTarget(raw: string | null): number | null` — `data-count-to` の値をパースする。`null` / 非有限数なら `null`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/motion/countUp.test.ts` を新規作成する。

```ts
import { describe, it, expect } from 'vitest';
import { formatCount, interpolateCount, parseCountTarget } from '../../../src/lib/motion/countUp';

describe('formatCount', () => {
  it('四捨五入して ja-JP のカンマ区切りにする', () => {
    expect(formatCount(2689)).toBe('2,689');
    expect(formatCount(1234.7)).toBe('1,235');
    expect(formatCount(1234.2)).toBe('1,234');
  });

  it('1000 未満はカンマを付けない', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999.4)).toBe('999');
  });
});

describe('interpolateCount', () => {
  it('進捗 0 / 0.5 / 1 で from・中間・to を返す', () => {
    expect(interpolateCount(0, 2689, 0)).toBe(0);
    expect(interpolateCount(0, 2689, 0.5)).toBe(1344.5);
    expect(interpolateCount(0, 2689, 1)).toBe(2689);
  });

  it('進捗は 0..1 にクランプされる', () => {
    expect(interpolateCount(0, 100, -0.5)).toBe(0);
    expect(interpolateCount(0, 100, 1.5)).toBe(100);
  });

  it('from が 0 以外でも補間できる', () => {
    expect(interpolateCount(100, 200, 0.25)).toBe(125);
  });
});

describe('parseCountTarget', () => {
  it('数値文字列をパースする', () => {
    expect(parseCountTarget('2689')).toBe(2689);
    expect(parseCountTarget('0')).toBe(0);
  });

  it('null・空文字・非数値・非有限は null を返す', () => {
    expect(parseCountTarget(null)).toBeNull();
    expect(parseCountTarget('')).toBeNull();
    expect(parseCountTarget('abc')).toBeNull();
    expect(parseCountTarget('Infinity')).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/motion/countUp.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/lib/motion/countUp"`

- [ ] **Step 3: 最小の実装を書く**

`src/lib/motion/countUp.ts` を新規作成する。

```ts
/**
 * トップページのカウントアップ演出で使う数値ユーティリティ (ADR 0054)。
 * DOM にも GSAP にも依存しない純粋関数だけを置く。
 */

/** カウントアップ表示用に、四捨五入して ja-JP のカンマ区切り整数文字列へ整形する */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}

/** 進捗 (0..1、範囲外はクランプ) に応じて from → to を線形補間する */
export function interpolateCount(from: number, to: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return from + (to - from) * p;
}

/** data-count-to 属性の生値から目標値を読む。未設定・非有限なら null */
export function parseCountTarget(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/motion/countUp.test.ts`
Expected: PASS — 3 describe / 8 テストすべて green

- [ ] **Step 5: コミットする**

```bash
git add src/lib/motion/countUp.ts tests/unit/motion/countUp.test.ts
git commit -m "feat(motion): カウントアップ用の数値ユーティリティを追加 (ADR 0054)"
```

---

## Task 2: `homeMotionDom.ts` の定数と DOM 収集

**Files:**
- Create: `src/lib/motion/homeMotionDom.ts`
- Test: `tests/unit/motion/homeMotionDom.test.ts`

**Interfaces:**
- Consumes: `formatCount` from `src/lib/motion/countUp.ts`（Task 1）
- Produces:
  - `MOTION_FLAG_ATTR: 'data-motion'` / `MOTION_ITEM_ATTR: 'data-motion-item'` / `MOTION_GROUP_ATTR: 'data-motion-group'` / `COUNT_TARGET_ATTR: 'data-count-to'`
  - `WATCHDOG_MS: 2500`
  - `REVEAL_ROOT_MARGIN: '0px 0px -15% 0px'`
  - `interface RevealSpec { from: Record<string, number>; duration: number; stagger: number }`
  - `REVEAL_SPECS: Record<string, RevealSpec>` / `REVEAL_GROUP_KEYS: readonly string[]`
  - `revealTo(spec: RevealSpec): Record<string, number>`
  - `isMotionEnabled(root: Element): boolean`
  - `disableMotion(root: Element): void`
  - `collectGroup(scope: ParentNode, key: string): HTMLElement[]`
  - `interface RevealGroup { key: string; spec: RevealSpec; elements: HTMLElement[] }`
  - `collectRevealGroups(scope: ParentNode): RevealGroup[]`
  - `releaseGroup(elements: readonly Element[]): void`
  - `countTargetsIn(elements: readonly HTMLElement[]): HTMLElement[]`
  - `applyCount(el: Element, value: number): void`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/motion/homeMotionDom.test.ts` を新規作成する。

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MOTION_FLAG_ATTR,
  MOTION_ITEM_ATTR,
  REVEAL_SPECS,
  REVEAL_GROUP_KEYS,
  revealTo,
  isMotionEnabled,
  disableMotion,
  collectGroup,
  collectRevealGroups,
  releaseGroup,
  countTargetsIn,
  applyCount,
} from '../../../src/lib/motion/homeMotionDom';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute(MOTION_FLAG_ATTR);
});

describe('REVEAL_SPECS / revealTo', () => {
  it('REVEAL_GROUP_KEYS は REVEAL_SPECS のキーと一致する', () => {
    expect([...REVEAL_GROUP_KEYS].toSorted()).toEqual(Object.keys(REVEAL_SPECS).toSorted());
  });

  it('from に y があれば to に y:0 を、scale があれば scale:1 を含める', () => {
    expect(revealTo({ from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.08 }))
      .toEqual({ opacity: 1, y: 0 });
    expect(revealTo({ from: { opacity: 0, scale: 0.9 }, duration: 0.4, stagger: 0.04 }))
      .toEqual({ opacity: 1, scale: 1 });
    expect(revealTo({ from: { opacity: 0 }, duration: 0.3, stagger: 0 }))
      .toEqual({ opacity: 1 });
  });
});

describe('isMotionEnabled / disableMotion', () => {
  it('フラグが on のときだけ true', () => {
    expect(isMotionEnabled(document.documentElement)).toBe(false);
    document.documentElement.setAttribute(MOTION_FLAG_ATTR, 'on');
    expect(isMotionEnabled(document.documentElement)).toBe(true);
    document.documentElement.setAttribute(MOTION_FLAG_ATTR, 'off');
    expect(isMotionEnabled(document.documentElement)).toBe(false);
  });

  it('disableMotion はフラグを外す', () => {
    document.documentElement.setAttribute(MOTION_FLAG_ATTR, 'on');
    disableMotion(document.documentElement);
    expect(document.documentElement.hasAttribute(MOTION_FLAG_ATTR)).toBe(false);
  });
});

describe('collectGroup', () => {
  it('指定キーの要素を DOM 順で集める', () => {
    const host = mount(`
      <a data-motion-group="hero-bar" id="a"></a>
      <a data-motion-group="other" id="x"></a>
      <a data-motion-group="hero-bar" id="b"></a>
    `);
    expect(collectGroup(host, 'hero-bar').map((el) => el.id)).toEqual(['a', 'b']);
  });

  it('該当なしなら空配列', () => {
    expect(collectGroup(mount('<p></p>'), 'hero-bar')).toEqual([]);
  });
});

describe('collectRevealGroups', () => {
  it('要素が存在するグループだけを spec 付きで返す', () => {
    const host = mount(`
      <li data-motion-group="event-item" id="e1"></li>
      <li data-motion-group="event-item" id="e2"></li>
      <span data-motion-group="rarity-chip" id="r1"></span>
    `);
    const groups = collectRevealGroups(host);
    expect(groups.map((g) => g.key).toSorted()).toEqual(['event-item', 'rarity-chip']);
    const eventGroup = groups.find((g) => g.key === 'event-item')!;
    expect(eventGroup.elements.map((el) => el.id)).toEqual(['e1', 'e2']);
    expect(eventGroup.spec).toBe(REVEAL_SPECS['event-item']);
  });

  it('ヒーローなど初回タイムライン側のキーは含めない', () => {
    const host = mount('<h1 data-motion-group="hero-text"></h1>');
    expect(collectRevealGroups(host)).toEqual([]);
  });
});

describe('releaseGroup', () => {
  it('data-motion-item を全要素から外す', () => {
    const host = mount('<a data-motion-item id="a"></a><a data-motion-item id="b"></a>');
    const els = [...host.querySelectorAll('a')];
    releaseGroup(els);
    expect(els.every((el) => !el.hasAttribute(MOTION_ITEM_ATTR))).toBe(true);
  });

  it('空配列でも例外にならない', () => {
    expect(() => releaseGroup([])).not.toThrow();
  });
});

describe('countTargetsIn', () => {
  it('自身と子孫の data-count-to を集める', () => {
    const host = mount(`
      <a id="chip"><span data-count-to="2689" id="n1"></span></a>
      <span data-count-to="12" id="n2"></span>
    `);
    const roots = [host.querySelector<HTMLElement>('#chip')!, host.querySelector<HTMLElement>('#n2')!];
    expect(countTargetsIn(roots).map((el) => el.id)).toEqual(['n1', 'n2']);
  });

  it('対象が無ければ空配列', () => {
    const host = mount('<a id="chip"></a>');
    expect(countTargetsIn([host.querySelector<HTMLElement>('#chip')!])).toEqual([]);
  });
});

describe('applyCount', () => {
  it('整形した文字列を textContent に書く', () => {
    const host = mount('<span data-count-to="2689">0</span>');
    const el = host.querySelector('span')!;
    applyCount(el, 1234.7);
    expect(el.textContent).toBe('1,235');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/motion/homeMotionDom.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/lib/motion/homeMotionDom"`

- [ ] **Step 3: 最小の実装を書く**

`src/lib/motion/homeMotionDom.ts` を新規作成する。

```ts
/**
 * トップページのモーション用 DOM ヘルパーと演出パラメータ (ADR 0054)。
 * GSAP には依存しない。判定ロジックはすべてここに置き、homeMotion.ts は薄く保つ。
 */
import { formatCount } from './countUp';

/** <html> に立つモーション有効フラグ。BaseLayout の <head> インラインスクリプトが付与する */
export const MOTION_FLAG_ATTR = 'data-motion';
/** 初期非表示の対象マーカー。トゥイーン完了時に外す */
export const MOTION_ITEM_ATTR = 'data-motion-item';
/** stagger をまとめる単位のキー */
export const MOTION_GROUP_ATTR = 'data-motion-group';
/** カウントアップの目標値 */
export const COUNT_TARGET_ATTR = 'data-count-to';

/** タイムラインが開始されないまま経過したらフラグを強制解除するまでの時間 (ms) */
export const WATCHDOG_MS = 2500;
/** 画面下から 15% 入った時点でスクロール登場を発火させる */
export const REVEAL_ROOT_MARGIN = '0px 0px -15% 0px';

export interface RevealSpec {
  /** GSAP の fromTo に渡す開始値 */
  from: Record<string, number>;
  /** 1 要素あたりの再生時間 (秒) */
  duration: number;
  /** グループ内の遅延 (秒) */
  stagger: number;
}

/**
 * スクロール登場グループの演出パラメータ。
 * 初回タイムライン側 (hero-text / hero-bar / hero-unit / stat-chip) はここに含めない。
 */
export const REVEAL_SPECS: Record<string, RevealSpec> = {
  'event-item': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.08 },
  'feature-0': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.05 },
  'feature-1': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.05 },
  'feature-2': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.05 },
  'rarity-chip': { from: { opacity: 0, scale: 0.9 }, duration: 0.4, stagger: 0.04 },
  // テキストの塊は読み始めを妨げないよう stagger しない
  'text-section': { from: { opacity: 0, y: 12 }, duration: 0.5, stagger: 0 },
};

export const REVEAL_GROUP_KEYS: readonly string[] = Object.keys(REVEAL_SPECS);

/** from に含まれるキーに対応する終了値だけを組み立てる */
export function revealTo(spec: RevealSpec): Record<string, number> {
  const to: Record<string, number> = { opacity: 1 };
  if ('y' in spec.from) to.y = 0;
  if ('scale' in spec.from) to.scale = 1;
  return to;
}

/** <html> のモーションフラグが立っているか */
export function isMotionEnabled(root: Element): boolean {
  return root.getAttribute(MOTION_FLAG_ATTR) === 'on';
}

/** フラグを外して、隠れている要素をすべて可視へ戻す (失敗時のフェイルセーフ) */
export function disableMotion(root: Element): void {
  root.removeAttribute(MOTION_FLAG_ATTR);
}

/** 指定キーの要素を DOM 順で集める。DOM 順がそのまま stagger 順になる */
export function collectGroup(scope: ParentNode, key: string): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(`[${MOTION_GROUP_ATTR}="${key}"]`)];
}

export interface RevealGroup {
  key: string;
  spec: RevealSpec;
  elements: HTMLElement[];
}

/** スクロール登場の対象グループを、要素が 1 つ以上あるものだけ集める */
export function collectRevealGroups(scope: ParentNode): RevealGroup[] {
  const groups: RevealGroup[] = [];
  for (const key of REVEAL_GROUP_KEYS) {
    const elements = collectGroup(scope, key);
    if (elements.length > 0) groups.push({ key, spec: REVEAL_SPECS[key], elements });
  }
  return groups;
}

/** 再生済みの要素を初期非表示ルールの対象から永久に外す */
export function releaseGroup(elements: readonly Element[]): void {
  for (const el of elements) el.removeAttribute(MOTION_ITEM_ATTR);
}

/** 与えられた要素の自身と子孫から、カウントアップ対象を DOM 順で集める */
export function countTargetsIn(elements: readonly HTMLElement[]): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const el of elements) {
    if (el.hasAttribute(COUNT_TARGET_ATTR)) found.push(el);
    found.push(...el.querySelectorAll<HTMLElement>(`[${COUNT_TARGET_ATTR}]`));
  }
  return found;
}

/** カウントアップの途中値・最終値を要素へ書き込む */
export function applyCount(el: Element, value: number): void {
  el.textContent = formatCount(value);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/motion/homeMotionDom.test.ts`
Expected: PASS — 7 describe / 14 テストすべて green

- [ ] **Step 5: コミットする**

```bash
git add src/lib/motion/homeMotionDom.ts tests/unit/motion/homeMotionDom.test.ts
git commit -m "feat(motion): トップページモーションの DOM ヘルパーと演出パラメータを追加 (ADR 0054)"
```

---

## Task 3: IntersectionObserver の登録ロジック

**Files:**
- Modify: `src/lib/motion/homeMotionDom.ts`（末尾に追加）
- Test: `tests/unit/motion/homeMotionDom.test.ts`（末尾に追加）

**Interfaces:**
- Consumes: `RevealGroup` / `REVEAL_ROOT_MARGIN` from `homeMotionDom.ts`（Task 2）
- Produces:
  - `type ObserverFactory = (cb: IntersectionObserverCallback, options: IntersectionObserverInit) => IntersectionObserver`
  - `observeRevealGroups(groups: RevealGroup[], createObserver: ObserverFactory, onReveal: (group: RevealGroup) => void): IntersectionObserver | null`

jsdom は `IntersectionObserver` を実装していない。そのため観測子はファクトリ経由で注入し、テストでは偽物を渡す。本番の呼び出し側（Task 5）が `(cb, options) => new IntersectionObserver(cb, options)` を渡す。

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/motion/homeMotionDom.test.ts` の既存 import に `observeRevealGroups` と `REVEAL_ROOT_MARGIN` を追加し、ファイル末尾に次を追記する。

```ts
import type { RevealGroup } from '../../../src/lib/motion/homeMotionDom';

/** jsdom には IntersectionObserver が無いので、コールバックを手動で発火できる偽物を使う */
class FakeObserver {
  observed: Element[] = [];
  unobserved: Element[] = [];
  disconnected = false;
  constructor(readonly cb: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {}
  observe(el: Element) { this.observed.push(el); }
  unobserve(el: Element) { this.unobserved.push(el); }
  disconnect() { this.disconnected = true; }
  /** bottom を負にすると「スクロールで画面上方へ抜けた要素」を再現できる */
  fire(el: Element, isIntersecting: boolean, bottom = 100) {
    this.cb(
      [{ target: el, isIntersecting, boundingClientRect: { bottom } } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function makeGroup(key: string, ids: string[]): { group: RevealGroup; els: HTMLElement[] } {
  const host = mount(ids.map((id) => `<div data-motion-group="${key}" id="${id}"></div>`).join(''));
  const els = collectGroup(host, key);
  return { group: { key, spec: REVEAL_SPECS[key], elements: els }, els };
}

describe('observeRevealGroups', () => {
  it('各グループの先頭要素だけを観測し、rootMargin を渡す', () => {
    const a = makeGroup('event-item', ['e1', 'e2']);
    const b = makeGroup('rarity-chip', ['r1']);
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group, b.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      () => {},
    );
    expect(created!.observed.map((el) => el.id)).toEqual(['e1', 'r1']);
    expect(created!.options.rootMargin).toBe(REVEAL_ROOT_MARGIN);
  });

  it('交差したグループだけ onReveal を呼び、その要素の観測をやめる', () => {
    const a = makeGroup('event-item', ['e1']);
    const b = makeGroup('rarity-chip', ['r1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group, b.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], true);
    expect(revealed).toEqual(['event-item']);
    expect(created!.unobserved.map((el) => el.id)).toEqual(['e1']);
    expect(created!.disconnected).toBe(false);
  });

  it('画面上方へ抜けた要素 (bottom <= 0) も再生する', () => {
    // 最下部へ一気にスクロールした場合、対象は交差せず画面より上に居る。
    // ここを拾わないと data-motion-item が残り続けて要素が永久に隠れる。
    const a = makeGroup('event-item', ['e1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], false, -10);
    expect(revealed).toEqual(['event-item']);
    expect(created!.disconnected).toBe(true);
  });

  it('交差しておらず画面下に居るエントリは無視する', () => {
    const a = makeGroup('event-item', ['e1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], false, 800);
    expect(revealed).toEqual([]);
    expect(created!.disconnected).toBe(false);
  });

  it('同じ要素が二度発火しても onReveal は一度だけ', () => {
    const a = makeGroup('event-item', ['e1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], true);
    created!.fire(a.els[0], true);
    expect(revealed).toEqual(['event-item']);
  });

  it('全グループが再生されたら disconnect する', () => {
    const a = makeGroup('event-item', ['e1']);
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      () => {},
    );
    created!.fire(a.els[0], true);
    expect(created!.disconnected).toBe(true);
  });

  it('グループが空なら観測子を作らず null を返す', () => {
    let calls = 0;
    const result = observeRevealGroups([], () => { calls += 1; return null as unknown as IntersectionObserver; }, () => {});
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/motion/homeMotionDom.test.ts`
Expected: FAIL — `observeRevealGroups is not a function`（または import エラー）

- [ ] **Step 3: 最小の実装を書く**

`src/lib/motion/homeMotionDom.ts` の末尾に追記する。

```ts
/** IntersectionObserver の生成を注入するためのファクトリ (jsdom には実装が無いためテストで差し替える) */
export type ObserverFactory = (
  cb: IntersectionObserverCallback,
  options: IntersectionObserverInit,
) => IntersectionObserver;

/**
 * 各グループの先頭要素を観測し、画面に入った時点で onReveal を 1 回だけ呼ぶ。
 * 一気にスクロールされて画面上方へ抜けた要素も取りこぼさない。
 * 発火した要素は unobserve し、全グループを消化したら disconnect する。
 */
export function observeRevealGroups(
  groups: RevealGroup[],
  createObserver: ObserverFactory,
  onReveal: (group: RevealGroup) => void,
): IntersectionObserver | null {
  if (groups.length === 0) return null;

  const pending = new Map<Element, RevealGroup>();
  for (const group of groups) pending.set(group.elements[0], group);

  const observer = createObserver((entries, self) => {
    for (const entry of entries) {
      // 画面内に入った場合に加え、最下部へ一気にスクロールされて画面上方へ
      // 抜けてしまった場合 (bottom <= 0) も再生する。これを拾わないと
      // data-motion-item が残り続け、要素が永久に隠れたままになる。
      const passedAbove = entry.boundingClientRect.bottom <= 0;
      if (!entry.isIntersecting && !passedAbove) continue;
      const group = pending.get(entry.target);
      if (!group) continue;
      pending.delete(entry.target);
      self.unobserve(entry.target);
      onReveal(group);
    }
    if (pending.size === 0) self.disconnect();
  }, { rootMargin: REVEAL_ROOT_MARGIN });

  for (const target of pending.keys()) observer.observe(target);
  return observer;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/motion/`
Expected: PASS — Task 1〜3 の全テストが green

- [ ] **Step 5: カバレッジが 95% を割っていないことを確認する**

Run: `npm run coverage`
Expected: `src/lib/motion/countUp.ts` と `src/lib/motion/homeMotionDom.ts` が 100%、全体のしきい値 4 指標すべて 95% 以上。

> Node 22 で実行すること。Node 25 では無関係な既存 22 テストが落ちる（Global Constraints 参照）。

- [ ] **Step 6: コミットする**

```bash
git add src/lib/motion/homeMotionDom.ts tests/unit/motion/homeMotionDom.test.ts
git commit -m "feat(motion): スクロール登場の IntersectionObserver 登録を追加 (ADR 0054)"
```

---

## Task 4: モーションフラグの基盤（CSS + BaseLayout）

**Files:**
- Modify: `src/styles/global.css`（末尾に追加）
- Modify: `src/layouts/BaseLayout.astro:88` の直後
- Test: 手動確認（E2E は Task 7）

**Interfaces:**
- Consumes: `MOTION_FLAG_ATTR` / `MOTION_ITEM_ATTR` の値（Task 2 で定義した文字列と一致させること）
- Produces: `<html data-motion="on">` フラグと `[data-motion='on'] [data-motion-item] { opacity: 0 }` ルール

この時点ではまだ `data-motion-item` を持つ要素が存在しないため、見た目は一切変わらない。**先に安全網だけを敷いておくのが目的。**

- [ ] **Step 1: `global.css` に初期非表示ルールを追加する**

`src/styles/global.css` の末尾（`@media (prefers-reduced-motion: reduce)` ブロックの後）に追記する。

```css

/* ============================================================
   トップページのモーション初期状態 (ADR 0054)

   data-motion="on" は BaseLayout の <head> インラインスクリプトが
   prefers-reduced-motion でない場合にのみ付与する。JS 無効・モーション
   低減・スクリプト取得失敗・例外のいずれでもフラグが立たない/外れるため、
   要素は通常どおり可視のまま残る。「動かない」ことはあっても
   「見えない」ことは起きない。

   GSAP は inline style の opacity を書くため、このルールより優先される。
   再生済みの要素は data-motion-item 属性ごと外して対象から永久に抜く。
   ============================================================ */
[data-motion='on'] [data-motion-item] {
  opacity: 0;
}
```

- [ ] **Step 2: `BaseLayout.astro` の `<head>` にフラグ判定を追加する**

`src/layouts/BaseLayout.astro` の 88 行目 `<meta name="theme-color" content="#14151A" />` の直後に挿入する。

```astro
    <!--
      モーション有効フラグ (ADR 0054)。ネットワーク不要のインラインで、body 描画前に確定させる。
      prefers-reduced-motion / JS 無効ではフラグが立たず、global.css の初期非表示ルールも効かない。
    -->
    <script is:inline>
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.setAttribute('data-motion', 'on');
      }
    </script>
```

- [ ] **Step 3: dev サーバーで既存表示が壊れていないことを確認する**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
```
Expected: `200`

ブラウザまたは Playwright MCP で `http://localhost:4321/` を開き、次を確認する。

- `<html>` に `data-motion="on"` が付いている
- トップページの見た目が変更前と同一（まだ `data-motion-item` を持つ要素が無いため）

- [ ] **Step 4: 型チェックとリントを通す**

Run: `npm run typecheck && npm run lint`
Expected: エラーなし

- [ ] **Step 5: コミットする**

```bash
git add src/styles/global.css src/layouts/BaseLayout.astro
git commit -m "feat(motion): モーション有効フラグと初期非表示ルールを追加 (ADR 0054)"
```

---

## Task 5: GSAP 導入とヒーロー／統計チップのタイムライン

**Files:**
- Modify: `package.json`（`gsap` 追加）
- Create: `src/lib/motion/homeMotion.ts`
- Modify: `src/components/CharacterColorHero.svelte`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `countUp.ts`（Task 1）、`homeMotionDom.ts`（Task 2, 3）のすべての公開関数
- Produces: `initHomeMotion(): void` — `index.astro` の `<script>` から呼ぶ唯一のエントリポイント

- [ ] **Step 1: GSAP をインストールする**

```bash
npm install gsap
```

Expected: `package.json` の `dependencies` に `"gsap": "^3.15.0"` が入り、`package-lock.json` が更新される。

- [ ] **Step 2: `homeMotion.ts` を作成する**

`src/lib/motion/homeMotion.ts` を新規作成する。

```ts
/**
 * トップページのモーション本体 (ADR 0054)。
 *
 * GSAP を import するのはこのファイルだけ。実ブラウザと GSAP に依存するため
 * カバレッジ計測から除外し、検証は E2E (tests/home-motion.test.ts) で行う。
 * 判定ロジックは countUp.ts / homeMotionDom.ts に置き、ここは薄く保つこと。
 */
import { gsap } from 'gsap';
import { interpolateCount, parseCountTarget } from './countUp';
import {
  COUNT_TARGET_ATTR,
  WATCHDOG_MS,
  applyCount,
  collectGroup,
  collectRevealGroups,
  countTargetsIn,
  disableMotion,
  isMotionEnabled,
  observeRevealGroups,
  releaseGroup,
  revealTo,
  type RevealGroup,
} from './homeMotionDom';

/* v8 ignore start -- GSAP ブートストラップ (実ブラウザ専用、node/jsdom 単体テスト不可。E2E で検証) */

/** カウントアップの再生時間 (秒) */
const COUNT_DURATION = 0.8;

/** 対象が空のまま GSAP へ渡すと "target not found" 警告が出るため弾く */
function hasTargets(elements: readonly HTMLElement[]): boolean {
  return elements.length > 0;
}

/** 対象要素の中の data-count-to をすべてカウントアップさせる */
function countUpIn(elements: HTMLElement[]): void {
  for (const el of countTargetsIn(elements)) {
    const to = parseCountTarget(el.getAttribute(COUNT_TARGET_ATTR));
    if (to === null) continue;
    const state = { progress: 0 };
    gsap.to(state, {
      progress: 1,
      duration: COUNT_DURATION,
      ease: 'power2.out',
      onUpdate: () => applyCount(el, interpolateCount(0, to, state.progress)),
      onComplete: () => applyCount(el, to),
    });
  }
}

/** スクロールで画面に入ったグループを再生し、完了後にカウントアップへ繋ぐ */
function revealGroup(group: RevealGroup): void {
  if (!hasTargets(group.elements)) return;
  gsap.fromTo(group.elements, group.spec.from, {
    ...revealTo(group.spec),
    duration: group.spec.duration,
    stagger: group.spec.stagger,
    ease: 'power2.out',
    onComplete: () => {
      releaseGroup(group.elements);
      countUpIn(group.elements);
    },
  });
}

/** トップページのモーションを開始する。index.astro の <script> から 1 回だけ呼ぶ */
export function initHomeMotion(): void {
  const root = document.documentElement;
  if (!isMotionEnabled(root)) return;

  // タイムライン構築中に例外が出ても要素が隠れたままにならないようにする保険
  const watchdog = window.setTimeout(() => disableMotion(root), WATCHDOG_MS);

  try {
    const heroText = collectGroup(document, 'hero-text');
    const heroBar = collectGroup(document, 'hero-bar');
    const heroUnit = collectGroup(document, 'hero-unit');
    const statChip = collectGroup(document, 'stat-chip');

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    if (hasTargets(heroText)) tl.fromTo(heroText,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, onComplete: () => releaseGroup(heroText) },
      0);

    // 16 色バーが左から順に立ち上がるのがこの演出の主役 (ADR 0047 のアイデンティティ)
    if (hasTargets(heroBar)) tl.fromTo(heroBar,
      { opacity: 0, scaleY: 0.15 },
      { opacity: 1, scaleY: 1, transformOrigin: 'bottom', duration: 0.4, stagger: 0.025, onComplete: () => releaseGroup(heroBar) },
      0.12);

    if (hasTargets(heroUnit)) tl.fromTo(heroUnit,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, onComplete: () => releaseGroup(heroUnit) },
      0.45);

    if (hasTargets(statChip)) tl.fromTo(statChip,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, onComplete: () => releaseGroup(statChip) },
      0.5);

    tl.add(() => countUpIn(statChip), 0.55);

    observeRevealGroups(
      collectRevealGroups(document),
      (cb, options) => new IntersectionObserver(cb, options),
      revealGroup,
    );

    window.clearTimeout(watchdog);
  } catch {
    window.clearTimeout(watchdog);
    disableMotion(root);
  }
}

/* v8 ignore stop */
```

- [ ] **Step 3: `CharacterColorHero.svelte` に data 属性を付ける**

`src/components/CharacterColorHero.svelte` の `<h1>` / `<p>` / セグメント `<a>` / ユニットラベル `<div>` に属性を追加する。**マークアップ構造とクラスは変えない。**

変更前:
```svelte
    <h1 class="text-display text-2xl font-bold text-white">{SITE_NAME}</h1>
    <p class="mt-1.5 text-sm text-gray-300">
```
変更後:
```svelte
    <h1 data-motion-item data-motion-group="hero-text" class="text-display text-2xl font-bold text-white">{SITE_NAME}</h1>
    <p data-motion-item data-motion-group="hero-text" class="mt-1.5 text-sm text-gray-300">
```

変更前:
```svelte
            <a
              href={`${base}cards/?char=${encodeURIComponent(member)}`}
              class="h-9 flex-1 pressable transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
```
変更後:
```svelte
            <a
              data-motion-item
              data-motion-group="hero-bar"
              href={`${base}cards/?char=${encodeURIComponent(member)}`}
              class="h-9 flex-1 pressable transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
```

変更前:
```svelte
        <div class="mt-1.5 truncate text-[10px] tracking-wide text-gray-400">{group.name}</div>
```
変更後:
```svelte
        <div data-motion-item data-motion-group="hero-unit" class="mt-1.5 truncate text-[10px] tracking-wide text-gray-400">{group.name}</div>
```

- [ ] **Step 4: `index.astro` の統計チップに data 属性と sr-only を付ける**

`src/pages/index.astro` の統計チップブロック（78〜89 行目付近）を差し替える。

変更前:
```astro
  <div class="flex flex-wrap gap-3 mt-4 mb-6">
    {stats.map((s) => (
      <a href={s.href}
         class="flex items-baseline gap-1.5 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 hover:border-chrome-ink transition-colors">
        <span class="text-xs text-gray-500">{s.label}</span>
        <span class="text-xl font-bold tabular-nums text-gray-900">{s.value.toLocaleString('ja-JP')}</span>
        <span class="text-xs text-gray-500">{s.unit}</span>
      </a>
    ))}
  </div>
```
変更後:
```astro
  <div class="flex flex-wrap gap-3 mt-4 mb-6">
    {stats.map((s) => (
      <a href={s.href}
         data-motion-item
         data-motion-group="stat-chip"
         class="flex items-baseline gap-1.5 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 hover:border-chrome-ink transition-colors">
        <span class="text-xs text-gray-500">{s.label}</span>
        {/* カウントアップ中の途中値を読み上げさせないため、視覚側は aria-hidden にして確定値を sr-only で提供する */}
        <span class="text-xl font-bold tabular-nums text-gray-900" aria-hidden="true" data-count-to={s.value}>{s.value.toLocaleString('ja-JP')}</span>
        <span class="text-xs text-gray-500" aria-hidden="true">{s.unit}</span>
        <span class="sr-only">{s.value.toLocaleString('ja-JP')}{s.unit}</span>
      </a>
    ))}
  </div>
```

- [ ] **Step 5: `index.astro` の末尾に `<script>` を追加する**

`</BaseLayout>` の直前に追記する。

```astro
  <script>
    import { initHomeMotion } from '../lib/motion/homeMotion.ts';
    initHomeMotion();
  </script>
```

- [ ] **Step 6: dev サーバーで動作を確認する**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
```

ブラウザまたは Playwright MCP で `http://localhost:4321/` を開き、次を目視確認する。

- サイト名と説明文が下から浮き上がる
- 16 色バーが**左から順に**下端を軸に立ち上がる
- ユニット名ラベルが遅れてフェードインする
- 統計チップ 3 個が浮き上がり、数値が 0 から最終値までカウントアップする
- 全体が 1 秒程度で落ち着き、その後は静止する

スクリーンショットを `tmp/` に保存してユーザーに提示する。

- [ ] **Step 7: reduced-motion で演出が止まることを確認する**

DevTools の Rendering パネルで `prefers-reduced-motion: reduce` をエミュレートしてリロードし、次を確認する。

- `<html>` に `data-motion` が付かない
- ヒーローと統計チップが最初から可視で、数値は最終値のまま

- [ ] **Step 8: 型チェックとリントを通す**

Run: `npm run typecheck && npm run lint`
Expected: エラーなし

- [ ] **Step 9: コミットする**

```bash
git add package.json package-lock.json src/lib/motion/homeMotion.ts src/components/CharacterColorHero.svelte src/pages/index.astro
git commit -m "feat(motion): GSAP を導入しヒーローと統計チップの登場演出を追加 (ADR 0054)"
```

---

## Task 6: スクロール登場とカウントアップの適用

**Files:**
- Modify: `src/components/EventCountdown.svelte`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `REVEAL_SPECS` のキー（`event-item` / `feature-0` / `feature-1` / `feature-2` / `rarity-chip` / `text-section`）。**マークアップ側のキーは Task 2 の `REVEAL_SPECS` と完全に一致させること。**
- Produces: なし（マークアップのみ）

- [ ] **Step 1: `EventCountdown.svelte` の `<li>` に data 属性を付ける**

変更前:
```svelte
        <li class="event-item surface-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
```
変更後:
```svelte
        <li data-motion-item data-motion-group="event-item" class="event-item surface-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
```

- [ ] **Step 2: `index.astro` の機能カードに data 属性と sr-only を付ける**

`{categories.map((cat) => (` を `{categories.map((cat, ci) => (` に変え、カード `<a>` と stat 部分を差し替える。

変更前:
```astro
    {categories.map((cat) => (
      <div class="mb-6">
        <h3 class="text-sm font-semibold text-gray-600 mb-2">{cat.heading}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cat.cards.map((c) => (
            <a href={c.href}
               class="block surface-card border-l-4 border-chrome-ink p-5 hover:shadow-card-hover transition-shadow">
              <h4 class="text-base font-semibold text-gray-900 mb-1">{c.title}</h4>
              <p class="text-xs text-gray-600">{c.desc}</p>
              {c.stat && (
                <div class="text-2xl font-bold tabular-nums text-gray-800 mt-3">{c.stat.value.toLocaleString('ja-JP')}<span class="text-sm text-gray-500 ml-1">{c.stat.unit}</span></div>
              )}
            </a>
          ))}
        </div>
      </div>
    ))}
```
変更後:
```astro
    {categories.map((cat, ci) => (
      <div class="mb-6">
        <h3 class="text-sm font-semibold text-gray-600 mb-2">{cat.heading}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cat.cards.map((c) => (
            <a href={c.href}
               data-motion-item
               data-motion-group={`feature-${ci}`}
               class="block surface-card border-l-4 border-chrome-ink p-5 hover:shadow-card-hover transition-shadow">
              <h4 class="text-base font-semibold text-gray-900 mb-1">{c.title}</h4>
              <p class="text-xs text-gray-600">{c.desc}</p>
              {c.stat && (
                <div class="mt-3">
                  {/* 数値だけを data-count-to の対象にする。既存 E2E が読む .text-2xl の textContent は変えない */}
                  <div class="text-2xl font-bold tabular-nums text-gray-800" aria-hidden="true"><span data-count-to={c.stat.value}>{c.stat.value.toLocaleString('ja-JP')}</span><span class="text-sm text-gray-500 ml-1">{c.stat.unit}</span></div>
                  <span class="sr-only">{c.stat.value.toLocaleString('ja-JP')}{c.stat.unit}</span>
                </div>
              )}
            </a>
          ))}
        </div>
      </div>
    ))}
```

> **重要:** `categories` は 3 要素（`データベース` / `スコア計算ツール` / `登録・管理`）なので `ci` は 0..2 となり、`REVEAL_SPECS` の `feature-0` / `feature-1` / `feature-2` と一致する。カテゴリを増やす場合は `REVEAL_SPECS` にもキーを追加すること。

- [ ] **Step 3: `index.astro` の衣装内訳チップに data 属性・`tabular-nums`・sr-only を付ける**

変更前:
```astro
          <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-sm">
            <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white ${RARITY_BADGE_CLASSES[rarity] ?? 'bg-gray-400'}`}>{rarity}</span>
            <span class="text-gray-700">{count}<span class="text-xs text-gray-500 ml-0.5">枚</span></span>
          </span>
```
変更後:
```astro
          <span data-motion-item
                data-motion-group="rarity-chip"
                class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-sm">
            <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white ${RARITY_BADGE_CLASSES[rarity] ?? 'bg-gray-400'}`}>{rarity}</span>
            <span class="text-gray-700 tabular-nums" aria-hidden="true"><span data-count-to={count}>{count}</span><span class="text-xs text-gray-500 ml-0.5">枚</span></span>
            <span class="sr-only">{count}枚</span>
          </span>
```

> `tabular-nums` は桁が動いても幅が揺れないようにするため（spec の指定）。`RARITY_BADGE_CLASSES` の色は変更しない（ADR 0047 の 3 チャンネル規約の対象外）。

- [ ] **Step 4: `index.astro` のテキストセクション 4 つに data 属性を付ける**

謝辞・お問い合わせ・プライバシー・免責事項の各 `<section>` に属性を追加する。**クラスは変えない。**

```astro
  <!-- 謝辞 -->
  <section data-motion-item data-motion-group="text-section" class="surface-card p-6 mb-6">
```
```astro
  <!-- お問い合わせ -->
  <section data-motion-item data-motion-group="text-section" class="surface-card p-6 mb-6">
```
```astro
  <!-- プライバシー -->
  <section data-motion-item data-motion-group="text-section" class="surface-card p-6 mb-6">
```
```astro
  <!-- 免責事項・権利表記 -->
  <section data-motion-item data-motion-group="text-section" class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
```

- [ ] **Step 5: dev サーバーでスクロール登場を確認する**

`http://localhost:4321/` をゆっくりスクロールし、次を目視確認する。

- イベントカードが下から浮き上がる
- 機能カードがカテゴリごとに順に浮き上がり、`衣装一覧` / `楽曲一覧` / `イベント情報` の数値がカウントアップする
- 衣装内訳のレアリティチップが小さく弾んで現れ、各枚数がカウントアップする
- 謝辞以降のテキストセクションが 1 枚ずつ静かにフェードインする
- 一度出た要素は再スクロールしても再生されない

スクリーンショットを `tmp/` に保存してユーザーに提示する。

- [ ] **Step 6: 型チェックとリントを通す**

Run: `npm run typecheck && npm run lint`
Expected: エラーなし

- [ ] **Step 7: コミットする**

```bash
git add src/components/EventCountdown.svelte src/pages/index.astro
git commit -m "feat(motion): スクロール登場と数値カウントアップをトップページ全体へ適用 (ADR 0054)"
```

---

## Task 7: E2E テストと既存テストの安定化

**Files:**
- Create: `tests/home-motion.test.ts`
- Modify: `tests/home.test.ts`
- Modify: `tests/character-color-bar.test.ts`

**Interfaces:**
- Consumes: `data-motion` / `data-motion-item` / `data-motion-group` / `data-count-to` 属性（Task 4〜6）
- Produces: なし

- [ ] **Step 1: `tests/home-motion.test.ts` を新規作成する**

```ts
import { test, expect } from '@playwright/test';

test.describe('トップページのモーション (ADR 0054)', () => {
  test('reduced-motion ではフラグが立たず、要素は最初から可視', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'on');

    const heroBar = page.locator('[data-motion-group="hero-bar"]').first();
    await expect(heroBar).toHaveCSS('opacity', '1');

    const featureCard = page.locator('[data-motion-group="feature-0"]').first();
    await expect(featureCard).toHaveCSS('opacity', '1');
  });

  test('通常時はフラグが立ち、ヒーローと統計チップが再生済みになる', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');

    // 再生が終わった要素は data-motion-item が外れる
    await expect(page.locator('[data-motion-group="hero-text"][data-motion-item]')).toHaveCount(0);
    await expect(page.locator('[data-motion-group="hero-bar"][data-motion-item]')).toHaveCount(0);
    await expect(page.locator('[data-motion-group="stat-chip"][data-motion-item]')).toHaveCount(0);

    await expect(page.locator('[data-motion-group="hero-bar"]').first()).toHaveCSS('opacity', '1');
  });

  test('統計チップの数値がカウントアップ後に最終値になる', async ({ page }) => {
    await page.goto('/');

    const num = page.locator('[data-motion-group="stat-chip"] [data-count-to]').first();
    const target = Number(await num.getAttribute('data-count-to'));
    expect(target).toBeGreaterThan(0);
    await expect(num).toHaveText(target.toLocaleString('ja-JP'));
  });

  test('最下部までスクロールすると未再生の要素が残らない', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-motion-item]')).toHaveCount(0);

    // 免責事項セクションまで到達して可視になっている
    await expect(page.locator('[data-motion-group="text-section"]').last()).toHaveCSS('opacity', '1');
  });
});
```

- [ ] **Step 2: dev サーバーを起動して新しい E2E を実行する**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
npx playwright test tests/home-motion.test.ts
```
Expected: 4 テストすべて PASS

- [ ] **Step 3: 既存の `tests/home.test.ts` を実行して落ちるか確認する**

Run: `npx playwright test tests/home.test.ts`

「衣装枚数と楽曲数が0より大きい」がカウントアップの途中値を読んで失敗する可能性がある。**失敗しても成功しても Step 4 の安定化は入れる**（タイミング依存を残さないため）。

- [ ] **Step 4: `tests/home.test.ts` を安定化する**

変更前:
```ts
  test('衣装枚数と楽曲数が0より大きい', async ({ page }) => {
    const cardCount = page.locator('a[href$="/cards/"] .text-2xl');
    const text = await cardCount.textContent();
    expect(text).toMatch(/[\d,]+\s*枚/);
    const num = Math.trunc(Number(text!.replaceAll(/[^\d]/g, '')));
    expect(num).toBeGreaterThan(0);
  });
```
変更後:
```ts
  test('衣装枚数と楽曲数が0より大きい', async ({ page }) => {
    // カウントアップ (ADR 0054) の途中値を読まないよう、最終値に落ち着くまで待つ。
    // a[href$="/cards/"] は統計チップと機能カードの 2 つに一致するため、
    // data-motion-group で機能カード側に絞らないと strict mode 違反になる。
    const numSpan = page.locator('a[href$="/cards/"][data-motion-group^="feature-"] [data-count-to]');
    const target = Number(await numSpan.getAttribute('data-count-to'));
    await expect(numSpan).toHaveText(target.toLocaleString('ja-JP'));

    const cardCount = page.locator('a[href$="/cards/"] .text-2xl');
    const text = await cardCount.textContent();
    expect(text).toMatch(/[\d,]+\s*枚/);
    const num = Math.trunc(Number(text!.replaceAll(/[^\d]/g, '')));
    expect(num).toBeGreaterThan(0);
  });
```

> `a[href$="/cards/"]` は統計チップ（`data-motion-group="stat-chip"`）と機能カード（`data-motion-group="feature-0"`）の 2 つに一致する。既存の `.text-2xl` 側は統計チップが `.text-xl` なので 1 件のままだが、`[data-count-to]` は 2 件に一致するため必ず絞り込みが要る。

- [ ] **Step 5: `tests/home.test.ts` を実行する**

Run: `npx playwright test tests/home.test.ts`
Expected: 5 テストすべて PASS

`strict mode violation` が出た場合はロケータが 2 件以上に一致している。エラーメッセージが列挙する要素を見て `data-motion-group` の絞り込みを調整すること。

- [ ] **Step 6: `tests/character-color-bar.test.ts` を安定化する**

変更前:
```ts
test('ホームのヒーローからキャラで絞り込める', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('七瀬陸の衣装一覧').click();
  await expect(page).toHaveURL(/char=/);
});
```
変更後:
```ts
test('ホームのヒーローからキャラで絞り込める', async ({ page }) => {
  await page.goto('/');
  // 16 色バーの立ち上がり (ADR 0054) が終わってからクリックする
  await expect(page.locator('[data-motion-group="hero-bar"][data-motion-item]')).toHaveCount(0);
  await page.getByLabel('七瀬陸の衣装一覧').click();
  await expect(page).toHaveURL(/char=/);
});
```

- [ ] **Step 7: トップページに関わる E2E をまとめて実行する**

Run: `npx playwright test tests/home.test.ts tests/home-motion.test.ts tests/character-color-bar.test.ts`
Expected: 全テスト PASS

- [ ] **Step 8: コミットする**

```bash
git add tests/home-motion.test.ts tests/home.test.ts tests/character-color-bar.test.ts
git commit -m "test(motion): トップページモーションの E2E を追加し既存テストを安定化 (ADR 0054)"
```

---

## Task 8: 規約の追記と本番ビルドでの最終確認

**Files:**
- Modify: `CLAUDE.md`
- 検証: `npm run preview` による本番ビルド

**Interfaces:**
- Consumes: Task 1〜7 のすべて
- Produces: なし

- [ ] **Step 1: `CLAUDE.md` のモーション規約に追記する**

「デザイン規約（apple-design / ADR 0046 / ADR 0047）」節の **モーション** の項目を差し替える。

変更前:
```markdown
- **モーション**: 新規依存を増やさない。開閉トランジションは `src/lib/motion.ts` の `materialIn`/`materialOut`（svelte/transition）、押下フィードバックは `pressable` utility を使う。ジェスチャー駆動 UI（ドラッグシート等）は導入しない
```
変更後:
```markdown
- **モーション**: 開閉トランジションは `src/lib/motion.ts` の `materialIn`/`materialOut`（svelte/transition）、押下フィードバックは `pressable` utility を使う。ジェスチャー駆動 UI（ドラッグシート等）は導入しない
  - **GSAP はトップページ専用**（`src/pages/index.astro` + `src/lib/motion/home*.ts`、ADR 0054）。他ページへ広げる場合は必ず ADR を追加すること。トップページ以外では引き続き新規モーション依存を増やさない
  - トップページの要素に付いた `data-motion-item` / `data-motion-group` / `data-count-to` は `src/lib/motion/homeMotion.ts` から参照されている。マークアップを変更する際は同ファイルと `src/lib/motion/homeMotionDom.ts` の `REVEAL_SPECS` も確認すること
  - `data-motion-group` のキーを増やす場合は `REVEAL_SPECS` にも対応する行を追加する（キーが無いグループは再生されず、要素が隠れたままになる）
```

- [ ] **Step 2: 単体テストとカバレッジを通す**

Run: `npm run test:unit && npm run coverage`
Expected: 全 PASS、しきい値 4 指標すべて 95% 以上

> Node 22 で実行すること。

- [ ] **Step 3: 本番ビルドで確認する**

Run: `npm run preview`
Timeout: **420000 ms 以上を確保する**（build 約 340 秒 + serve）

ビルド成功後、`http://localhost:4321/` を開いて次を確認する。

- 圧縮後もヒーロー・統計チップ・スクロール登場がすべて動く
- `@playform/compress` が `data-*` 属性を落としていない
- DevTools の Network で GSAP チャンクがトップページでのみ読み込まれ、`衣装一覧`（`/cards/`）など他ページでは読み込まれないこと

- [ ] **Step 4: 本番ビルドで E2E を通す**

Run: `npx playwright test`
Expected: 全テスト PASS（preview サーバーが再利用される）

- [ ] **Step 5: スクリーンショットをユーザーに提示して確認を取る**

`tmp/` に保存したトップページのスクリーンショット（初回ロード後・スクロール後）を提示し、演出の内容に問題がないか確認を取る。

- [ ] **Step 6: コミットする**

```bash
git add CLAUDE.md
git commit -m "docs: モーション規約に GSAP の適用範囲を追記 (ADR 0054)"
```

- [ ] **Step 7: PR を作成する**

```bash
git push -u origin feat/gsap-home-motion
gh pr create --base develop --title "feat: トップページに GSAP の登場演出とカウントアップを追加 (ADR 0054)" --body "$(cat <<'EOF'
## 概要

サイトの第一印象を強化するため、トップページに GSAP による登場演出と数値カウントアップを追加する。ADR 0046 §4「モーションは新規依存を増やさない」を、トップページに限って ADR 0054 で上書きする。

## 変更点

- 16 色バーが左から順に立ち上がるヒーロー演出と、統計チップの浮き上がり + カウントアップ
- イベント・機能カード・衣装内訳・テキストセクションのスクロール登場（IntersectionObserver、各要素 1 回のみ）
- `prefers-reduced-motion: reduce` ではモーションを一切実行せず最終状態を即時表示
- 初期非表示は `<html data-motion="on">` が立つときだけ有効。JS 無効・取得失敗・例外でも要素は可視のまま

## 依存とサイズ

- `gsap` を追加（gzip 約 27KB）。ScrollTrigger は導入していない
- Vite がトップページ専用チャンクへ切り出すため、他 2778 ページの追加ペイロードは 0

## テスト

- 単体: `tests/unit/motion/countUp.test.ts` / `tests/unit/motion/homeMotionDom.test.ts`
- E2E: `tests/home-motion.test.ts` を追加、`tests/home.test.ts` / `tests/character-color-bar.test.ts` を安定化

## 設計

- ADR: `docs/adr/0054-gsap-home-motion.md`
- 設計: `docs/superpowers/specs/2026-08-21-gsap-home-motion-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01EirbDuo6wr13c86LaCQ5gr
EOF
)"
```

- [ ] **Step 8: dev サーバーを停止する**

```bash
astro dev stop
```

---

## Self-Review 記録

**Spec coverage:** spec の各節と対応タスクは次の通り。

| spec の節 | 対応タスク |
| --- | --- |
| ファイル構成（3 ファイル分割） | Task 1, 2, 5 |
| Astro の `<script>` を使う | Task 5 Step 5 |
| GSAP は静的 import | Task 5 Step 2 |
| ScrollTrigger は使わない / IntersectionObserver | Task 3 |
| FOUC 対策（4 段構え） | Task 4（1, 2）/ Task 5（3 の release、4 の watchdog） |
| data 属性の役割 | Task 2（定数）/ Task 5, 6（付与） |
| 初回ロードのタイムライン | Task 5 Step 2 |
| スクロール登場 | Task 2（`REVEAL_SPECS`）/ Task 3 / Task 5（`revealGroup`）/ Task 6（属性） |
| 数値カウントアップ | Task 1 / Task 5（`countUpIn`）/ Task 6（`tabular-nums`） |
| アクセシビリティ（reduced-motion） | Task 4 Step 2 / Task 5 Step 7 / Task 7 Step 1 |
| アクセシビリティ（sr-only） | Task 5 Step 4 / Task 6 Step 2, 3 |
| パフォーマンス（transform/opacity のみ） | Task 5 Step 2（`y` / `scaleY` / `scale` / `opacity` のみ使用） |
| 単体テスト | Task 1, 2, 3 |
| E2E テスト | Task 7 Step 1 |
| 既存 E2E の安定化 | Task 7 Step 4〜6 |
| CLAUDE.md 更新 | Task 8 Step 1 |
| ADR 0054 / 0046 更新 | **コミット済み**（`c5546398`）。本計画では扱わない |

**セルフレビューで見つけて修正した欠陥:**

1. **最下部へ一気にスクロールすると要素が永久に隠れる。** IntersectionObserver は「画面より上へ抜けた要素」を `isIntersecting: false` として報告するため、初稿の実装ではそれらのグループが一度も再生されず `data-motion-item` が残り続けた。リロード時のスクロール位置復元やアンカーリンクでも同じ事故が起きる。`boundingClientRect.bottom <= 0` を再生条件に加え、Task 3 に専用のテストを追加した。spec 側にも設計として追記した。
2. **既存 E2E の安定化ロケータが strict mode 違反になる。** `a[href$="/cards/"] [data-count-to]` は統計チップと機能カードの 2 つに一致する。Task 7 で最初から `[data-motion-group^="feature-"]` で絞る形に直した。
3. **空配列を GSAP に渡していた。** `EventCountdown` は開催中・次回イベントが無ければ何も描画しない（`{#if events.length > 0}`）。対象ゼロのまま `gsap.fromTo` を呼ぶと警告が出るため、`hasTargets()` ガードを入れた。

**未解決として残した spec 項目:**

- **`will-change` の明示的な付与と除去**（spec「パフォーマンス」）は実装しない。GSAP は `transform` / `opacity` のトゥイーン時に自動で合成レイヤーを立てるため、手動の `will-change` 管理は二重になる。**16 セグメントに常時 `will-change` を付けないという意図は満たされている。** 実測で問題が出た場合のみ追加する。
