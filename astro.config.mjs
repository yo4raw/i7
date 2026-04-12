import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// デプロイ先を DEPLOY_TARGET で切り替え（未指定は GitHub Pages 互換）
//   - github    : https://yo4raw.github.io/i7/
//   - cloudflare : https://<project>.pages.dev/
const deployTarget = process.env.DEPLOY_TARGET || 'github';

const siteConfig = deployTarget === 'cloudflare'
  ? { site: 'https://i7.pages.dev', base: '/' }
  : { site: 'https://yo4raw.github.io', base: '/i7/' };

export default defineConfig({
  ...siteConfig,
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
