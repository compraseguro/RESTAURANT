/* PWA + actualización: versión __SW_VERSION__ se reemplaza en el build (vite). */

const VERSION = '__SW_VERSION__';
const CACHE_TAG = `resto-fadey-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('resto-fadey-') && k !== CACHE_TAG)
            .map((k) => {
              console.log('[sw] limpiando cache antigua:', k);
              return caches.delete(k);
            }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
