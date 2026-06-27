import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import compress from '@playform/compress';
import sitemap from '@astrojs/sitemap';

import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://i7.yo4raw.com',
  output: 'static',

  integrations: [
    sitemap({
      serialize(item) {
        const url = item.url;
        if (/\/cards\/\d+\/?$/.test(url)) {
          return { ...item, changefreq: 'monthly', priority: 0.5 };
        }
        if (/\/songs\/\d+\/?$/.test(url)) {
          return { ...item, changefreq: 'weekly', priority: 0.7 };
        }
        if (/\/events\/\d+\/?$/.test(url)) {
          return { ...item, changefreq: 'weekly', priority: 0.8 };
        }
        if (url.replace(/\/$/, '').endsWith('yo4raw.com')) {
          return { ...item, changefreq: 'daily', priority: 1.0 };
        }
        return { ...item, changefreq: 'weekly', priority: 0.6 };
      },
    }),
    // CSS は Vite 内蔵の cssMinify に任せ、@playform/compress では圧縮しない。
    // astro 7 / vite 8 では Tailwind v4 のレスポンシブ variant が
    // `@media (width >= 48rem)` のモダンなレンジ構文で出力されるが、
    // @playform/compress 0.2.3 の CSS パーサはこれを解釈できず該当 @media ごと
    // 黙って削除してしまい、md:/lg: 等のレスポンシブ指定が全消失する。
    // Vite の minifier は同構文を正しく保持するため CSS のみ無効化する。
    compress({
      CSS: false,
      HTML: true,
      JavaScript: true,
      JSON: true,
      SVG: true,
      Image: false,
      Logger: 1,
    }),
    svelte(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});