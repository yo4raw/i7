import { test, expect } from '@playwright/test';

const BASE = '';

test.describe('共通ブローチ登録ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/shared-broach/`);
  });

  test('タイトルが正しい', async ({ page }) => {
    // SITE_NAME は正規表現メタ文字 (β) を含むためページ名のみでマッチする
    await expect(page).toHaveTitle(/共通ブローチ/);
  });

  test('+ボタンで所持数が増え localStorage に保存される', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('button[data-broach-btn="1"][data-delta="1"]').click();
    await expect(page.locator('input[data-broach-input="1"]')).toHaveValue('1');
    const stored = await page.evaluate(() => localStorage.getItem('i7_shared_broach_counts'));
    expect(JSON.parse(stored!)['1']).toBe(1);
  });

  test('−ボタンは 0 未満にならない', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('button[data-broach-btn="6"][data-delta="-1"]').click();
    await expect(page.locator('input[data-broach-input="6"]')).toHaveValue('0');
    const stored = await page.evaluate(() => localStorage.getItem('i7_shared_broach_counts'));
    expect(stored === null || !('6' in JSON.parse(stored))).toBe(true);
  });

  test('リロード後も所持数が復元される', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('button[data-broach-btn="1"][data-delta="1"]').click();
    await page.locator('button[data-broach-btn="1"][data-delta="1"]').click();
    await page.reload();
    await expect(page.locator('input[data-broach-input="1"]')).toHaveValue('2');
    await expect(page.locator('[data-broach-total]')).toHaveText('2');
  });

  test('ヘッダーの「各種登録」から遷移できる', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: '各種登録' }).click();
    await page.getByRole('menuitem', { name: '共通ブローチ' }).click();
    await expect(page).toHaveURL(new RegExp('/shared-broach/'));
  });

  test('「各種登録」からラビットノートにも遷移できる', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: '各種登録' }).click();
    await page.getByRole('menuitem', { name: 'ラビットノート' }).click();
    await expect(page).toHaveURL(new RegExp('/rabbit-note/'));
  });
});
