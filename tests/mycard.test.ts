import { test, expect } from '@playwright/test';

const BASE = '/i7';

test.describe('所持カードページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/mycard/`);
  });

  test('タイトルが正しい', async ({ page }) => {
    await expect(page).toHaveTitle(/所持カード一覧.*i7 カードDB/);
  });

  test('所持カードがない場合は空メッセージが表示される', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('#empty-message')).toBeVisible();
    await expect(page.getByText('所持カードがありません')).toBeVisible();
  });

  test('テーブルヘッダーが正しい', async ({ page }) => {
    const headers = page.locator('thead th');
    await expect(headers.nth(0)).toContainText('画像');
    await expect(headers.nth(1)).toContainText('ID');
    await expect(headers.nth(2)).toContainText('カード名');
  });

  test('カード一覧で所持数を登録すると所持カードに反映される', async ({ page }) => {
    // カード一覧で所持数を1にする
    await page.goto(`${BASE}/cards/`);
    await page.locator('#table-body tr').first().waitFor({ timeout: 15000 });
    const firstInput = page.locator('#table-body input[data-count-input]').first();
    const cardId = await firstInput.getAttribute('data-count-input');
    const plusBtn = page.locator(`#table-body button[data-count-btn="${cardId}"][data-delta="1"]`).first();
    await plusBtn.click();

    // 所持カードページに遷移
    await page.goto(`${BASE}/mycard/`);
    await expect(page.locator('#mycard-content')).toBeVisible();
    await expect(page.locator('#table-body tr')).toHaveCount(1);

    // クリーンアップ
    await page.evaluate(() => localStorage.clear());
  });
});
