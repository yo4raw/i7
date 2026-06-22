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

  test('判定縮小タブのソートセレクタは属性値/期待/最大の3択で既定は属性値由来スコア', async ({ page }) => {
    await page.getByRole('tab', { name: '判定縮小' }).click();
    await expect(page.getByTestId('shrink-col').first()).toBeVisible({ timeout: 20000 });
    const select = page.getByLabel('縮小ソート');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('attr');
    await select.selectOption('expected');
    await expect(page.getByTestId('shrink-col').first()).toBeVisible();
    await select.selectOption('max');
    await expect(page.getByTestId('shrink-col').first()).toBeVisible();
  });

  test('判定縮小タブはデュアルバー（属性値由来スコアの棒）を描画する', async ({ page }) => {
    await page.getByRole('tab', { name: '判定縮小' }).click();
    await expect(page.getByTestId('shrink-attr-bar').first()).toBeVisible({ timeout: 20000 });
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

  test('楽曲セレクタの先頭グループがイベント対象楽曲で初期選択がその先頭', async ({ page }) => {
    const select = page.getByLabel(/楽曲/);
    await expect(select).toBeVisible({ timeout: 20000 });
    // 先頭の optgroup は「イベント対象楽曲」
    const firstGroup = select.locator('optgroup').first();
    await expect(firstGroup).toHaveAttribute('label', 'イベント対象楽曲');
    // 初期選択はイベント対象楽曲グループの先頭 option
    const firstEventOption = firstGroup.locator('option').first();
    const checked = (await select.locator('option:checked').textContent()) ?? '';
    expect(checked).toBe((await firstEventOption.textContent()) ?? '');
  });

  test('衣装を選ぶと詳細パネルに分布チャートと一括しきい値スライダーが出る', async ({ page }) => {
    const bar = page.getByTestId('scoreup-bar').first();
    await expect(bar).toBeVisible({ timeout: 20000 });
    await bar.click();
    await expect(page.getByTestId('compare-detail')).toBeVisible();
    await expect(page.getByTestId('distribution-chart').first()).toBeVisible();
    await expect(page.getByLabel('一括しきい値').first()).toBeVisible();
  });

  test('スコアアップ衣装と縮小衣装を両方選ぶと分布チャートが2つに分かれる', async ({ page }) => {
    // 縦に長いビューポートで固定パネルがタブを覆わないようにする
    await page.setViewportSize({ width: 1280, height: 1400 });
    // 判定縮小タブを先に開いて縮小衣装を選択（詳細パネルが出る前にタブを切り替える）
    await page.getByRole('tab', { name: '判定縮小' }).click();
    const shrinkCol = page.getByTestId('shrink-col').first();
    await expect(shrinkCol).toBeVisible({ timeout: 20000 });
    // shrink-col 内のボタン（サムネイル）をクリックして選択
    await shrinkCol.locator('button').click();
    // 詳細パネルが表示されたことを確認
    await expect(page.getByTestId('compare-detail')).toBeVisible();
    // スコアアップタブに切り替えてスコアアップ衣装を追加選択
    await page.getByRole('tab', { name: 'スコアアップ' }).click();
    const scoreBar = page.getByTestId('scoreup-bar').first();
    await expect(scoreBar).toBeVisible({ timeout: 20000 });
    await scoreBar.click();
    await expect(page.getByTestId('distribution-chart')).toHaveCount(2);
  });

  test('特効イベントセレクタがあり、選択を切り替えられる', async ({ page }) => {
    const select = page.getByLabel('特効イベント');
    await expect(select).toBeVisible({ timeout: 20000 });

    // 先頭オプションは「特効なし」（value 空）
    await expect(select.locator('option').first()).toHaveText('特効なし');

    // 「特効なし」を選ぶと棒グラフは表示されたまま
    await select.selectOption('');
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
    await expect(select).toHaveValue('');

    // 先頭の実イベント（value が空でない最初の option）を選ぶと値が反映される
    const firstEventValue = await select.locator('option').nth(1).getAttribute('value');
    expect(firstEventValue).toBeTruthy();
    await select.selectOption(firstEventValue!);
    await expect(select).toHaveValue(firstEventValue!);
  });
});
