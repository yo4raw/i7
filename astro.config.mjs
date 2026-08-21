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
      // インデックス対象を絞る (ADR 0057)。ページ側の noindex と必ず対で設定すること。
      //   - 衣装詳細 2824 件: 元データが既にインデックス済みの i7.step-on-dream.net 由来で、
      //     1 ページあたりの独自テキストも中央値 515 文字と薄い
      //   - イベント共有ページ 150 件: SNS 共有用のレアリティ別抜粋で、イベント詳細と内容が重複する
      //   - 個人データページ 4 件: localStorage 依存で静的 HTML が実質空 (144〜929 文字)
      // 無名ドメインで 3223 ページを申告すると評価が薄く広がり、全ページが
      // 「クロール済み - インデックス未登録」になるため、独自性のあるページへ集中させる。
      filter: (page) =>
        !/\/cards\/\d+\/?$/.test(page)
        && !/\/events\/\d+\/share\//.test(page)
        && !/\/(mycard|decks|rabbit-note|shared-broach)\/?$/.test(page),
      serialize(item) {
        const url = item.url;
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