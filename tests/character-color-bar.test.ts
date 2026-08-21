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

test('衣装一覧の行にキャラスパインが出る', async ({ page }) => {
  await page.goto('/cards/');
  await expect(page.getByTestId('character-spine').first()).toBeVisible();
});

test('ホームのヒーローからキャラで絞り込める', async ({ page }) => {
  await page.goto('/');
  // 16 色バーの立ち上がり (ADR 0054) が終わってからクリックする
  await expect(page.locator('[data-motion-group="hero-bar"][data-motion-item]')).toHaveCount(0);
  await page.getByLabel('七瀬陸の衣装一覧').click();
  await expect(page).toHaveURL(/char=/);
});
