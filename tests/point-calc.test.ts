import { test, expect } from './helpers/fixtures';

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

  test('既定の特効設定から 50 刻み 7 段階が導出される', async ({ page }) => {
    await expect(page.getByTestId('bonus-rate-gold')).toHaveValue('50');
    await expect(page.getByTestId('bonus-count-gold')).toHaveValue('6');
    await expect(page.getByTestId('derived-bonus-pcts'))
      .toHaveText('使う特効%: 0% / 50% / 100% / 150% / 200% / 250% / 300%（7 段階）');
  });

  test('使える枚数を減らすと導出される特効%が減る', async ({ page }) => {
    await page.getByTestId('bonus-count-gold').fill('1');
    await expect(page.getByTestId('derived-bonus-pcts'))
      .toHaveText('使う特効%: 0% / 50%（2 段階）');
  });

  test('上昇率を変えると導出される特効%が変わる', async ({ page }) => {
    await page.getByTestId('bonus-count-gold').fill('2');
    await page.getByTestId('bonus-rate-gold').fill('30');
    await expect(page.getByTestId('derived-bonus-pcts'))
      .toHaveText('使う特効%: 0% / 30% / 60%（3 段階）');
  });

  test('入力がリロード後も復元される', async ({ page }) => {
    await page.getByTestId('target-pt').fill('1234567');
    await page.getByTestId('bonus-count-silver').fill('3');
    await page.getByTestId('play-mode-オート').uncheck();
    await page.reload();
    await expect(page.getByTestId('target-pt')).toHaveValue('1234567');
    await expect(page.getByTestId('bonus-count-silver')).toHaveValue('3');
    await expect(page.getByTestId('play-mode-オート')).not.toBeChecked();
  });

  test('差異が 0 以下ならメッセージを出す', async ({ page }) => {
    await page.getByTestId('target-pt').fill('100');
    await page.getByTestId('current-pt').fill('200');
    await page.getByTestId('calculate').click();
    await expect(page.getByTestId('message')).toContainText('目標ptが現在ptより大きくなるように');
  });
});
