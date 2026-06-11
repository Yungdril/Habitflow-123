// HabitFlow Service Worker v2 — faster caching + better PWA install trigger

const CACHE = 'habitflow-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/dashboard.html',
  '/pricing.html',
  '/offline.html',
  '/style.css',
  '/app.js',
  '/firebase.js',
  '/payment.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: cache everything immediately
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {})
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - HTML pages     → Network first (always fresh), fall back to cache
// - CSS/JS/images  → Cache first (instant load), update in background
// - Firebase/API   → Network only (never cache)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and external origins (Firebase, Paystack, Google APIs)
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML pages — network first for freshness
  if (e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request)
          .then(cached => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // CSS, JS, images — cache first for speed
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        // Serve from cache instantly, update in background
        fetch(e.request).then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res));
        }).catch(() => {});
        return cached;
      }
      // Not in cache — fetch and store
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'HabitFlow', {
      body:    data.body || "Don't forget your habits today!",
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      data:    { url: data.url || '/dashboard.html' },
      actions: [{ action: 'open', title: 'Open App' }]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/dashboard.html'));
});