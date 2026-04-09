import { test, expect } from '@playwright/test';

const BASE = '/i7';

test.describe('カード詳細ページ', () => {
  // カード一覧からIDを取得するヘルパー
  async function getFirstCardId(page: any): Promise<string> {
    await page.goto(`${BASE}/cards/`);
    await page.locator('#table-body tr').first().waitFor({ timeout: 15000 });
    const firstId = await page.locator('#table-body tr').first().locator('td').nth(1).textContent();
    return firstId!.trim();
  }

  test('詳細ページが表示され戻るリンクがある', async ({ page }) => {
    const id = await getFirstCardId(page);
    await page.goto(`${BASE}/cards/${id}/`);
    await expect(page.getByText('カード一覧に戻る')).toBeVisible();
  });

  test('カード画像が表示される', async ({ page }) => {
    const id = await getFirstCardId(page);
    await page.goto(`${BASE}/cards/${id}/`);

    const img = page.locator('img').first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toContain('.png');
  });

  test('レアリティバッジと属性バッジが表示される', async ({ page }) => {
    const id = await getFirstCardId(page);
    await page.goto(`${BASE}/cards/${id}/`);

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    const badges = h1.locator('span.rounded');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('ステータスセクションにドーナツチャートが表示される', async ({ page }) => {
    const id = await getFirstCardId(page);
    await page.goto(`${BASE}/cards/${id}/`);

    const statusSection = page.locator('section', { hasText: 'ステータス' });
    await expect(statusSection).toBeVisible();
    const svg = statusSection.locator('svg');
    await expect(svg).toBeVisible();
    await expect(statusSection.getByText('Shout')).toBeVisible();
    await expect(statusSection.getByText('Beat')).toBeVisible();
    await expect(statusSection.getByText('Melody')).toBeVisible();
  });

  test('基本情報テーブルが表示される', async ({ page }) => {
    const id = await getFirstCardId(page);
    await page.goto(`${BASE}/cards/${id}/`);
    await expect(page.getByText('キャラクター').first()).toBeVisible();
  });
});
