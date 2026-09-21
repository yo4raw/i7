import { test, expect } from './helpers/fixtures';
import { fetchEventsCsv } from '../src/lib/data/fetchEventsCsv';
import { fetchSongsJson, filterValidSongs, getEventSongIds } from '../src/lib/data/fetchSongsJson';

/** 共有パネルに載る上位件数（CompareSharePanel.svelte の SCORE_UP_TOP_N / SHRINK_TOP_N と揃える。ADR 0093） */
const SCORE_UP_TOP_N = 15;
const SHRINK_TOP_N = 10;
/** 共有画像が端末によらず同じになるよう固定しているパネル幅 */
const PANEL_WIDTH = 1024;

let eventId = 0;
let songCount = 0;

test.beforeAll(async () => {
  const [events, songs] = await Promise.all([fetchEventsCsv(), fetchSongsJson().then(filterValidSongs)]);
  const songIds = new Set(songs.map((s) => s.id));
  // 対象楽曲が最も多いイベントを対象にする（ADR 0090: 曲ごとに 1 枚）
  const target = events
    .map((ev) => ({ ev, count: getEventSongIds(ev.id).filter((id) => songIds.has(id)).length }))
    .filter((x) => x.count > 1)
    .toSorted((a, b) => b.count - a.count)[0];
  if (!target) throw new Error('対象楽曲が 2 曲以上登録されたイベントが event-songs.json にありません');
  eventId = target.ev.id;
  songCount = target.count;
});

test.describe('イベント SNS 共有 (衣装比較)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/events/${eventId}/share/card-compare/`);
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
  });

  test('対象楽曲ごとに 1 枚、スコアアップ Top15 と判定縮小 Top10 が同じパネルに並ぶ', async ({ page }) => {
    const panels = page.getByTestId('compare-share-panel');
    await expect(panels).toHaveCount(songCount);
    // タブ切り替えなしで両方が同時に見えることが共有画像の前提
    await expect(page.getByTestId('scoreup-bar')).toHaveCount(SCORE_UP_TOP_N * songCount);
    await expect(page.getByTestId('shrink-col')).toHaveCount(SHRINK_TOP_N * songCount);
    // 見出しにページ番号が出る
    await expect(panels.first().getByRole('heading')).toContainText(`1/${songCount}`);
    await expect(panels.last().getByRole('heading')).toContainText(`${songCount}/${songCount}`);
    // 曲行にジャケット、各列にシリーズ名が出る (ADR 0093)
    await expect(panels.first().getByTestId('share-song-jacket')).toBeVisible();
    await expect(page.getByTestId('compare-series')).toHaveCount((SCORE_UP_TOP_N + SHRINK_TOP_N) * songCount);
  });

  test('パネルは幅固定で、枚数ぶんのダウンロードボタンがある', async ({ page }) => {
    const box = await page.getByTestId('compare-share-panel').first().boundingBox();
    expect(box?.width).toBe(PANEL_WIDTH);
    await expect(page.getByRole('button', { name: `画像をダウンロード（${songCount} 枚）` })).toBeVisible();
  });

  test('所持登録に関わらず UR 全着が母集団になる', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('i7_card_counts', JSON.stringify({ '1': 1 })));
    await page.reload();
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
    // 所持1着でも Top15 が埋まる（衣装比較の「所持のみ」は共有画像には効かせない）
    await expect(page.getByTestId('scoreup-bar')).toHaveCount(SCORE_UP_TOP_N * songCount);
  });

  test('ダウンロードボタンで曲数ぶんの PNG が保存される', async ({ page }) => {
    // modern-screenshot で 1024px のパネルを曲数ぶん書き出す。並列実行で CPU が枯渇したときの最悪値（1 枚 30 秒超）に合わせる
    test.setTimeout(300_000);
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));

    await page.getByRole('button', { name: /画像をダウンロード/ }).click();

    await expect(() => expect(downloads.length).toBe(songCount)).toPass({ timeout: 280_000 });
    expect(downloads[0]).toMatch(new RegExp(`^${eventId}_.+_衣装比較_1\\.png$`));
    for (const [i, name] of downloads.entries()) {
      expect(name).toBe(`${downloads[0].replace(/_\d+\.png$/, '')}_${i + 1}.png`);
    }
  });
});
