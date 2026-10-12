/* Sonor Survey — service worker: app shell offline (network-first for pages, cache-first for assets; Supabase + CDN pass through) */
const CACHE_VERSION = 'sonor-survey-0.5.0';
const SHELL = ['./sonor-survey.html', './manifest.webmanifest', '../sonor-db.js', '../data/sonor-theme.js', '../data/brand.css', '../data/sonor-header.css', '../data/sonor-components.css', '../data/app-vars.css',
  '../data/sonor-brand.js', '../data/sonor-app.js', '../data/sonor-icons.js', '../data/sonor-header.js', '../data/sonor-project-list.js', '../data/sonor-project-bar.js',
  '../data/sonor-ink.js', '../data/survey-config.js', '../data/survey-ink.js', '../data/survey-store.js', '../data/survey-plan.js', '../data/survey-checklist.js', '../data/survey-pdf.js', '../data/survey-app.js', '../data/sonor-pdf-luxury.js', '../data/fonts/gilroy-extrabold.otf', '../data/fonts/gilroy-regular.otf', '../data/fonts/gilroy-ultralight.otf', '../data/cedia-member-stacked.png', '../data/favicon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL).catch(() => null)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /supabase\.co$/.test(u.hostname)) return;
  const sameOrigin = u.origin === self.location.origin;
  if (!sameOrigin && !/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|sonorltd\.github\.io/.test(u.hostname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    if (e.request.mode === 'navigate' || /\.html$/.test(u.pathname)) {
      try { const r = await fetch(e.request); cache.put(e.request, r.clone()); return r; } catch (err) { return (await cache.match(e.request)) || (await cache.match('./sonor-survey.html')); }
    }
    const hit = await cache.match(e.request); if (hit) { fetch(e.request).then(r => r.ok && cache.put(e.request, r)).catch(() => null); return hit; }
    try { const r = await fetch(e.request); if (r.ok) cache.put(e.request, r.clone()); return r; } catch (err) { return Response.error(); }
  })());
});
