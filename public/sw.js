const CACHE_NAME = 'tyke-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/editor.html',
  '/auth.html',
  '/css/global.css',
  '/css/dashboard.css',
  '/css/editor.css',
  '/css/auth.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/editor.js',
  '/js/theme.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Catch API requests and offline fallback logic
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Çevrimdışısınız. İşlem yerel önbellekte tutuluyor.' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  } else {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) return response;
          return fetch(event.request);
        })
    );
  }
});
