// PitchOps Service Worker
// Strategy:
//   - App shell (index.html, fonts, JS libs) → Cache First, fallback network
//   - Supabase API calls → Network First, fallback cache
//   - Everything else → Network First

const CACHE_VERSION = 'pitchops-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const API_CACHE    = CACHE_VERSION + '-api';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@500;700&display=swap',
];

// ── Install: pre-cache static assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Cache what we can — don't fail install if CDN assets fail
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('pitchops-') && !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (Supabase writes, etc.)
  if (event.request.method !== 'GET') return;

  // Supabase API → Network First (fresh data when online, cache fallback offline)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirstWithCache(event.request, API_CACHE));
    return;
  }

  // Google Fonts CSS → Cache First (changes rarely)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirstWithNetwork(event.request, STATIC_CACHE));
    return;
  }

  // CDN JS libs → Cache First (versioned URLs, never change)
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirstWithNetwork(event.request, STATIC_CACHE));
    return;
  }

  // App shell (index.html and same-origin assets) → Network First
  // so deploys update immediately, but works offline with cached version
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstWithCache(event.request, STATIC_CACHE));
    return;
  }
});

// Network first, fall back to cache
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // For navigation requests, return cached index.html as fallback
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html') || await caches.match('/');
      if (fallback) return fallback;
    }
    return new Response('Offline — no cached version available', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Cache first, fall back to network
async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Asset unavailable offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
