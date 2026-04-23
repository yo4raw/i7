import { test, expect } from '@playwright/test';

const BASE = '/i7';

test.describe('楽曲詳細ページ', () => {
  async function getFirstSongHref(page: any): Promise<string> {
    await page.goto(`${BASE}/songs/`);
    await page.locator('#table-body tr').first().waitFor({ timeout: 15000 });
    return await page.locator('#table-body tr a').first().getAttribute('href');
  }

  test('楽曲詳細ページが表示される', async ({ page }) => {
    const href = await getFirstSongHref(page);
    await page.goto(href!);
    await expect(page.getByText('楽曲一覧に戻る')).toBeVisible();
  });

  test('曲名とアーティストが表示される', async ({ page }) => {
    const href = await getFirstSongHref(page);
    await page.goto(href!);

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    const title = await h1.textContent();
    expect(title!.length).toBeGreaterThan(0);
  });

  test('基本情報テーブルが表示される', async ({ page }) => {
    const href = await getFirstSongHref(page);
    await page.goto(href!);

    await expect(page.getByText('グループ').first()).toBeVisible();
    await expect(page.getByText('アーティスト').first()).toBeVisible();
  });

  test('OGP / Twitter Card メタタグが出力される', async ({ page }) => {
    const href = await getFirstSongHref(page);
    await page.goto(href!);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', /^https:\/\/.+\/songs\/.+/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\/.+\/assets\/songs\/.+\.png$/);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\/.+\/songs\/.+/);
  });

  test('属性比率チャートが表示される', async ({ page }) => {
    const href = await getFirstSongHref(page);
    await page.goto(href!);

    const ratioSection = page.locator('section', { hasText: '属性比率' });
    await expect(ratioSection).toBeVisible();
    const svg = ratioSection.locator('svg');
    await expect(svg).toBeVisible();
    await expect(ratioSection.getByText('Shout')).toBeVisible();
    await expect(ratioSection.getByText('Beat')).toBeVisible();
    await expect(ratioSection.getByText('Melody')).toBeVisible();
  });

});
