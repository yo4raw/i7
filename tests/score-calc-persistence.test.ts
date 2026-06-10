import { test, expect, type Page } from '@playwright/test';

const BASE = '';

/** 楽曲を選択し、センタースロットに先頭の衣装を配置する共通操作 */
async function buildMinimalDeck(page: Page) {
  await page.waitForFunction(
    () => document.querySelectorAll('#song-select option').length > 1,
    undefined,
    { timeout: 20000 },
  );
  const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
  await page.locator('#song-select').selectOption(firstValue!);
  await page.locator('[data-slot-btn="0"]').click();
  await page.locator('#modal-owned-only').uncheck();
  await page.locator('[data-pick-card]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-pick-card]').first().click();
  await expect(page.locator('#card-picker-modal')).toBeHidden();
  return firstValue!;
}

test.describe('スコア計算ページ 永続化フロー', () => {
  test('編成状態がリロード後も localStorage から復元される', async ({ page }) => {
    await page.goto(`${BASE}/score-calc/`);
    const songValue = await buildMinimalDeck(page);

    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );
    await expect(page.locator('#song-select')).toHaveValue(songValue);
    await expect(page.locator('[data-slot-btn="0"] img').first()).toBeVisible();
  });

  test('デッキ保存 → 読込で編成が復元される', async ({ page }) => {
    await page.goto(`${BASE}/score-calc/`);
    await buildMinimalDeck(page);

    page.once('dialog', (d) => d.accept('E2Eテストデッキ'));
    await page.locator('#btn-save-deck').click();

    // 編成をクリア（ピッカーのクリアボタン）してから読込
    await page.locator('[data-slot-btn="0"]').click();
    await page.locator('#modal-clear').click();
    await expect(page.locator('[data-slot-btn="0"] img')).toHaveCount(0);

    await page.locator('#btn-load-deck').click();
    await page.locator('.load-deck-item').first().click();
    await expect(page.locator('[data-slot-btn="0"] img').first()).toBeVisible();
  });

  test('共有 URL から編成が復元される', async ({ page, context, browser }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${BASE}/score-calc/`);
    await buildMinimalDeck(page);

    await page.locator('#btn-share-url').click();
    // shareDeckUrl は clipboard API でコピー成功時にボタン表記を切り替える
    await expect(page.locator('#btn-share-url')).toHaveText(/コピーしました/);
    const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(sharedUrl).toContain('/score-calc/');
    expect(sharedUrl).toContain('dv=');

    // クリーンな状態（localStorage なし）で共有 URL を開く。
    // 同一 context だと localStorage が共有され、restoreState() のフォールバックが
    // URL 復元の失敗を隠すため、新規 context で開いて URL のみから復元させる
    const freshContext = await browser.newContext();
    const fresh = await freshContext.newPage();
    await fresh.goto(sharedUrl);
    await fresh.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );
    await expect(fresh.locator('[data-slot-btn="0"] img').first()).toBeVisible({ timeout: 15000 });
    await freshContext.close();
  });
});
