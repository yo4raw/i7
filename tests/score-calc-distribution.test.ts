import { test, expect } from './helpers/fixtures';

const BASE = '';

test('スコア計算画面にスキル上乗せ分布セクションが表示される', async ({ page }) => {
  await page.goto(`${BASE}/score-calc/`);

  // GViz から楽曲リストがクライアントサイドで読み込まれるのを待つ
  await page.waitForFunction(
    () => document.querySelectorAll('#song-select option').length > 1,
    undefined,
    { timeout: 20000 },
  );

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

  // 衣装投入後、スキル上乗せ分布セクションの見出しが表示される
  await expect(page.getByRole('heading', { name: 'スキル上乗せ分布' })).toBeVisible();
});
