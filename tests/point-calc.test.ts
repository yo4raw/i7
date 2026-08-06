import { test, expect } from '@playwright/test';

test.describe('ポイント芸計算', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/point-calc/');
  });

  test('目標ptと現在ptから差異が計算される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('7777777');
    await page.getByTestId('current-pt').fill('7770000');
    await expect(page.getByTestId('diff')).toHaveText('7,777');
  });

  test('PC は既定でオフ、その他のプレイ方法はオン', async ({ page }) => {
    await expect(page.getByTestId('play-mode-PC')).not.toBeChecked();
    await expect(page.getByTestId('play-mode-放置')).toBeChecked();
    await expect(page.getByTestId('play-mode-オート')).toBeChecked();
    await expect(page.getByTestId('play-mode-FC')).toBeChecked();
  });

  test('組合せを計算すると候補が表示される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('7777777');
    await page.getByTestId('current-pt').fill('0');
    await page.getByTestId('calculate').click();
    const solutions = page.getByTestId('solutions');
    await expect(solutions).toBeVisible();
    await expect(solutions.locator('section')).not.toHaveCount(0);
    await expect(solutions.getByText('ぴったり').first()).toBeVisible();
  });

  test('特効%チップを追加・削除できる', async ({ page }) => {
    const chips = page.getByTestId('bonus-chips');
    await page.getByTestId('new-bonus-pct').fill('7');
    await page.getByRole('button', { name: '追加' }).click();
    await expect(chips.getByText('7%', { exact: true })).toBeVisible();
    await chips.getByRole('button', { name: '7% を削除' }).click();
    await expect(chips.getByText('7%', { exact: true })).toHaveCount(0);
  });

  test('入力がリロード後も復元される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('1234567');
    await page.getByTestId('play-mode-オート').uncheck();
    await page.reload();
    await expect(page.getByTestId('target-pt')).toHaveValue('1234567');
    await expect(page.getByTestId('play-mode-オート')).not.toBeChecked();
  });

  test('差異が 0 以下ならメッセージを出す', async ({ page }) => {
    await page.getByTestId('target-pt').fill('100');
    await page.getByTestId('current-pt').fill('200');
    await page.getByTestId('calculate').click();
    await expect(page.getByTestId('message')).toContainText('目標ptが現在ptより大きくなるように');
  });
});
