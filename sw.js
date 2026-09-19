const CACHE_NAME = 'sudoku-v2';

// オフライン動作用にキャッシュするファイル一覧
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './sketch.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
  'https://cdn.jsdelivr.net/npm/p5@1.11.10/lib/p5.min.js'
];

// インストール時に全アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 古いキャッシュの自動削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// キャッシュ優先（オフライン対応）のリクエスト制御
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // オフラインでキャッシュもない場合のフォールバック（HTMLリクエスト時）
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});