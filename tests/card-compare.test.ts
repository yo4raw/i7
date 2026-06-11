import { test, expect } from '@playwright/test';

test.describe('衣装比較ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/card-compare/');
  });

  test('見出しと前提条件の説明が表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '衣装比較' })).toBeVisible();
    await expect(page.getByText('全ノーツ Perfect 前提')).toBeVisible();
  });

  test('スコアアップタブに積み上げ棒グラフが表示される', async ({ page }) => {
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
  });

  test('判定縮小タブに切り替えると縮小ランキングが表示される', async ({ page }) => {
    await page.getByRole('tab', { name: '判定縮小' }).click();
    await expect(page.getByTestId('shrink-col').first()).toBeVisible({ timeout: 20000 });
  });

  test('棒をクリックすると詳細比較パネルが開閉する', async ({ page }) => {
    const bar = page.getByTestId('scoreup-bar').first();
    await bar.waitFor({ timeout: 20000 });
    await bar.click();
    await expect(page.getByTestId('compare-detail')).toBeVisible();
    await page.getByRole('button', { name: '✕ クリア' }).click();
    await expect(page.getByTestId('compare-detail')).toBeHidden();
  });

  test('楽曲セレクタの初期選択が DIAMOND FUSION', async ({ page }) => {
    const select = page.getByLabel(/楽曲/);
    await expect(select).toBeVisible({ timeout: 20000 });
    const label = await select.locator('option:checked').textContent();
    expect(label).toContain('DIAMOND FUSION');
  });
});
