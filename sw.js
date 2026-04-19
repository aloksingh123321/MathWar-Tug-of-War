/* ================================================================
   sw.js — MathWar Service Worker (PWA — Offline Caching)
   v9: Updated cache version forces fresh cache on update
   ================================================================ */
const CACHE = 'mathwar-v9';   // B-11 FIX: bumped to force cache refresh
const FILES = [
  '/',
  'index.html',
  'style.css',
  'game.js',
  'app.js',
  'auth.js',
  'db.js',
  'ai.js',
  'sound.js',
  'config.js',    // B-11 FIX: added missing config.js
  'login.html',
  'profile.html'
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(FILES))
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  )
));

self.addEventListener('fetch', e => e.respondWith(
  caches.match(e.request).then(r => r || fetch(e.request).catch(() => {
    // Return cached index.html for navigation requests when offline
    if (e.request.mode === 'navigate') return caches.match('index.html');
  }))
));
