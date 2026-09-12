const CACHE_NAME = 'sudoku-v1';
// キャッシュしたいファイルを一覧で指定します
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './sketch.js',
  './manifest.json',
  './icon.png',
  // CDNでp5.jsなどを読み込んでいる場合は、そのURLも指定します
  'https://cdn.jsdelivr.net/npm/p5@1.11.10/lib/p5.min.js'
];

// インストール時にファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// ネットワークからの読み込みに失敗したらキャッシュを返す（オフライン対応）
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});