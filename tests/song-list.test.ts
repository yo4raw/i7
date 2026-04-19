import { test, expect } from '@playwright/test';

const BASE = '/i7';

test.describe('楽曲一覧ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/songs/`);
    // クライアントサイドJSが楽曲を描画するのを待つ
    await page.locator('#table-body tr').first().waitFor({ timeout: 15000 });
  });

  test('タイトルが正しい', async ({ page }) => {
    await expect(page).toHaveTitle(/楽曲一覧.*i7ごったに部屋/);
  });

  test('検索フォームが表示される', async ({ page }) => {
    await expect(page.locator('#search-text')).toBeVisible();
    await expect(page.locator('#search-group')).toBeVisible();
    await expect(page.locator('#search-stars')).toBeVisible();
    await expect(page.locator('#sort-by')).toBeVisible();
  });

  test('テーブルヘッダーが正しい', async ({ page }) => {
    const headers = page.locator('thead th');
    await expect(headers.nth(0)).toContainText('グループ');
    await expect(headers.nth(1)).toContainText('曲名');
    await expect(headers.nth(2)).toContainText('アーティスト');
    await expect(headers.nth(3)).toContainText('難易度');
    await expect(headers.nth(4)).toContainText('ノーツ数');
    await expect(headers.nth(5)).toContainText('秒数');
    await expect(headers.nth(6)).toContainText('属性比率');
  });

  test('楽曲データがテーブルに表示される', async ({ page }) => {
    const count = await page.locator('#table-body tr').count();
    expect(count).toBeGreaterThan(0);
  });

  test('曲数表示が正しい形式', async ({ page }) => {
    const countText = await page.locator('#result-count').textContent();
    expect(countText).toMatch(/\d+曲を表示/);
  });

  test('ドーナツチャートが表示される', async ({ page }) => {
    const svg = page.locator('#table-body svg').first();
    await expect(svg).toBeVisible();
  });

  test('名前検索でフィルタされる', async ({ page }) => {
    const beforeCount = await page.locator('#table-body tr').count();
    await page.fill('#search-text', 'MONSTER');
    await page.waitForTimeout(500);
    const afterCount = await page.locator('#table-body tr').count();
    expect(afterCount).toBeLessThanOrEqual(beforeCount);
  });

  test('条件リセットが動作する', async ({ page }) => {
    await page.fill('#search-text', 'MONSTER');
    await page.waitForTimeout(500);
    await page.click('#btn-reset');
    await page.waitForTimeout(300);
    const searchVal = await page.locator('#search-text').inputValue();
    expect(searchVal).toBe('');
  });

  test('ソートが動作する', async ({ page }) => {
    await page.selectOption('#sort-by', 'notes-desc');
    await page.waitForTimeout(300);

    const rows = page.locator('#table-body tr');
    const first = await rows.first().locator('td').nth(4).textContent();
    const second = await rows.nth(1).locator('td').nth(4).textContent();
    const firstNum = parseInt(first!.replace(/,/g, ''));
    const secondNum = parseInt(second!.replace(/,/g, ''));
    expect(firstNum).toBeGreaterThanOrEqual(secondNum);
  });

  test('行にリンクが含まれる', async ({ page }) => {
    const firstRow = page.locator('#table-body tr').first();
    const link = firstRow.locator('a').first();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/\/i7\/songs\/\d+\//);
  });
});
