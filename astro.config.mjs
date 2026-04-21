import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import compress from '@playform/compress';

export default defineConfig({
  site: 'https://i7.yo4raw.com',
  output: 'static',

  integrations: [
    compress({
      CSS: true,
      HTML: true,
      JavaScript: true,
      JSON: true,
      SVG: true,
      Image: true,
      Logger: 1,
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
