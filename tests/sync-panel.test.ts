import { test, expect } from './helpers/fixtures';

/** Supabase への通信を全遮断する（オフライン相当） */
async function blockSupabase(page: import('@playwright/test').Page) {
  await page.route('**/*.supabase.co/**', (route) => route.abort());
}

test('未ログイン時はログインの導線だけを出す', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByTestId('sync-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'ログイン（端末間で同期）' })).toBeVisible();
  await expect(panel.getByTestId('sync-status')).toHaveCount(0);
});

test('同期 UI を足してもフッターのバックアップ UI は動く', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'エクスポート' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'インポート' })).toBeVisible();
});

test('Supabase を全遮断しても所持衣装の登録が動く', async ({ page }) => {
  // ブリーフ記載のロケータ (/mycard/ の「+」ボタン) は実態と食い違うため修正:
  // 「+」ボタンは既に所持数が登録された衣装だけを表示する /mycard/ には無く、
  // 一覧である /cards/ の CountInput (src/components/cards/CountInput.svelte) にある。
  // またそのボタンの accessible name はテキスト「+」ではなく aria-label
  // 「所持数を1増やす」(aria-label がテキストを上書きするため)
  await blockSupabase(page);
  await page.goto('/cards/');
  // 所持数を 1 件登録し、リロード後も残ることを確認する
  const plus = page.getByRole('button', { name: '所持数を1増やす' }).first();
  await plus.click();
  await page.reload();
  const counts = await page.evaluate(() => localStorage.getItem('i7_card_counts'));
  expect(counts).not.toBeNull();
  expect(Object.keys(JSON.parse(counts ?? '{}')).length).toBeGreaterThan(0);
});

test('Supabase を全遮断してもスコア計算ページが開ける', async ({ page }) => {
  await blockSupabase(page);
  await page.goto('/score-calc/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('同期の取り込み通知で未保存のラビットノート編集を消さない', async ({ page }) => {
  await page.goto('/rabbit-note/');
  const input = page.locator('input[type="number"]').first();
  await input.fill('7');
  await input.dispatchEvent('change');
  // 背後の同期が取り込みを知らせても、保存前の入力は残ること
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('i7:sync-applied')));
  await expect(input).toHaveValue('7');
});
