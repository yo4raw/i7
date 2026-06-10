# Phase 0: 安全網整備 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リファクタリング前に現在の挙動をテストで固定する（スペック: `docs/superpowers/specs/2026-06-10-phased-refactoring-design.md` の Phase 0）。

**Architecture:** 実装コードは一切変更しない。単体テスト 3 ファイル（Vitest、`tests/unit/` 配下）と E2E テスト 2 ファイル（Playwright、`tests/` 直下）を追加する。すべて**特性テスト（characterization test）**であり、期待値は現行実装の挙動から導出済み — テストは最初から PASS するのが正しい（TDD の red-green は適用しない）。FAIL した場合は期待値の導出ミスか実装の発見的バグなので、実装を変更せず期待値を実態に合わせて修正し、想定外の挙動はタスク報告に明記する。

**Tech Stack:** Vitest 4（`npm run test:unit`、設定 `vitest.config.ts`、include は `tests/unit/**/*.test.ts`）/ Playwright 1.60（`npm run test`、`playwright.config.ts`、baseURL `http://localhost:4321`、preview サーバー自動起動 = build 込みで初回 10〜15 分）。

**事前確認済みの事実**（プラン作成時に実機検証済み。疑う必要なし）:

- フィクスチャ `tests/fixtures/index.ts` が `allCards` / `allBroachs` / `findCardById` / `findBroachsByCardId` / `findSongById` を export
- カード 2484(環/UR/Beat/IDOLiSH7・種類4ブローチ), 976(一織/UR/Melody・種類5 limit=1 melody+500), 1348(大和/UR/Melody・種類7 limit=2), 1347(一織/UR/Beat・種類6), 1349(三月/UR/Beat・種類8), 959(IDOLiSH7/UR・種類9 song=MEMORiES MELODiES score=1000) がフィクスチャに存在
- 楽曲 id=2 は MONSTER GENERATiON、id=36 は MEMORiES MELODiES
- レアリティ値は `'UR' | 'SSR' | 'SR' | 'R' | 'N'`。Shout 属性の IDOLiSH7 UR (cardID 406) と TRIGGER UR (cardID 475) が存在
- `#score-min` / `#score-max` の初期表示は `-`
- Playwright の `page.clock.setFixedTime()` は 1.60 で利用可能
- `fetchEventsCsv()` は `process.cwd()` 基準で `public/events/events.csv` を読む純 Node 関数（Playwright テストから import 可能）

**ブランチ運用:** Task 1 に着手する前に `git checkout -b test/phase0-safety-net` でブランチを作成し、Task 1〜6 のコミットはすべてこのブランチ上で行う。

---

### Task 1: eventBonusTiers の境界値テスト

**Files:**
- Create: `tests/unit/data/eventBonusTiers.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { describe, it, expect } from 'vitest';
import { isEventLive, buildLiveTierMap, type EventForBonus } from '../../../src/lib/data/eventBonusTiers';

const T = (iso: string) => Date.parse(iso);

describe('isEventLive (開催判定の境界値)', () => {
  // 開催期間: 2026-06-01 00:00 JST 〜 2026-06-08 17:00 JST
  const start = '2026-06-01';
  const end = '2026-06-08';

  it('開始時刻ちょうど (00:00:00 JST) は開催中', () => {
    expect(isEventLive(start, end, T('2026-06-01T00:00:00+09:00'))).toBe(true);
  });

  it('開始 1ms 前は開催前', () => {
    expect(isEventLive(start, end, T('2026-06-01T00:00:00+09:00') - 1)).toBe(false);
  });

  it('終了時刻ちょうど (17:00:00 JST) は終了扱い (排他的境界)', () => {
    expect(isEventLive(start, end, T('2026-06-08T17:00:00+09:00'))).toBe(false);
  });

  it('終了 1ms 前は開催中', () => {
    expect(isEventLive(start, end, T('2026-06-08T17:00:00+09:00') - 1)).toBe(true);
  });
});

describe('buildLiveTierMap (開催中イベントの特効ティアマップ)', () => {
  const liveEvent: EventForBonus = {
    id: 1,
    start_date: '2026-06-01',
    end_date: '2026-06-08',
    gold: [100],
    silver: [200],
    bronze: [300],
  };
  const endedEvent: EventForBonus = {
    id: 2,
    start_date: '2026-05-01',
    end_date: '2026-05-08',
    gold: [400],
    silver: [],
    bronze: [],
  };
  const now = T('2026-06-05T12:00:00+09:00');

  it('開催中イベントの gold/silver/bronze がマップされる', () => {
    const map = buildLiveTierMap([liveEvent], now);
    expect(map.get(100)).toBe('gold');
    expect(map.get(200)).toBe('silver');
    expect(map.get(300)).toBe('bronze');
    expect(map.get(999)).toBeUndefined();
  });

  it('開催期間外のイベントは無視される', () => {
    const map = buildLiveTierMap([endedEvent], now);
    expect(map.size).toBe(0);
  });

  it('同一カードが複数イベントに該当する場合は上位ティアが優先される', () => {
    const overlapping: EventForBonus = {
      id: 3,
      start_date: '2026-06-01',
      end_date: '2026-06-08',
      gold: [],
      silver: [100],
      bronze: [200],
    };
    const map = buildLiveTierMap([overlapping, liveEvent], now);
    expect(map.get(100)).toBe('gold');   // silver < gold
    expect(map.get(200)).toBe('silver'); // bronze < silver
  });
});
```

- [ ] **Step 2: テストを実行して PASS を確認**

Run: `npx vitest run tests/unit/data/eventBonusTiers.test.ts`
Expected: 7 tests PASS（特性テストなので即 PASS が正常。FAIL したら期待値を実態に合わせ、差異を報告）

- [ ] **Step 3: 既存テストも壊れていないことを確認**

Run: `npm run test:unit`
Expected: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add tests/unit/data/eventBonusTiers.test.ts
git commit -m "test(events): buildLiveTierMap / isEventLive の境界値テストを追加"
```

---

### Task 2: skillFormatter の特性テスト

**Files:**
- Create: `tests/unit/score/skillFormatter.test.ts`

- [ ] **Step 1: テストを書く**

期待文字列は `src/lib/score/skillFormatter.ts` の現行実装から導出済み。`SKILL_TYPE` 定数は `src/lib/data/fetchCardsJson.ts` で定義（`SCOREUP_TIMER: 'スコアアップ（タイマー）'`, `SHRINK: '判定縮小スコアアップ'`, `SHRINK_TIMER: '判定縮小（タイマー）'`, `BAD_TO_PERFECT: 'BAD以上をPerfectに変更'`）。

```typescript
import { describe, it, expect } from 'vitest';
import { formatSkillEffect } from '../../../src/lib/score/skillFormatter';
import { SKILL_TYPE, type ApSkillLevel } from '../../../src/lib/data/fetchCardsJson';

const sl = (
  count: number | null,
  per: number | null,
  value: number | null,
  rate: number | null = null,
): ApSkillLevel => ({ count, per, value, rate });

describe('formatSkillEffect (スキル効果の自然文生成)', () => {
  it('スコアアップ（タイマー）: 秒毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.SCOREUP_TIMER, null, sl(15, 40, 300)))
      .toBe('15秒毎に40％の確率でスコア300UP');
  });

  it('スコアアップ（Perfectのみ）: 発動条件プレフィックス + 回毎表記', () => {
    expect(formatSkillEffect('スコアアップ（Perfectのみ）', 'Perfect', sl(25, 35, 250)))
      .toBe('Perfect25回毎に35％の確率でスコア250UP');
  });

  it('判定縮小スコアアップ: rate >= 10 は 1/100 して倍率表示', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK, 'コンボ', sl(30, 40, 8, 250)))
      .toBe('コンボ30回毎に40％の確率で8秒間判定領域を縮小してスコアを2.5倍に');
  });

  it('判定縮小スコアアップ: rate < 10 はそのまま倍率表示', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK, 'コンボ', sl(30, 40, 8, 2.5)))
      .toBe('コンボ30回毎に40％の確率で8秒間判定領域を縮小してスコアを2.5倍に');
  });

  it('判定縮小（タイマー）: 秒毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK_TIMER, null, sl(20, 50, 6, 300)))
      .toBe('20秒毎に50％の確率で6秒間判定領域を縮小してスコアを3倍に');
  });

  it('BAD以上をPerfectに変更 (req=タイマー): 秒毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.BAD_TO_PERFECT, 'タイマー', sl(20, 45, 5)))
      .toBe('20秒毎に45％の確率で5秒間BAD以上をPerfectに');
  });

  it('BAD以上をPerfectに変更 (req=コンボ): 回毎表記', () => {
    expect(formatSkillEffect(SKILL_TYPE.BAD_TO_PERFECT, 'コンボ', sl(30, 45, 5)))
      .toBe('コンボ30回毎に45％の確率で5秒間BAD以上をPerfectに');
  });

  it('skillType が null なら "-"', () => {
    expect(formatSkillEffect(null, null, sl(10, 10, 10))).toBe('-');
  });

  it('レベル値 (count/per/value) が欠けていたら "-"', () => {
    expect(formatSkillEffect(SKILL_TYPE.SCOREUP_TIMER, null, sl(null, 40, 300))).toBe('-');
  });

  it('縮小系で rate が null なら "-"', () => {
    expect(formatSkillEffect(SKILL_TYPE.SHRINK, 'コンボ', sl(30, 40, 8, null))).toBe('-');
  });

  it('未知のスキル種別は "-"', () => {
    expect(formatSkillEffect('謎スキル', null, sl(10, 10, 10))).toBe('-');
  });
});
```

- [ ] **Step 2: テストを実行して PASS を確認**

Run: `npx vitest run tests/unit/score/skillFormatter.test.ts`
Expected: 11 tests PASS

- [ ] **Step 3: コミット**

```bash
git add tests/unit/score/skillFormatter.test.ts
git commit -m "test(score): skillFormatter の特性テストを追加"
```

---

### Task 3: broachResolver の特性テスト

**Files:**
- Create: `tests/unit/score/broachResolver.test.ts`

- [ ] **Step 1: テストを書く**

`resolveDeckBroachs(deck, allBroachs, song, selectedBroachIds?)` は `Map<slotIndex, ResolvedBroach[]>` を返す。`ResolvedBroach = { broach, active, multiplier }`。UR 以外のカードはスキップされる。種類別挙動: 4=グループ指定（スロット0-4が全員指定グループ）、5=アイドル属性指定カウント（multiplier がデッキ内対象枚数、broach.id 単位で limit 制限）、7=全属性編成（Shout/Beat/Melody が揃う、type 単位 limit）、8=オート専用（常に不発）、9=スコアUP（曲名一致、`calcBroachScoreBonus` で合算）。

```typescript
import { describe, it, expect } from 'vitest';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import { resolveDeckBroachs, calcBroachScoreBonus, type ResolvedBroach } from '../../../src/lib/score/broachResolver';
import { normalizeAttribute } from '../../../src/lib/score/types';
import { allCards, allBroachs, findBroachsByCardId, findCardById, findSongById } from '../../fixtures';

/** 10th Anniversary 四葉環 (UR/Beat/IDOLiSH7、グループ指定ブローチ GROUP=IDOLiSH7) */
const tamaki = findCardById(2484);
/** 音に想いをのせて 和泉一織 (UR/Melody、アイドル属性指定カウント idol=和泉一織 attr=Melody limit=1) */
const ichiOto = findCardById(976);
/** 5th Anniversary 二階堂大和 (UR/Melody、全属性編成ブローチ limit=2) */
const yamato5th = findCardById(1348);
/** 5th Anniversary 和泉一織 (UR/Beat、属性UP上限ありブローチ) */
const ichi5th = findCardById(1347);
/** 5th Anniversary 和泉三月 (UR/Beat、オート専用ブローチ) */
const mitsuki5th = findCardById(1349);
/** 謹賀新年 IDOLiSH7 (UR、スコアUPブローチ song=MEMORiES MELODiES score=1000) */
const kinga = findCardById(959);

const monsterGeneration = findSongById(2);   // MONSTER GENERATiON
const memoriesMelodies = findSongById(36);   // MEMORiES MELODiES (謹賀新年ブローチの対象曲)

const shoutUr = allCards.find(
  (c) => c.rarity === 'UR' && c.groupname === 'IDOLiSH7' && normalizeAttribute(c.attribute) === 'Shout',
)!;
const triggerUr = allCards.find((c) => c.rarity === 'UR' && c.groupname === 'TRIGGER')!;
const nonUr = allCards.find((c) => c.rarity === 'SR')!;

/** 先頭から詰めた 6 スロットデッキを作る */
const deckOf = (...cards: (Card | null)[]): (Card | null)[] => {
  const deck: (Card | null)[] = [null, null, null, null, null, null];
  cards.forEach((c, i) => { deck[i] = c; });
  return deck;
};

/** 指定スロットから broach_type で 1 件取り出す (存在しなければ throw) */
const broachOfType = (resolved: Map<number, ResolvedBroach[]>, slot: number, type: number): ResolvedBroach => {
  const rb = (resolved.get(slot) ?? []).find((x) => x.broach.broach_type === type);
  if (!rb) throw new Error(`slot=${slot} に broach_type=${type} がありません`);
  return rb;
};

describe('resolveDeckBroachs (固定ブローチの条件解決)', () => {
  it('UR 以外のカードにはブローチが付かない', () => {
    const resolved = resolveDeckBroachs(deckOf(nonUr), allBroachs, monsterGeneration);
    expect(resolved.size).toBe(0);
  });

  it('グループ指定 (種類4): 自スロット全員が指定グループなら発動', () => {
    const resolved = resolveDeckBroachs(deckOf(tamaki), allBroachs, monsterGeneration);
    const rb = broachOfType(resolved, 0, 4);
    expect(rb.active).toBe(true);
    expect(rb.multiplier).toBe(1);
  });

  it('グループ指定 (種類4): 他グループのカードが混ざると不発', () => {
    const resolved = resolveDeckBroachs(deckOf(tamaki, triggerUr), allBroachs, monsterGeneration);
    expect(broachOfType(resolved, 0, 4).active).toBe(false);
  });

  it('オート専用 (種類8) は常に不発', () => {
    const resolved = resolveDeckBroachs(deckOf(mitsuki5th), allBroachs, monsterGeneration);
    expect(broachOfType(resolved, 0, 8).active).toBe(false);
  });

  it('スコアUP (種類9): 対象曲なら発動してボーナス合算、対象外曲なら不発', () => {
    const onTarget = resolveDeckBroachs(deckOf(kinga), allBroachs, memoriesMelodies);
    expect(broachOfType(onTarget, 0, 9).active).toBe(true);
    expect(calcBroachScoreBonus(onTarget)).toBe(1000);

    const offTarget = resolveDeckBroachs(deckOf(kinga), allBroachs, monsterGeneration);
    expect(broachOfType(offTarget, 0, 9).active).toBe(false);
    expect(calcBroachScoreBonus(offTarget)).toBe(0);
  });

  it('アイドル属性指定カウント (種類5): 対象2枚で multiplier=2、limit=1 により2枚目は不発', () => {
    const resolved = resolveDeckBroachs(deckOf(ichiOto, ichiOto), allBroachs, monsterGeneration);
    const first = broachOfType(resolved, 0, 5);
    const second = broachOfType(resolved, 1, 5);
    expect(first.active).toBe(true);
    expect(first.multiplier).toBe(2);
    expect(second.active).toBe(false);
  });

  it('全属性編成 (種類7): Shout/Beat/Melody が揃うと発動、欠けると不発', () => {
    const full = resolveDeckBroachs(deckOf(yamato5th, ichi5th, shoutUr), allBroachs, monsterGeneration);
    expect(broachOfType(full, 0, 7).active).toBe(true);

    const partial = resolveDeckBroachs(deckOf(yamato5th), allBroachs, monsterGeneration);
    expect(broachOfType(partial, 0, 7).active).toBe(false);
  });

  it('selectedBroachIds 指定時: null のスロットはブローチなし、id 指定はそのブローチのみ', () => {
    const tamakiBroach = findBroachsByCardId(2484)[0];

    const none = resolveDeckBroachs(deckOf(tamaki), allBroachs, monsterGeneration, [null, null, null, null, null, null]);
    expect(none.get(0) ?? []).toHaveLength(0);

    const only = resolveDeckBroachs(deckOf(tamaki), allBroachs, monsterGeneration, [tamakiBroach.id, null, null, null, null, null]);
    expect((only.get(0) ?? []).map((rb) => rb.broach.id)).toEqual([tamakiBroach.id]);
  });
});
```

注意: `ResolvedBroach` が `broachResolver.ts` から export されていることを確認すること（`export interface ResolvedBroach` — 確認済み）。

- [ ] **Step 2: テストを実行して PASS を確認**

Run: `npx vitest run tests/unit/score/broachResolver.test.ts`
Expected: 8 tests PASS。FAIL した場合は期待値の導出ミス（フィクスチャの実データと突き合わせて修正）。実装は変更しない。

- [ ] **Step 3: コミット**

```bash
git add tests/unit/score/broachResolver.test.ts
git commit -m "test(score): resolveDeckBroachs の特性テストを追加"
```

---

### Task 4: スコア計算ページの E2E スモークテスト

**Files:**
- Create: `tests/score-calc.test.ts`

前提知識: `/score-calc/` は GViz API からクライアントサイドで楽曲・カードを読み込む（実ネットワークアクセスあり）。主要 DOM: `#song-select`（楽曲選択）、`[data-slot-btn="0"]`（センタースロット、クリックでピッカー開く）、`#card-picker-modal`（ピッカー、`[data-pick-card]` が各衣装行）、`#score-min` / `#score-max`（理論値、初期表示 `-`）、`#mc-iterations-input`（試行回数）、`#btn-calculate`（実行）、`#mc-results` / `#mc-mean` / `#final-result`（結果）。

- [ ] **Step 1: テストを書く**

```typescript
import { test, expect } from '@playwright/test';

const BASE = '';

test.describe('スコア計算ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/score-calc/`);
    // GViz から楽曲リストがクライアントサイドで読み込まれるのを待つ
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );
  });

  test('楽曲選択 → 衣装配置 → シミュレーション計算が完走する', async ({ page }) => {
    // 楽曲を選択 (先頭の実曲。option[0] はプレースホルダ)
    const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
    await page.locator('#song-select').selectOption(firstValue!);
    await expect(page.locator('#song-info')).toBeVisible();

    // センタースロットをクリックして衣装ピッカーを開く
    await page.locator('[data-slot-btn="0"]').click();
    await expect(page.locator('#card-picker-modal')).toBeVisible();

    // 先頭の衣装を選択するとピッカーが閉じる
    await page.locator('[data-pick-card]').first().waitFor({ timeout: 15000 });
    await page.locator('[data-pick-card]').first().click();
    await expect(page.locator('#card-picker-modal')).toBeHidden();

    // 理論値 (最小/最大) が数値表示に変わる
    await expect(page.locator('#score-min')).toHaveText(/[\d,]+/);
    await expect(page.locator('#score-max')).toHaveText(/[\d,]+/);

    // 試行回数を 100 に下げて MC シミュレーションを実行
    await page.locator('#mc-iterations-input').fill('100');
    const calcBtn = page.locator('#btn-calculate');
    await expect(calcBtn).toBeEnabled();
    await calcBtn.click();

    // シミュレーション結果が表示される
    await expect(page.locator('#mc-results')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#mc-mean')).toHaveText(/[\d,]+/);
    await expect(page.locator('#final-result')).toHaveText(/[\d,]+/);
  });
});
```

- [ ] **Step 2: E2E を実行して PASS を確認**

Run: `npx playwright test tests/score-calc.test.ts`（preview サーバーが自動起動。ビルド未実施なら初回 10〜15 分かかる — `timeout` は Bash ツールの最大 600000ms でも不足する場合があるため、`run_in_background: true` で起動し完了を待つこと）
Expected: 1 test PASS

- [ ] **Step 3: コミット**

```bash
git add tests/score-calc.test.ts
git commit -m "test(e2e): スコア計算ページのスモークテストを追加"
```

---

### Task 5: 編成組合計算ページの E2E スモークテスト

**Files:**
- Create: `tests/max-score-finder.test.ts`

前提知識: `/score-calc/max-score-finder/` の探索候補は「現在開催中のイベント」の金/銀特効 UR 衣装で決まり、`Date.now()` に依存する（`MaxScoreFinder.svelte` の `now`）。実時刻のままではイベント非開催期間にテストが落ちるため、**`page.clock.setFixedTime()` でページ内時刻をイベント開催中に固定して決定的にする**。イベントデータはビルド時に `public/events/events.csv` から焼き込まれるので、テストも同じ `fetchEventsCsv()` で最新イベントを選ぶ。探索は Web Worker 並列で実行され、組合せ数が 5,000,000 を超えると `confirm()` ダイアログが出る（accept する）。

- [ ] **Step 1: テストを書く**

```typescript
import { test, expect } from '@playwright/test';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';

const BASE = '';

test.describe('編成組合計算ページ', () => {
  // Worker 並列探索は組合せ数次第で数十秒かかるため余裕を持たせる
  test.setTimeout(180_000);

  test('イベント開催中の時刻に固定すると探索が完走し最適編成が表示される', async ({ page }) => {
    // ビルドに焼き込まれるものと同じ events.csv から最新イベントを選び、
    // その開催初日の正午 (JST) にページ内時刻を固定する
    const events = await fetchEventsCsv();
    const latest = events.reduce((a, b) => (a.start_date > b.start_date ? a : b));
    const fixedTime = Date.parse(`${latest.start_date}T12:00:00+09:00`);
    await page.clock.setFixedTime(fixedTime);

    // 組合せ数が多い場合の confirm ダイアログは許可する
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(`${BASE}/score-calc/max-score-finder/`);
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );

    // 開催中イベントのパネルが表示される
    await expect(page.getByRole('heading', { name: /現在開催中のイベント/ })).toBeVisible();

    // 楽曲を選択
    const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
    await page.locator('#song-select').selectOption(firstValue!);

    // 探索を実行
    const searchBtn = page.getByRole('button', { name: /総当たり探索を開始/ });
    await expect(searchBtn).toBeEnabled({ timeout: 15000 });
    await searchBtn.click();

    // Worker 並列探索の完了を待ち、最適編成と上位候補が表示される
    await expect(page.getByRole('heading', { name: /最適編成/ })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByRole('heading', { name: /上位候補 TOP 10/ })).toBeVisible();
  });
});
```

リスク: 最新イベントの特効カードがまだ GViz スプレッドシートに未登録だと候補 0 で探索ボタンが無効のまま FAIL する。その場合は `events.reduce(...)` を「開催終了済みイベントのうち最新」(`events.filter(e => Date.parse(e.end_date + 'T17:00:00+09:00') < Date.now()).reduce(...)`) に変えて再実行し、変更理由をタスク報告に明記すること。

- [ ] **Step 2: E2E を実行して PASS を確認**

Run: `npx playwright test tests/max-score-finder.test.ts`（Task 4 でビルド済みなら preview 起動は数秒）
Expected: 1 test PASS

- [ ] **Step 3: 全テストスイートを通しで確認**

Run: `npm run test:unit` → 全 PASS。続けて `npx playwright test` → 全 PASS（既存の score-calc-spec.test.ts 含む）
Expected: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add tests/max-score-finder.test.ts
git commit -m "test(e2e): 編成組合計算ページのスモークテストを追加"
```

---

### Task 6: リリースノート更新とリリース

**Files:**
- Modify: `src/pages/releases/index.astro`（既存エントリの形式に合わせて新バージョンを追記）

- [ ] **Step 1: 現在のバージョンを確認**

Run: `git tag --sort=-v:refname | head -3` で最新タグを確認し、パッチバージョンをインクリメント（例: v1.24.3 → v1.24.4）。

- [ ] **Step 2: リリースノートを追記**

`src/pages/releases/index.astro` の既存エントリ形式を読み、先頭に新バージョンのエントリを追加する。内容: 「テスト基盤の強化（ブローチ条件判定・スキル表示・イベント特効判定の単体テスト、スコア計算/編成組合計算ページの E2E テストを追加）。ユーザーに見える変更はありません」の趣旨。

- [ ] **Step 3: コミット・push・PR 作成**

```bash
git add src/pages/releases/index.astro
git commit -m "docs(releases): vX.Y.Z リリースノートを追加"
git push -u origin test/phase0-safety-net
gh pr create --title "test: Phase 0 安全網整備（リファクタリング前のテスト拡充）" --body "$(cat <<'EOF'
## 概要

段階的リファクタリング（docs/superpowers/specs/2026-06-10-phased-refactoring-design.md）の Phase 0。
リファクタリング着手前に現在の挙動をテストで固定する。実装コードの変更はなし。

## 追加テスト

- `tests/unit/data/eventBonusTiers.test.ts` — buildLiveTierMap / isEventLive の境界値
- `tests/unit/score/skillFormatter.test.ts` — スキル効果文生成の特性テスト
- `tests/unit/score/broachResolver.test.ts` — 固定ブローチ条件解決の特性テスト
- `tests/score-calc.test.ts` — スコア計算ページの E2E スモーク
- `tests/max-score-finder.test.ts` — 編成組合計算ページの E2E スモーク（page.clock で時刻固定）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: PR マージ → タグ push でリリース**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
```

`release.yml` が GitHub Release を作成し、`deploy.yml` が Cloudflare Workers にデプロイする（CI の完了を待つ必要はない）。
