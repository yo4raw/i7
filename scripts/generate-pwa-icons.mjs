#!/usr/bin/env node
/**
 * PWA アイコン PNG を public/ 配下に生成する。
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * 出力ファイル:
 *   - public/pwa-192x192.png
 *   - public/pwa-512x512.png
 *   - public/pwa-maskable-512x512.png  (purpose=maskable, safe-zone 余白付き)
 *   - public/apple-touch-icon.png      (180x180)
 *
 * favicon.svg はテキスト "7" のみで PWA アイコンとして弱いため、
 * indigo (#4f46e5) 背景 + 白い "7" の合成 SVG をスクリプト内で生成する。
 */

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

const BG = '#4f46e5';

function pwaSvg(size, padding = 0) {
  const inner = size - padding * 2;
  const fontSize = Math.round(inner * 0.7);
  const x = padding + inner * 0.18;
  const y = padding + inner * 0.82;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff">7</text>
</svg>`;
}

async function render(size, file, { maskable = false } = {}) {
  const padding = maskable ? Math.round(size * 0.1) : 0;
  const svg = pwaSvg(size, padding);
  const out = resolve(publicDir, file);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`generated: public/${file}`);
}

await render(192, 'pwa-192x192.png');
await render(512, 'pwa-512x512.png');
await render(512, 'pwa-maskable-512x512.png', { maskable: true });
await render(180, 'apple-touch-icon.png');
