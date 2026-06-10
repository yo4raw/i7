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
