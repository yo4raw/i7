// i7マネ部屋(β) Service Worker
// ホーム画面追加・オフライン閲覧用。Workbox なしの軽量実装。
//
// キャッシュ戦略:
//   - /_astro/*                                  → CacheFirst (immutable hashed)
//   - /assets/cards|th_cards|songs/*             → CacheFirst (アセット)
//   - docs.google.com /spreadsheets/             → StaleWhileRevalidate (GViz)
//   - ナビゲーション (HTML)                       → NetworkFirst (フォールバック: cache → /)
//   - その他同オリジン                            → StaleWhileRevalidate
//
// SW_VERSION を上げると古い static キャッシュをパージする。

const SW_VERSION = 'v1';
const STATIC_CACHE = `i7-static-${SW_VERSION}`;
const IMG_CACHE = 'i7-images';
const GVIZ_CACHE = 'i7-gviz';
const KNOWN_CACHES = [STATIC_CACHE, IMG_CACHE, GVIZ_CACHE];
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('i7-static-') && k !== STATIC_CACHE)
        .map((k) => caches.delete(k))
    );
    // 未知のキャッシュも掃除
    await Promise.all(
      keys
        .filter((k) => !k.startsWith('i7-static-') && !KNOWN_CACHES.includes(k))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // GViz Google Sheets API
  if (url.hostname === 'docs.google.com' && url.pathname.includes('/spreadsheets/')) {
    event.respondWith(staleWhileRevalidate(req, GVIZ_CACHE));
    return;
  }

  // 同オリジンのみ以降
  if (url.origin !== self.location.origin) return;

  // 画像（衣装・サムネ・楽曲ジャケ）
  if (
    url.pathname.startsWith('/assets/cards/') ||
    url.pathname.startsWith('/assets/th_cards/') ||
    url.pathname.startsWith('/assets/songs/')
  ) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }

  // ハッシュ付き immutable アセット
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // ナビゲーション
  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(req));
    return;
  }

  // それ以外の同オリジン（favicon, manifest, アイコン PNG, robots.txt 等）
  event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return hit ?? Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetched = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await fetched) || Response.error();
}

async function navigationHandler(req) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    const root = await cache.match('/');
    if (root) return root;
    return Response.error();
  }
}
