import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest-setup.ts'],
    env: {
      DATABASE_URL: 'postgresql://i7user:i7password@localhost:5432/i7card?sslmode=disable'
    }
  }
});