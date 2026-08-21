import { test as base, expect, type Page } from '@playwright/test';

/**
 * `client:load` の Astro 島がすべてハイドレートし終えるまで待つ。
 *
 * `astro-island` はハイドレート完了時に `ssr` 属性を外すため、それが尽きるのを待てばよい。
 */
export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

/**
 * `page.goto` / `page.reload` の直後にハイドレート完了を待つ `page` を提供する。
 *
 * ハイドレート前の要素をクリックするとイベントハンドラが未登録でクリックが握り潰され、
 * 「単独では通るが並列実行時（= マシン負荷が高いとき）だけ落ちる」フレークになる。
 * 実際に `shared-broach` / `event-detail` などで断続的に発生していたため、個々のテストに
 * 待機を書き足すのではなく、遷移のたびに必ず待つ形で一括して塞ぐ。
 *
 * E2E テストは `@playwright/test` ではなくこのモジュールから `test` を import すること。
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const wrap = <T extends unknown[], R>(fn: (...args: T) => Promise<R>) =>
      async (...args: T): Promise<R> => {
        const result = await fn(...args);
        await waitForHydration(page);
        return result;
      };
    page.goto = wrap(page.goto.bind(page));
    page.reload = wrap(page.reload.bind(page));
    await use(page);
  },
});

export { expect };
