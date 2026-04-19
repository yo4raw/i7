import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const deployTarget = process.env.DEPLOY_TARGET ?? 'github-pages';

const siteConfig = deployTarget === 'cloudflare'
  ? {
      site: process.env.SITE_URL ?? 'https://i7.yo4raw.com',
      base: '/',
    }
  : {
      site: 'https://yo4raw.github.io',
      base: '/i7/',
    };

export default defineConfig({
  ...siteConfig,
  output: 'static',

  vite: {
    plugins: [tailwindcss()],
  },
});