import { test, expect } from './helpers/fixtures';
import { fetchCardsJson } from '../src/lib/data/fetchCardsJson';

const BASE = '';

/** ページ内の全 JSON-LD を @type 配列で取得する */
function jsonLdTypes(page: import('@playwright/test').Page): Promise<string[]> {
  return page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.flatMap((n) => {
      try {
        const data = JSON.parse(n.textContent || '{}');
        const arr = Array.isArray(data) ? data : [data];
        return arr.map((d) => d['@type']).filter(Boolean);
      } catch {
        return [];
      }
    }),
  );
}

test.describe('構造化データ (JSON-LD)', () => {
  test('トップページに WebSite / Organization がある', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const types = await jsonLdTypes(page);
    expect(types).toContain('WebSite');
    expect(types).toContain('Organization');
  });

  test('衣装詳細に CreativeWork と BreadcrumbList がある', async ({ page }) => {
    const cards = await fetchCardsJson();
    const id = (cards as Array<{ ID: number }>)[0].ID;
    await page.goto(`${BASE}/cards/${id}/`);
    const types = await jsonLdTypes(page);
    expect(types).toContain('CreativeWork');
    expect(types).toContain('BreadcrumbList');
  });

  for (const { path, label } of [
    { path: '/cards/', label: '衣装一覧' },
    { path: '/songs/', label: '楽曲一覧' },
    { path: '/events/', label: 'イベント情報' },
  ]) {
    test(`${label}に CollectionPage がある`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      const types = await jsonLdTypes(page);
      expect(types).toContain('CollectionPage');
    });
  }

  test('一覧・ツールページに固有の meta description が設定される', async ({ page }) => {
    const DEFAULT = 'アイドリッシュセブン (アイナナ) の衣装・楽曲・イベントを検索できるデータベース。スコア計算・所持衣装管理・特効衣装一覧などの便利ツールも提供します。';
    await page.goto(`${BASE}/score-calc/`);
    const desc = await page.locator('head meta[name="description"]').getAttribute('content');
    expect(desc).toBeTruthy();
    expect(desc).not.toBe(DEFAULT);
    expect(desc).toContain('スコア');
  });
});
