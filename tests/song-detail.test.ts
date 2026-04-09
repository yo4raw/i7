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

  test('ノート内訳テーブルが表示される（データがあれば）', async ({ page }) => {
    const href = await getFirstSongHref(page);
    await page.goto(href!);

    const noteSection = page.locator('section', { hasText: 'ノート内訳' });
    const visible = await noteSection.isVisible().catch(() => false);
    if (visible) {
      await expect(noteSection.locator('table')).toBeVisible();
      await expect(noteSection.getByText('倍率')).toBeVisible();
    }
  });

  test('合計ノート数が表示される（データがあれば）', async ({ page }) => {
    const href = await getFirstSongHref(page);
    await page.goto(href!);

    const totalSection = page.locator('section', { hasText: '合計ノート数' });
    const visible = await totalSection.isVisible().catch(() => false);
    if (visible) {
      await expect(totalSection.getByText('Shout')).toBeVisible();
      await expect(totalSection.getByText('Beat')).toBeVisible();
      await expect(totalSection.getByText('Melody')).toBeVisible();
    }
  });
});
