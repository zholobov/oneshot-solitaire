const PREFIX = `pocket-solitaire:${self.registration.scope}:`;
const CACHE = `${PREFIX}__BUILD_ID__`;
const ASSETS = __PRECACHE_ASSETS__;
const INDEX = new URL("./index.html", self.registration.scope).href;
const URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = request.mode === "navigate" ? INDEX : `${url.origin}${url.pathname}`;
  if (!URLS.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(key) ?? fetch(request);
  })());
});
