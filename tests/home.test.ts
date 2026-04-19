import { test, expect } from '@playwright/test';
import { SITE_NAME } from '../src/lib/constants';

const BASE = '/i7';

test.describe('ホームページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
  });

  test('タイトルが正しい', async ({ page }) => {
    await expect(page).toHaveTitle(new RegExp(`ホーム.*${SITE_NAME}`));
  });

  test('ナビゲーションリンクが存在する', async ({ page }) => {
    const nav = page.locator('#nav-links');
    await expect(nav.getByText('ホーム')).toBeVisible();
    await expect(nav.getByText('カード一覧')).toBeVisible();
    await expect(nav.getByText('楽曲一覧')).toBeVisible();
    await expect(nav.getByText('所持カード')).toBeVisible();
  });

  test('カード一覧・楽曲一覧のリンクカードが表示される', async ({ page }) => {
    await expect(page.getByText('カード一覧').first()).toBeVisible();
    await expect(page.getByText('楽曲一覧').first()).toBeVisible();
    await expect(page.getByText('カード内訳')).toBeVisible();
  });

  test('カード枚数と楽曲数が0より大きい', async ({ page }) => {
    const cardCount = page.locator(`a[href="${BASE}/cards/"] .text-2xl`);
    const text = await cardCount.textContent();
    expect(text).toMatch(/\d+\s*枚/);
    const num = parseInt(text!.replace(/[^\d]/g, ''));
    expect(num).toBeGreaterThan(0);
  });
});
