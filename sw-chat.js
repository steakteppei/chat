const CACHE = 'st-chat-v1.6';
const ASSETS = [
  './',
  './index.html',
  './home-chat.html',
  './version-chat.html',
];

// Install: cache assets
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting(); // activate immediately
});

// Activate: delete all old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim()) // take control immediately
  );
});

// Fetch: network first, fallback to cache
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Update cache with fresh response
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Listen for skipWaiting message from client
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
