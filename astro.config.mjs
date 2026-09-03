import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import compress from '@playform/compress';
import sitemap from '@astrojs/sitemap';

import svelte from '@astrojs/svelte';

// sitemap の lastmod (ADR 0063)。
// ビルド日時を入れると毎時ビルドで全 246 ページが毎回「更新された」ことになり、
// 嘘のシグナルとして lastmod 自体が無視される。ページの内容を決めている
// ソースファイルの git 最終コミット日を使う。
const lastmodCache = new Map();

function lastmodOf(file) {
  if (lastmodCache.has(file)) return lastmodCache.get(file);
  let iso = '';
  try {
    // --literal-pathspecs: `songs/[id].astro` の角括弧がパススペックの
    // 文字クラスとして解釈されるのを防ぐ
    iso = execFileSync('git', ['--literal-pathspecs', 'log', '-1', '--format=%cI', '--', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // git が無い / 履歴が浅い環境ではファイルの更新時刻で代替する
  }
  if (!iso && existsSync(file)) iso = statSync(file).mtime.toISOString();
  const value = iso || undefined;
  lastmodCache.set(file, value);
  return value;
}

/**
 * URL の内容を決めているソースファイルを返す。
 * 楽曲データは GViz のクライアントフェッチでビルド時に持たないため、
 * 楽曲詳細の lastmod は「その静的 HTML が最後に変わった日」= テンプレートの更新日になる。
 */
function sourceOf(url) {
  const path = new URL(url).pathname;
  if (/^\/songs\/\d+\/$/.test(path)) return 'src/pages/songs/[id].astro';
  if (/^\/events\/\d+\/$/.test(path)) return 'public/events/events.csv';
  // ルーティングは `foo/index.astro` と `foo.astro` の両方を取りうる
  const asIndex = `src/pages${path}index.astro`;
  if (existsSync(asIndex)) return asIndex;
  return `src/pages${path.replace(/\/$/, '')}.astro`;
}

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
        && !/\/card-compare\/share\/?$/.test(page)
        && !/\/(mycard|decks|rabbit-note|shared-broach)\/?$/.test(page),
      serialize(item) {
        const url = item.url;
        const lastmod = lastmodOf(sourceOf(url));
        const entry = lastmod ? { ...item, lastmod } : { ...item };
        if (/\/songs\/\d+\/?$/.test(url)) {
          return { ...entry, changefreq: 'weekly', priority: 0.7 };
        }
        if (/\/events\/\d+\/?$/.test(url)) {
          return { ...entry, changefreq: 'weekly', priority: 0.8 };
        }
        if (url.replace(/\/$/, '').endsWith('yo4raw.com')) {
          return { ...entry, changefreq: 'daily', priority: 1.0 };
        }
        return { ...entry, changefreq: 'weekly', priority: 0.6 };
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