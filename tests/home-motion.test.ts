import { test, expect } from '@playwright/test';

test.describe('トップページのモーション (ADR 0054)', () => {
  test('reduced-motion ではフラグが立たず、要素は最初から可視', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'on');

    const heroBar = page.locator('[data-motion-group="hero-bar"]').first();
    await expect(heroBar).toHaveCSS('opacity', '1');

    const featureCard = page.locator('[data-motion-group="feature-0"]').first();
    await expect(featureCard).toHaveCSS('opacity', '1');
  });

  test('通常時はフラグが立ち、ヒーローと統計チップが再生済みになる', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');

    // 再生が終わった要素は data-motion-item が外れる
    await expect(page.locator('[data-motion-group="hero-text"][data-motion-item]')).toHaveCount(0);
    await expect(page.locator('[data-motion-group="hero-bar"][data-motion-item]')).toHaveCount(0);
    await expect(page.locator('[data-motion-group="stat-chip"][data-motion-item]')).toHaveCount(0);

    await expect(page.locator('[data-motion-group="hero-bar"]').first()).toHaveCSS('opacity', '1');
  });

  test('統計チップの数値がカウントアップ後に最終値になる', async ({ page }) => {
    await page.goto('/');

    const num = page.locator('[data-motion-group="stat-chip"] [data-count-to]').first();
    const target = Number(await num.getAttribute('data-count-to'));
    expect(target).toBeGreaterThan(0);
    await expect(num).toHaveText(target.toLocaleString('ja-JP'));
  });

  test('最下部まで一気にスクロールしても未再生の要素が残らない', async ({ page }) => {
    await page.goto('/');

    // IntersectionObserver は飛び越された要素にコールバックを出さないため、
    // rect ベースの sweep が効いていないとここで要素が隠れたまま残る
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-motion-item]')).toHaveCount(0);

    // 免責事項セクションまで到達して可視になっている
    await expect(page.locator('[data-motion-group="text-section"]').last()).toHaveCSS('opacity', '1');
  });

  test('スクロール後はすべての数値が最終値になる', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-motion-item]')).toHaveCount(0);

    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-count-to]')]
        .filter((el) => el.textContent !== Number(el.dataset.countTo).toLocaleString('ja-JP'))
        .length,
    )).toBe(0);
  });
});
