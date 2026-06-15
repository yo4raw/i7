import { test, expect } from '@playwright/test';

test.describe('衣装比較ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/card-compare/');
  });

  test('見出しと前提条件の説明が表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '衣装比較' })).toBeVisible();
    await expect(page.getByText('全ノーツ Perfect 前提')).toBeVisible();
  });

  test('スコアアップタブに積み上げ棒グラフが表示される', async ({ page }) => {
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
  });

  test('スコアアップタブに期待/最大ソートセレクタと最大表示がある', async ({ page }) => {
    const bar = page.getByTestId('scoreup-bar').first();
    await expect(bar).toBeVisible({ timeout: 20000 });
    await expect(bar.getByText(/最大 /)).toBeVisible();
    const select = page.getByLabel('スコアアップソート');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('expected');
    await select.selectOption('max');
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible();
  });

  test('判定縮小タブに切り替えると縮小ランキングが表示される', async ({ page }) => {
    await page.getByRole('tab', { name: '判定縮小' }).click();
    await expect(page.getByTestId('shrink-col').first()).toBeVisible({ timeout: 20000 });
  });

  test('判定縮小の棒に属性値由来スコアが参考表示される', async ({ page }) => {
    await page.getByRole('tab', { name: '判定縮小' }).click();
    const col = page.getByTestId('shrink-col').first();
    await expect(col).toBeVisible({ timeout: 20000 });
    await expect(col.getByText(/属性 /)).toBeVisible();
  });

  test('判定縮小タブにカバー秒数のソートセレクタがあり既定は期待カバー秒数', async ({ page }) => {
    await page.getByRole('tab', { name: '判定縮小' }).click();
    await expect(page.getByTestId('shrink-col').first()).toBeVisible({ timeout: 20000 });
    const select = page.getByLabel('縮小ソート');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('expected');
    await select.selectOption('max');
    await expect(page.getByTestId('shrink-col').first()).toBeVisible();
  });

  test('棒のサムネイルが card.ID ベースの th_cards 画像を指す', async ({ page }) => {
    const bar = page.getByTestId('scoreup-bar').first();
    await bar.waitFor({ timeout: 20000 });
    const cardId = await bar.getAttribute('data-card-id');
    const src = await bar.locator('img').getAttribute('src');
    // cardID ではなく ID ベースであること（過去のフィールド取り違えバグの再発防止）
    expect(cardId).toBeTruthy();
    expect(src).toMatch(new RegExp(`/assets/th_cards/${cardId}\\.png$`));
  });

  test('棒をクリックすると詳細比較パネルが開閉する', async ({ page }) => {
    const bar = page.getByTestId('scoreup-bar').first();
    await bar.waitFor({ timeout: 20000 });
    await bar.click();
    await expect(page.getByTestId('compare-detail')).toBeVisible();
    await page.getByRole('button', { name: '✕ クリア' }).click();
    await expect(page.getByTestId('compare-detail')).toBeHidden();
  });

  test('楽曲セレクタの初期選択が DIAMOND FUSION', async ({ page }) => {
    const select = page.getByLabel(/楽曲/);
    await expect(select).toBeVisible({ timeout: 20000 });
    const label = await select.locator('option:checked').textContent();
    expect(label).toContain('DIAMOND FUSION');
  });
});
