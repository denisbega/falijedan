/* FaliJedan service worker — offline shell + keširanje statičnih resursa. */
const VERSION = 'fj-v2';
const SHELL = ['/', '/manifest.webmanifest', '/favicon-32.png', '/icons/icon-192.png', '/icons/icon-512.png', '/brand/logo.png', '/brand/znak.png', '/brand/wordmark.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // API i realtime nikad ne idu kroz keš service workera
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Navigacija: mreža prvo, pa keširani shell (SPA fallback).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Statični resursi (naši + fontovi + map tile-ovi): keš prvo, uz osvježavanje u pozadini.
  const cacheable = url.origin === self.location.origin || /fonts\.(googleapis|gstatic)\.com|server\.arcgisonline\.com/.test(url.host);
  if (!cacheable) return;
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
