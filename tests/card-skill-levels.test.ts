import { test, expect } from './helpers/fixtures';

const BASE = '';

test.describe('衣装一覧のスキル Lv 登録', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/cards/`);
    await page.locator('#table-body tr').first().waitFor({ timeout: 15000 });
  });

  test('所持数が 1 以上になるとスキル Lv セレクトが出て、変更がリロード後も残る', async ({ page }) => {
    const firstInput = page.locator('#table-body input[data-count-input]').first();
    await expect(firstInput).toBeVisible();
    const cardId = await firstInput.getAttribute('data-count-input');

    // 所持 0 のときは Lv セレクトが無い
    const lvSelect = page.locator(`#table-body select[data-skill-level-input="${cardId}"][data-copy-index="0"]`);
    await expect(lvSelect).toHaveCount(0);

    await page.locator(`#table-body button[data-count-btn="${cardId}"][data-delta="1"]`).first().click();
    await expect(lvSelect).toBeVisible();
    await expect(lvSelect).toHaveValue('5');

    await lvSelect.selectOption('3');
    await page.reload();
    await expect(page.locator(`#table-body select[data-skill-level-input="${cardId}"][data-copy-index="0"]`)).toHaveValue('3');

    // クリーンアップ
    await page.evaluate(() => localStorage.clear());
  });
});
