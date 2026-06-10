import { test, expect } from '@playwright/test';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';
import { isEventLive } from '../src/lib/data/eventBonusTiers';

const BASE = '';

test.describe('編成組合計算ページ', () => {
  // Worker 並列探索は組合せ数次第で数十秒かかるため余裕を持たせる
  test.setTimeout(180_000);

  test('イベント開催中の時刻に固定すると探索が完走し最適編成が表示される', async ({ page }) => {
    // ビルドに焼き込まれるものと同じ events.csv からイベントを選び、
    // その開催初日の正午 (JST) にページ内時刻を固定する。
    // 単純に「最新イベント」を選ぶと記念日/周年系で特効 UR が 90 枚超 →
    // 組合せが 100 億通り超（推定 50 時間以上）になり E2E では完走不能なため、
    // 「終了済み（= 特効カードが GViz 登録済み）かつ、その時点で開催中の全イベントの
    // 特効カード合計が 2〜12 枚」のイベントのうち最新のものを選ぶ。
    const events = await fetchEventsCsv();
    const poolAt = (t: number) =>
      events
        .filter((e) => isEventLive(e.start_date, e.end_date, t))
        .reduce((sum, e) => sum + e.gold.cardIds.length + e.silver.cardIds.length, 0);
    const pick = events
      .filter((e) => Date.parse(`${e.end_date}T17:00:00+09:00`) < Date.now())
      .map((e) => ({ e, t: Date.parse(`${e.start_date}T12:00:00+09:00`) }))
      .filter(({ t }) => {
        const pool = poolAt(t);
        return pool >= 2 && pool <= 12;
      })
      .sort((a, b) => b.t - a.t)[0];
    expect(pick, '特効カードが少数の終了済みイベントが events.csv に存在すること').toBeTruthy();
    await page.clock.setFixedTime(pick.t);

    // 組合せ数が多い場合の confirm ダイアログは許可する
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(`${BASE}/score-calc/max-score-finder/`);
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );

    // 開催中イベントのパネルが表示される
    await expect(page.getByRole('heading', { name: /現在開催中のイベント/ })).toBeVisible();

    // 楽曲を選択
    const firstValue = await page.locator('#song-select option').nth(1).getAttribute('value');
    await page.locator('#song-select').selectOption(firstValue!);

    // 探索を実行
    const searchBtn = page.getByRole('button', { name: /総当たり探索を開始/ });
    await expect(searchBtn).toBeEnabled({ timeout: 15000 });
    await searchBtn.click();

    // Worker 並列探索の完了を待ち、最適編成と上位候補が表示される
    await expect(page.getByRole('heading', { name: /最適編成/ })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByRole('heading', { name: /上位候補 TOP 10/ })).toBeVisible();
  });
});
