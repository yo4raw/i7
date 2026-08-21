import { test, expect } from './helpers/fixtures';

const BASE = '';

test.describe('スコア計算ページ', () => {
  // MC シミュレーションは CPU バウンドで、並列実行時はコアの奪い合いで大きく伸びる。
  // playwright.config.ts の既定 30 秒では枯渇時に足りないため上書きする。
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/score-calc/`);
    // GViz から楽曲リストがクライアントサイドで読み込まれるのを待つ
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );
  });

  test('楽曲選択 → 衣装配置 → シミュレーション計算が完走する', async ({ page }) => {
    // 楽曲を選択 (先頭の実曲。option[0] はプレースホルダ)
    const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
    await page.locator('#song-select').selectOption(firstValue!);
    await expect(page.locator('#song-info')).toBeVisible();

    // センタースロットをクリックして衣装ピッカーを開く
    await page.locator('[data-slot-btn="0"]').click();
    await expect(page.locator('#card-picker-modal')).toBeVisible();

    // 「所持衣装のみ」を解除する (クリーンな環境では所持衣装が 0 件で一覧が空になるため)
    await page.locator('#modal-owned-only').uncheck();

    // 先頭の衣装を選択するとピッカーが閉じる
    await page.locator('[data-pick-card]').first().waitFor({ timeout: 15000 });
    await page.locator('[data-pick-card]').first().click();
    await expect(page.locator('#card-picker-modal')).toBeHidden();

    // 理論値 (最小/最大) が数値表示に変わる
    await expect(page.locator('#score-min')).toHaveText(/[\d,]+/);
    await expect(page.locator('#score-max')).toHaveText(/[\d,]+/);

    // 試行回数を 100 に下げて MC シミュレーションを実行
    await page.locator('#mc-iterations-input').fill('100');
    const calcBtn = page.locator('#btn-calculate');
    await expect(calcBtn).toBeEnabled();
    await calcBtn.click();

    // シミュレーション結果が表示される。
    // MC シミュレーションは CPU バウンドで、Playwright が複数ワーカーで並列実行すると
    // ブラウザ同士がコアを奪い合って単独実行の数倍かかる（実測で 20 秒を超過して落ちた）。
    // 枯渇時の最悪値に合わせて確保する。
    await expect(page.locator('#mc-results')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('#mc-mean')).toHaveText(/[\d,]+/);
    await expect(page.locator('#final-result')).toHaveText(/[\d,]+/);
  });

  test('楽曲を選択すると共通ブローチ スコア寄与 TOP10 が表示される', async ({ page }) => {
    const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
    await page.locator('#song-select').selectOption(firstValue!);

    const section = page.locator('#broach-ranking-section');
    await expect(section).toBeVisible();
    await expect(section).toContainText('共通ブローチ スコア寄与 TOP10');

    const items = section.locator('ol li');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);
    // 1位の行にスコア値（数字）が出る
    await expect(items.first()).toContainText(/[\d,]+/);
  });
});
