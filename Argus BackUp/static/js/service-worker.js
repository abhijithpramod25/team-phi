const CACHE_NAME = 'faceauth-cache-v1';
const urlsToCache = [
  '/',
  '/static/css/home.css',
  '/static/js/home.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

// Install service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch from cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
