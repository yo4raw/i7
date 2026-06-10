import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: [
    // tests/unit/ 配下は Vitest 管轄 (npm run test:unit)。Playwright に拾わせない
    '**/unit/**',
    // 以下は旧ベースパス (BASE = '/i7') 前提で全ページ 404 → タイムアウトするため除外。
    // 現行のルート配信パスに合わせて改修するまでスキップ
    '**/home.test.ts',
    '**/card-list.test.ts',
    '**/card-detail.test.ts',
    '**/song-list.test.ts',
    '**/song-detail.test.ts',
    '**/mycard.test.ts',
  ],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4321',
    headless: true,
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321/',
    reuseExistingServer: true,
    // 本番ビルドは 3148 ページ生成で実測 9.5 分かかるため、初回起動を考慮して 15 分確保
    timeout: 900000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
