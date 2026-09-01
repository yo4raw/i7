import { test, expect } from './helpers/fixtures';

test('プライバシーポリシーが表示され index 対象になっている', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();
  // 法的ページは検索から到達できる必要があるため noindex にしない (ADR 0057)
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
});

test('同期で保存されるデータと削除方法が書かれている', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByText('所持衣装数')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'データの削除' })).toBeVisible();
  await expect(page.getByText('サーバのデータを削除')).toBeVisible();
});
