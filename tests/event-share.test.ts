import { test, expect } from './helpers/fixtures';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';
import { fetchCardsJson, type Card } from '../src/lib/data/fetchCardsJson';

const BASE = '';
/** 1 枚あたりの掲載数（横 8 × 縦 2）。EventSharePanel.astro と揃える */
const PER_IMAGE = 16;

let eventId = 0;
let expectedPanels = 0;

test.beforeAll(async () => {
  const [events, cards] = await Promise.all([fetchEventsCsv(), fetchCardsJson()]);
  const urIds = new Set(
    (cards as Card[]).filter((c) => c.ID !== null && c.rarity === 'UR').map((c) => c.ID as number)
  );
  const countUr = (ids: number[]): number => ids.filter((id) => urIds.has(id)).length;

  // 複数枚に分割されるイベント（UR の銀特効が最も多いもの）を対象にする
  const target = events
    .map((ev) => ({ ev, gold: countUr(ev.gold.cardIds), silver: countUr(ev.silver.cardIds) }))
    .filter((x) => x.silver > PER_IMAGE)
    .toSorted((a, b) => b.silver - a.silver)[0];
  if (!target) throw new Error(`UR 銀特効が ${PER_IMAGE} 着を超えるイベントが events.csv にありません`);

  eventId = target.ev.id;
  expectedPanels =
    Math.ceil(target.gold / PER_IMAGE) + Math.ceil(target.silver / PER_IMAGE);
});

test.describe('イベント SNS 共有 (UR)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/events/${eventId}/share/ur/`);
  });

  test('1 枚 16 着ずつのパネルに分割される', async ({ page }) => {
    const panels = page.locator('[id^="share-panel-"]');
    await expect(panels).toHaveCount(expectedPanels);

    const counts = await panels.evaluateAll((els) =>
      els.map((el) => el.querySelectorAll('img').length)
    );
    // どのパネルも 16 着以下。最後の 1 枚以外は 16 着ちょうど
    for (const n of counts) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(PER_IMAGE);
    }
    // 段階ごとに分割するため、16 着未満のパネルは各段階の末尾だけ
    expect(counts.filter((n) => n < PER_IMAGE).length).toBeLessThanOrEqual(2);
  });

  test('グリッドは横 8 列', async ({ page }) => {
    const grid = page.locator('[id^="share-panel-"] .grid').first();
    const columns = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length
    );
    expect(columns).toBe(8);
  });

  test('ダウンロードボタンでパネル枚数ぶんの PNG が保存される', async ({ page }) => {
    test.slow(); // modern-screenshot で複数枚を書き出すため時間がかかる
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));

    await page.getByRole('button', { name: /画像をダウンロード/ }).click();

    await expect(() => expect(downloads.length).toBe(expectedPanels)).toPass({ timeout: 120_000 });
    for (const [i, name] of downloads.entries()) {
      expect(name).toBe(`${downloads[0].replace(/_\d+\.png$/, '')}_${i + 1}.png`);
    }
  });
});
