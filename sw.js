/* Gold Terminal PWA — network-first for HTML so new deploys show immediately.
   Bump CACHE_VERSION on every release. */
const CACHE_VERSION = 'gold-terminal-v20261019g';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch(() => null) // ignore missing optional assets
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isNavigateOrHtml(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  const path = url.pathname;
  return path === '/' || path.endsWith('/') || path.endsWith('.html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never cache API / live market feeds
  try {
    const u = new URL(req.url);
    if (
      u.origin !== self.location.origin ||
      u.pathname.includes('/api/') ||
      u.hostname.includes('biquote') ||
      u.hostname.includes('binance') ||
      u.hostname.includes('groq') ||
      u.hostname.includes('duckduckgo') ||
      u.hostname.includes('wikipedia')
    ) {
      return; // network only, no SW intercept
    }
  } catch (e) {}

  // HTML / navigation: network-first, then cache fallback
  if (isNavigateOrHtml(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) =>
              cached ||
              caches.match('./index.html') ||
              caches.match('./')
          )
        )
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
