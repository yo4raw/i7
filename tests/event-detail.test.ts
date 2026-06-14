import { test, expect } from '@playwright/test';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';
import { isHighScoreEvent } from '../src/lib/data/eventBonusTiers';

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
    await expect(gold.locator('input[type="number"]').first()).toHaveValue('1');
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
    await expect(gold.locator('input[type="number"]').first()).toHaveValue('1');
    await minus.click();

    await expect(gold.locator('input[type="number"]').first()).toHaveValue('0');
    await expect(gold.getByText(/所持 0 枚/)).toBeVisible();

    const counts = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('i7_card_counts') || '{}')
    );
    expect(Object.keys(counts)).toHaveLength(0);
  });
});

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

  test('判定縮小スキルのバッジはピンク強調される', async ({ page }) => {
    // スキルバッジはクライアントサイドの GViz フェッチ後に描画されるため、
    // まず最初のバッジ表示を待ってからカウントする（早すぎる count() による誤スキップ防止）
    await expect(page.getByTestId('skill-badge').first()).toBeVisible();
    const shrink = page.getByTestId('skill-badge').filter({ hasText: '判定縮小' });
    const count = await shrink.count();
    test.skip(count === 0, 'このイベントに判定縮小持ちの特効衣装がいないためスキップ');
    await expect(shrink.first()).toHaveClass(/bg-pink-500/);
  });
});

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

    // レアリティバッジ（UR/SSR/SR/R/N のいずれか）が描画されるのを待ち、全て UR か確認
    const rarityBadge = page.locator('section span').filter({ hasText: /^(UR|SSR|SR|R|N)$/ });
    await rarityBadge.first().waitFor({ timeout: 10000 });
    const texts = await rarityBadge.allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.trim()).toBe('UR');
    }
  });
});
