import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://yo4raw.github.io',
  base: '/i7',
  integrations: [tailwind()],
  output: 'static',
});
