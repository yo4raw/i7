import { test, expect } from '@playwright/test';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';
import { fetchCardsJson } from '../src/lib/data/fetchCardsJson';
import { isHighScoreEvent } from '../src/lib/data/eventBonusTiers';

const BASE = '';

test.describe('編成組合計算ページ', () => {
  // Worker 並列探索は組合せ数次第で数十秒かかるため余裕を持たせる
  test.setTimeout(180_000);

  test('過去のハイスコアイベントを選択すると探索が完走し最適編成が表示される', async ({ page }) => {
    // 「対象イベント」セレクタでハイスコアイベントを明示選択する（過去イベント選択可）。
    // 探索対象は選択イベントの 金特効 / 銀特効 のうち UR 衣装のみ。記念日/周年系は
    // UR 特効が数十〜数百枚あり組合せが膨大で E2E 完走不能なため、ビルドに焼き込まれる
    // のと同じ events.csv / カードデータから「終了済み（= 特効が GViz 登録済み）かつ
    // UR 特効候補が最少（2〜16 枚）」の終了済みハイスコアイベントを対象に選ぶ。
    const [events, cards] = await Promise.all([fetchEventsCsv(), fetchCardsJson()]);
    const urIds = new Set(cards.filter((c) => c.rarity === 'UR' && c.ID != null).map((c) => c.ID));
    const urCandidateCount = (e: (typeof events)[number]) => {
      const ids = new Set<number>([...e.gold.cardIds, ...e.silver.cardIds]);
      let n = 0;
      ids.forEach((id) => { if (urIds.has(id)) n++; });
      return n;
    };
    const pick = events
      .filter((e) => isHighScoreEvent(e.eventtype))
      .filter((e) => Date.parse(`${e.end_date}T17:00:00+09:00`) < Date.now())
      .map((e) => ({ e, ur: urCandidateCount(e) }))
      .filter(({ ur }) => ur >= 2 && ur <= 16)
      .sort((a, b) => a.ur - b.ur)[0]?.e;
    expect(pick, 'UR 特効が少数の終了済みハイスコアイベントが events.csv に存在すること').toBeTruthy();

    // 組合せ数が多い場合の confirm ダイアログは許可する
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(`${BASE}/score-calc/max-score-finder/`);
    await page.waitForFunction(
      () => document.querySelectorAll('#song-select option').length > 1,
      undefined,
      { timeout: 20000 },
    );

    // 対象イベントを明示選択する
    await page.getByLabel('対象イベント').selectOption(String(pick.id));

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
