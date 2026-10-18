/* Gold Live Terminal — Service Worker
   PWA Builder / installability compatible
   Strategy: cache-first for app shell, network-first for live APIs
*/

const CACHE_VERSION = 'gold-terminal-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] partial shell cache:', err);
        // Still succeed install even if some icons fail
        return Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch(() => null)
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: drop old caches
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

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache live market / API traffic — always network
  const isLiveApi =
    url.hostname.includes('binance') ||
    url.hostname.includes('yahoo') ||
    url.hostname.includes('tradingview') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('openrouter') ||
    url.hostname.includes('duckduckgo') ||
    url.hostname.includes('wikipedia') ||
    url.pathname.includes('/api/') ||
    url.search.includes('symbol=') ||
    url.search.includes('interval=');

  if (isLiveApi) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Same-origin app shell: cache-first, then network, then offline fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // Cache successful same-origin responses
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => {
          // Offline navigation fallback
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // Cross-origin static assets: network with cache fallback
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

// Allow page to force skipWaiting via message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
