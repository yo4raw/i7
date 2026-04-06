/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        shout: '#ef4444',
        beat: '#3b82f6',
        melody: '#22c55e',
      },
    },
  },
  plugins: [],
};
