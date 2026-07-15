import { test, expect } from '@playwright/test';
import { SITE_NAME } from '../src/lib/constants';

test.describe('ホームページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('タイトルが正しい', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('ホーム');
    expect(title).toContain(SITE_NAME);
  });

  test('ナビゲーションリンクが存在する', async ({ page }) => {
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'ホーム' }).first()).toBeVisible();
    await expect(header.getByRole('link', { name: '衣装一覧' }).first()).toBeVisible();
    await expect(header.getByRole('link', { name: '楽曲一覧' }).first()).toBeVisible();
    await expect(header.getByRole('link', { name: '所持衣装' }).first()).toBeVisible();
  });

  test('主な機能カテゴリと衣装内訳が表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'データベース' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'スコア計算ツール' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '登録・管理' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '衣装内訳' })).toBeVisible();
  });

  test('追加機能（衣装比較・編成組合計算・共通ブローチ）のリンクカードがある', async ({ page }) => {
    await expect(page.locator('a[href$="/card-compare/"]')).toBeVisible();
    await expect(page.locator('a[href$="/score-calc/max-score-finder/"]')).toBeVisible();
    await expect(page.locator('a[href$="/shared-broach/"]')).toBeVisible();
  });

  test('衣装枚数と楽曲数が0より大きい', async ({ page }) => {
    const cardCount = page.locator('a[href$="/cards/"] .text-2xl');
    const text = await cardCount.textContent();
    expect(text).toMatch(/[\d,]+\s*枚/);
    const num = Math.trunc(Number(text!.replaceAll(/[^\d]/g, '')));
    expect(num).toBeGreaterThan(0);
  });
});
