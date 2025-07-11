const CACHE_NAME = 'shoumikchow-v1';
const urlsToCache = [
  '/',
  '/assets/css/style.css',
  '/assets/js/scale.fix.js',
  '/assets/js/dark-mode.js',
  '/assets/js/back-to-top.js',
  '/assets/js/loading.js',
  '/assets/js/performance.js',
  '/assets/img/img.jpg',
  '/experience.html',
'/research.html',
'/projects.html',
'/about.html'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 