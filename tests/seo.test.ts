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

test.describe('インデックス対象の絞り込み (ADR 0057)', () => {
  test('衣装詳細は noindex,follow で、クロール自体は許可される', async ({ page }) => {
    const cards = await fetchCardsJson();
    const id = (cards as Array<{ ID: number }>)[0].ID;
    await page.goto(`${BASE}/cards/${id}/`);
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', 'noindex,follow');
  });

  test('個人データページと共有ページも noindex になる', async ({ page }) => {
    for (const path of ['/mycard/', '/decks/', '/rabbit-note/', '/shared-broach/']) {
      await page.goto(`${BASE}${path}`);
      await expect(page.locator('meta[name="robots"]'), `${path} は noindex であること`)
        .toHaveAttribute('content', 'noindex,follow');
    }
  });

  test('ツール系・一覧ページには robots メタが付かない', async ({ page }) => {
    for (const path of ['/', '/cards/', '/songs/', '/events/', '/score-calc/', '/score-calc/spec/', '/card-compare/', '/point-calc/']) {
      await page.goto(`${BASE}${path}`);
      await expect(page.locator('meta[name="robots"]'), `${path} は index 対象であること`).toHaveCount(0);
    }
  });

  test('sitemap に衣装詳細が含まれず、ツール系ページは含まれる', async ({ page }) => {
    const res = await page.request.get(`${BASE}/sitemap-0.xml`);
    expect(res.ok()).toBe(true);
    const xml = await res.text();

    // noindex にしたページを sitemap に載せると矛盾したシグナルになる
    expect(xml).not.toMatch(/<loc>[^<]*\/cards\/\d+\/<\/loc>/);
    expect(xml).not.toMatch(/<loc>[^<]*\/events\/\d+\/share\//);
    for (const path of ['/mycard/', '/decks/', '/rabbit-note/', '/shared-broach/']) {
      expect(xml, `${path} は sitemap から外れていること`).not.toContain(`<loc>https://i7.yo4raw.com${path}</loc>`);
    }

    for (const path of ['/', '/cards/', '/songs/', '/events/', '/score-calc/spec/']) {
      expect(xml, `${path} は sitemap に載っていること`).toContain(`<loc>https://i7.yo4raw.com${path}</loc>`);
    }
  });
});
