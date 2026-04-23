import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4321',
    headless: true,
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321/',
    reuseExistingServer: true,
    // 本番ビルドは 2779 ページ生成で実測 5.5 分かかるため、初回起動を考慮して 7 分確保
    timeout: 420000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
