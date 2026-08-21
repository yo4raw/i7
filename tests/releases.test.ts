import { test, expect } from './helpers/fixtures';

test.describe('リリース履歴ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/releases/');
  });

  test('リリースが1件以上表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'リリース履歴' })).toBeVisible();
    const subjects = await page.locator('ul.list-disc > li').allInnerTexts();
    expect(subjects.length).toBeGreaterThan(0);
  });

  test('マージコミットの件名がリリースノートに含まれない', async ({ page }) => {
    const subjects = await page.locator('ul.list-disc > li').allInnerTexts();
    expect(subjects.length).toBeGreaterThan(0);
    const merges = subjects.filter((s) =>
      /^Merge (pull request|branch|remote-tracking branch)\b/.test(s.trim()),
    );
    expect(merges).toEqual([]);
  });
});
