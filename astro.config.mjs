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
    compress({
      CSS: true,
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