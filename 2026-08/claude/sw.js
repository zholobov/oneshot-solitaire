// Cache-first service worker. Bump CACHE on every release so clients update.
const CACHE = 'klondike-v1';

const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/game.js',
  'js/storage.js',
  'js/ui.js',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        (event.request.mode === 'navigate'
          ? caches.match('index.html').then((page) => page || fetch(event.request))
          : fetch(event.request))
    )
  );
});
