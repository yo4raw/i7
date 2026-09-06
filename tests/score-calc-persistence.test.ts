import { test, expect } from './helpers/fixtures';
import { type Page } from '@playwright/test';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';
import { fetchCardsJson } from '../src/lib/data/fetchCardsJson';
import { isHighScoreEvent } from '../src/lib/data/eventBonusTiers';
import { classifyEventStatus } from '../src/lib/data/eventPeriod';

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

    await page.locator('#btn-save-deck').click();
    // 自前のデッキ名入力ダイアログ (ネイティブ prompt の置き換え)
    const nameDialog = page.getByTestId('modal-dialog');
    await expect(nameDialog).toBeVisible();
    await nameDialog.getByRole('textbox').fill('E2Eテストデッキ');
    await nameDialog.getByRole('button', { name: '保存する' }).click();
    await expect(nameDialog).toBeHidden();

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

/** 終了済みハイスコアイベントと、その金特効のうちカードデータに存在する衣装 ID を 1 組選ぶ */
async function pickPastEventWithGold() {
  const [events, cards] = await Promise.all([fetchEventsCsv(), fetchCardsJson()]);
  const cardIds = new Set(cards.map((c) => c.ID));
  for (const e of events.toSorted((a, b) => b.start_date.localeCompare(a.start_date))) {
    if (!isHighScoreEvent(e.eventtype) || classifyEventStatus(e.start_date, e.end_date) !== 'past') continue;
    const goldId = e.gold.cardIds.find((id) => cardIds.has(id));
    if (goldId !== undefined) return { eventId: e.id, goldId };
  }
  throw new Error('終了済みハイスコアイベントの金特効衣装が見つかりません');
}

/** 対象イベントを選び、センターに金特効衣装を置く */
async function placeGoldCard(page: Page, eventId: number, goldId: number) {
  await page.getByLabel('対象イベント').selectOption(String(eventId));
  await page.locator('[data-slot-btn="0"]').click();
  await page.locator('#modal-owned-only').uncheck();
  await page.locator(`[data-pick-card="${goldId}"]`).click();
  await expect(page.locator('#card-picker-modal')).toBeHidden();
}

test.describe('スコア計算ページ 対象イベントの特効反映', () => {
  test('選んだイベントの金特効衣装を置くとスロットの特効段階が金になる', async ({ page }) => {
    const { eventId, goldId } = await pickPastEventWithGold();
    await page.goto(`${BASE}/score-calc/`);
    await placeGoldCard(page, eventId, goldId);
    await expect(page.locator('[data-bonus-slot="0"]')).toHaveValue('gold');
  });

  test('対象イベントを切り替えると配置済みスロットの特効段階が選び直される', async ({ page }) => {
    const { eventId, goldId } = await pickPastEventWithGold();
    await page.goto(`${BASE}/score-calc/`);
    await placeGoldCard(page, eventId, goldId);
    await page.getByLabel('対象イベント').selectOption('');
    await expect(page.locator('[data-bonus-slot="0"]')).toHaveValue('none');
  });

  test('選んだ対象イベントがリロード後も復元される', async ({ page }) => {
    const { eventId, goldId } = await pickPastEventWithGold();
    await page.goto(`${BASE}/score-calc/`);
    await placeGoldCard(page, eventId, goldId);
    await page.reload();
    await expect(page.getByLabel('対象イベント')).toHaveValue(String(eventId));
  });
});
