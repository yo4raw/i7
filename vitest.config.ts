import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // Svelte 5 runes ストア（src/lib/stores/*.svelte.ts）をテストするためにコンパイルする
  plugins: [svelte({ compilerOptions: { dev: false } })],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['**/*.d.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      // src/lib 全体に対するグローバルしきい値。下回ると vitest が exit≠0 で CI を落とす。
      // 到達不能な防御的分岐は各所の /* v8 ignore */ で個別除外している。
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
