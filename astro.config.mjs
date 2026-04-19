import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://i7.yo4raw.com',
  output: 'static',

  vite: {
    plugins: [tailwindcss()],
  },
});
