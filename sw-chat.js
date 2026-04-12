// ============================================================
// sw-chat.js  — Steak Teppei Chat Service Worker
// CACHE キーを変えるだけで全キャッシュが自動更新される
// ============================================================
const CACHE = 'st-chat-v3.1';

// キャッシュするのは静的アセットのみ（HTMLは含めない）
// HTMLは常にネットワークから取得することで古いページが残らない
const STATIC_ASSETS = [
  './logo.svg',
  './apple-touch-icon.png',
];

// ── Install ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // 即座に新しいSWを有効化
  );
});

// ── Activate ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim()) // 全タブを即座に制御下に
      .then(() => {
        // 全クライアントに更新を通知
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', cache: CACHE }));
        });
      })
  );
});

// ── Fetch ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // HTMLファイルは常にネットワーク優先（キャッシュしない）
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match('./index.html')) // オフライン時のみフォールバック
    );
    return;
  }

  // Google Fonts / Firebase / Cloudinary / Worker など外部リソースはキャッシュしない
  if (!url.origin.includes(self.location.origin)) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 静的アセット（logo.svg, icon等）: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});

// ── メッセージ受信 ──
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
