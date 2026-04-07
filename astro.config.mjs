import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://yo4raw.github.io',
  base: '/i7/',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
