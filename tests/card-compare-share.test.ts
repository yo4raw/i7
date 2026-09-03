import { test, expect } from './helpers/fixtures';

/** 共有パネルに載る上位件数（CompareSharePanel.svelte の TOP_N と揃える） */
const TOP_N = 10;
/** 共有画像が端末によらず同じになるよう固定しているパネル幅 */
const PANEL_WIDTH = 1024;

test.describe('衣装比較 SNS共有ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/card-compare/share/');
  });

  test('スコアアップと判定縮小の両方が1枚のパネルに Top10 で並ぶ', async ({ page }) => {
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(`スコアアップ Top${TOP_N}`)).toBeVisible();
    await expect(page.getByText(`判定縮小 Top${TOP_N}`)).toBeVisible();
    // タブ切り替えなしで両方が同時に見えることが共有画像の前提
    await expect(page.getByTestId('scoreup-bar')).toHaveCount(TOP_N);
    await expect(page.getByTestId('shrink-col')).toHaveCount(TOP_N);
  });

  test('パネルは幅固定で、画像ダウンロードの対象 id を持つ', async ({ page }) => {
    const panel = page.locator('#compare-share-panel');
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
    const box = await panel.boundingBox();
    expect(box?.width).toBe(PANEL_WIDTH);
    await expect(page.getByRole('button', { name: '画像をダウンロード' })).toBeVisible();
  });

  test('曲を変えるとパネルの見出しと集計が追従する', async ({ page }) => {
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
    const heading = page.locator('#compare-share-panel h2');
    const before = await heading.innerText();

    const songSelect = page.getByLabel('楽曲');
    const current = await songSelect.inputValue();
    const values = (await songSelect.locator('option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value),
    )).filter((v) => v !== '');
    const next = values.find((v) => v !== current);
    expect(next, '切り替え先の曲が2曲目以降にあること').toBeDefined();
    await songSelect.selectOption(next!);

    await expect(heading).not.toHaveText(before, { timeout: 20000 });
    await expect(page.getByTestId('scoreup-bar')).toHaveCount(TOP_N);
  });

  test('所持登録に関わらず UR 全着が母集団になる', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('i7_card_counts', JSON.stringify({ '1': 1 })));
    await page.reload();
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
    // 所持1着でも Top10 が埋まる（衣装比較の「所持のみ」は共有画像には効かせない）
    await expect(page.getByTestId('scoreup-bar')).toHaveCount(TOP_N);
    await expect(page.locator('#compare-share-panel')).toContainText(/UR 全 \d+ 着から Top10/);
  });
});
