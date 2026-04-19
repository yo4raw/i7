import { test, expect } from '@playwright/test';

const BASE = '/i7';

test.describe('カード一覧ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/cards/`);
    // クライアントサイドJSがカードを描画するのを待つ
    await page.locator('#table-body tr').first().waitFor({ timeout: 15000 });
  });

  test('タイトルが正しい', async ({ page }) => {
    await expect(page).toHaveTitle(/カード一覧.*i7ごったに部屋/);
  });

  test('検索フォームが表示される', async ({ page }) => {
    await expect(page.locator('#search-text')).toBeVisible();
    await expect(page.locator('#search-rarity')).toBeVisible();
    await expect(page.locator('#search-attribute')).toBeVisible();
    await expect(page.locator('#search-character')).toBeVisible();
    await expect(page.locator('#search-skill')).toBeVisible();
    await expect(page.locator('#sort-by')).toBeVisible();
  });

  test('テーブルヘッダーが正しい', async ({ page }) => {
    const headers = page.locator('thead th');
    await expect(headers.nth(0)).toContainText('画像');
    await expect(headers.nth(1)).toContainText('ID');
    await expect(headers.nth(2)).toContainText('カード名');
    await expect(headers.nth(3)).toContainText('キャラ');
    await expect(headers.nth(4)).toContainText('レア');
    await expect(headers.nth(5)).toContainText('属性');
    await expect(headers.nth(6)).toContainText('属性比率');
    await expect(headers.nth(7)).toContainText('Shout');
    await expect(headers.nth(8)).toContainText('Beat');
    await expect(headers.nth(9)).toContainText('Melody');
    await expect(headers.nth(10)).toContainText('スキル');
    await expect(headers.nth(11)).toContainText('所持数');
  });

  test('カードデータがテーブルに表示される', async ({ page }) => {
    const rows = page.locator('#table-body tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('件数表示が正しい形式', async ({ page }) => {
    const countText = await page.locator('#result-count').textContent();
    expect(countText).toMatch(/\d+件中\s*\d+~\d+件を表示/);
  });

  test('レアリティバッジが表示される', async ({ page }) => {
    const firstRow = page.locator('#table-body tr').first();
    const badge = firstRow.locator('span.rounded');
    await expect(badge.first()).toBeVisible();
  });

  test('ドーナツチャートが表示される', async ({ page }) => {
    const svg = page.locator('#table-body svg').first();
    await expect(svg).toBeVisible();
  });

  test('名前検索でフィルタされる', async ({ page }) => {
    const beforeCount = await page.locator('#table-body tr').count();
    await page.fill('#search-text', '七瀬陸');
    await page.waitForTimeout(500);
    const afterCount = await page.locator('#table-body tr').count();
    expect(afterCount).toBeLessThanOrEqual(beforeCount);
    expect(afterCount).toBeGreaterThan(0);
  });

  test('条件リセットでフィルタが解除される', async ({ page }) => {
    const initialCount = await page.locator('#table-body tr').count();
    await page.fill('#search-text', '七瀬陸');
    await page.waitForTimeout(500);
    await page.click('#btn-reset');
    await page.waitForTimeout(300);
    const resetCount = await page.locator('#table-body tr').count();
    expect(resetCount).toBe(initialCount);
  });

  test('ソートが動作する', async ({ page }) => {
    const firstIdDefault = await page.locator('#table-body tr').first().locator('td').nth(1).textContent();

    await page.selectOption('#sort-by', 'id-asc');
    await page.waitForTimeout(300);
    const firstIdAsc = await page.locator('#table-body tr').first().locator('td').nth(1).textContent();

    expect(Number(firstIdDefault)).toBeGreaterThan(Number(firstIdAsc));
  });

  test('ページネーションが表示される', async ({ page }) => {
    const pagination = page.locator('#pagination');
    await expect(pagination).toBeVisible();
    const buttons = pagination.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('所持数コントロールが動作する', async ({ page }) => {
    const firstInput = page.locator('#table-body input[data-count-input]').first();
    await expect(firstInput).toBeVisible();
    await expect(firstInput).toHaveValue('0');

    const cardId = await firstInput.getAttribute('data-count-input');
    const plusBtn = page.locator(`#table-body button[data-count-btn="${cardId}"][data-delta="1"]`).first();
    await plusBtn.click();
    await expect(firstInput).toHaveValue('1');

    // クリーンアップ
    await page.evaluate(() => localStorage.clear());
  });

  test('URLパラメータにフィルタ状態が反映される', async ({ page }) => {
    await page.fill('#search-text', 'テスト');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('q=');
  });
});
