import { test, expect } from './helpers/fixtures';
import { readdirSync } from 'node:fs';
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
    for (const path of ['/mycard/', '/decks/', '/rabbit-note/', '/shared-broach/', '/card-compare/share/']) {
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
    // @astrojs/sitemap はビルド時にしか生成しないため、dev サーバー上では検証できない。
    // 本番ビルド (npm run preview / CI) での実行時のみ有効なテスト。
    test.skip(res.status() === 404, 'sitemap はビルド成果物のため dev サーバーでは検証できない');
    expect(res.ok()).toBe(true);
    const xml = await res.text();

    // noindex にしたページを sitemap に載せると矛盾したシグナルになる
    expect(xml).not.toMatch(/<loc>[^<]*\/cards\/\d+\/<\/loc>/);
    expect(xml).not.toMatch(/<loc>[^<]*\/events\/\d+\/share\//);
    for (const path of ['/mycard/', '/decks/', '/rabbit-note/', '/shared-broach/', '/card-compare/share/']) {
      expect(xml, `${path} は sitemap から外れていること`).not.toContain(`<loc>https://i7.yo4raw.com${path}</loc>`);
    }

    for (const path of ['/', '/cards/', '/songs/', '/events/', '/score-calc/spec/']) {
      expect(xml, `${path} は sitemap に載っていること`).toContain(`<loc>https://i7.yo4raw.com${path}</loc>`);
    }
  });
});

test.describe('ツールページの静的な解説 (ADR 0058)', () => {
  const TOOLS = [
    { path: '/score-calc/', label: 'スコア計算' },
    { path: '/score-calc/max-score-finder/', label: '編成組合計算' },
    { path: '/card-compare/', label: '衣装比較' },
    { path: '/point-calc/', label: 'ポイント芸計算' },
  ];

  for (const { path, label } of TOOLS) {
    test(`${label}にビルド時出力の解説セクションがある`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      const guide = page.locator('section[aria-labelledby="tool-guide-heading"]');
      await expect(guide).toBeVisible();
      await expect(guide.getByRole('heading', { name: '使い方' })).toBeVisible();
      // 手順が空のまま公開されるのを防ぐ
      expect(await guide.locator('ol > li').count()).toBeGreaterThanOrEqual(3);
    });
  }

  test('解説はクライアント JS ではなく静的 HTML に含まれる', async ({ page }) => {
    // JS 実行前の生 HTML に入っていないと検索エンジンに提示できない
    const res = await page.request.get(`${BASE}/score-calc/`);
    const html = await res.text();
    expect(html).toContain('tool-guide-heading');
    expect(html).toContain('このツールについて');
  });
});

test.describe('サイト内リンクの到達性', () => {
  // グローバルナビ (HeaderNav.svelte) のドロップダウン内リンクは
  // {#if openDropdown === ...} の内側にあり初期 HTML に出力されない。
  // クローラーはドロップダウンを開かないため、フッターのリンク集が
  // ツールページへ到達する唯一の静的な経路になっている。
  const LINKED_PATHS = [
    '/',
    '/cards/',
    '/songs/',
    '/events/',
    '/score-calc/',
    '/score-calc/spec/',
    '/score-calc/max-score-finder/',
    '/card-compare/',
    '/point-calc/',
    '/about/',
    '/releases/',
  ];

  /** JS 実行前の生 HTML からフッターのリンク集の href を取り出す */
  async function footerHrefs(page: import('@playwright/test').Page, from: string): Promise<string[]> {
    const html = await (await page.request.get(`${BASE}${from}`)).text();
    const nav = html.match(/<nav[^>]*aria-label=["']?サイト内リンク["']?[^>]*>[\s\S]*?<\/nav>/)?.[0];
    expect(nav, `${from} の静的 HTML にフッターのリンク集がある`).toBeTruthy();
    return [...(nav ?? '').matchAll(/href=["']?([^"'\s>]+)/g)].map((m) => m[1]);
  }

  for (const from of ['/', '/cards/', '/events/']) {
    test(`${from} のフッターから indexable な全ページへ静的にリンクしている`, async ({ page }) => {
      const hrefs = await footerHrefs(page, from);
      for (const path of LINKED_PATHS) {
        expect(hrefs, `${from} から ${path} へリンクしていること`).toContain(path);
      }
    });
  }

  test('noindex のページはフッターのリンク集に含めない', async ({ page }) => {
    // noindex ページへのリンクは検索評価の面で意味がなく、リンク先を薄める
    const hrefs = await footerHrefs(page, '/');
    for (const path of ['/mycard/', '/decks/', '/rabbit-note/', '/shared-broach/', '/card-compare/share/']) {
      expect(hrefs, `${path} は含めないこと`).not.toContain(path);
    }
  });
});

test.describe('sitemap の lastmod', () => {
  test('全 URL に lastmod があり、ビルド日時の一律出力になっていない', async ({ page }) => {
    const res = await page.request.get(`${BASE}/sitemap-0.xml`);
    // @astrojs/sitemap はビルド時にしか生成しないため dev サーバー上では検証できない
    test.skip(res.status() === 404, 'sitemap はビルド成果物のため dev サーバーでは検証できない');
    expect(res.ok()).toBe(true);
    const xml = await res.text();

    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
    expect(entries.length).toBeGreaterThan(0);

    const lastmods = new Set<string>();
    for (const entry of entries) {
      const loc = entry.match(/<loc>([^<]*)<\/loc>/)?.[1];
      const lastmod = entry.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1];
      expect(lastmod, `${loc} に lastmod があること`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      lastmods.add(lastmod!);
    }

    // 全 URL が同じ値ならビルド日時を入れている。毎時ビルドで全ページが
    // 毎回更新された扱いになり、嘘のシグナルとして lastmod 自体が無視される。
    expect(lastmods.size, 'lastmod が全 URL で同一 = ビルド日時を出力している疑い').toBeGreaterThan(1);
  });
});

test.describe('IndexNow (ADR 0063)', () => {
  test('キーファイルが配信され、中身がファイル名と一致する', async ({ page }) => {
    // 404 や中身の不一致だと所有証明が通らず通知が全て拒否されるが、
    // デプロイ自体は成功したように見えるため気付けない。
    const files = readdirSync('public').filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
    expect(files, 'public/ の IndexNow キーファイルは 1 個であること').toHaveLength(1);
    const key = files[0].replace(/\.txt$/, '');

    const res = await page.request.get(`${BASE}/${files[0]}`);
    expect(res.ok(), 'キーファイルが配信されること').toBe(true);
    expect((await res.text()).trim()).toBe(key);
  });
});
