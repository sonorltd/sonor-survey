/* Sonor Survey — service worker: app shell offline (network-first for pages, cache-first for assets; Supabase passes through).
 * v0.10.3 OFFLINE (Bryn: "will all this work offline on the ipad, what happens if i have no signal and pages accidently refreshes")
 *   · the CDN libraries (supabase-js, pdf.js, pdf-lib, fontkit) + the kit are PRE-CACHED at install as no-cors requests and
 *     opaque responses are kept — before, `r.ok` is false for an opaque response so they were never cached and an offline
 *     refresh lost supabase-js → blank app. Now a refresh with no signal boots from the cache and the IndexedDB store.
 *   · a navigate with any ?pid=&session= query serves the cached shell when the network is away. */
const CACHE_VERSION = 'sonor-survey-0.11.3';
const SHELL = ['./sonor-survey.html', './manifest.webmanifest', '../sonor-db.js', '../data/sonor-theme.js', '../data/brand.css', '../data/sonor-header.css', '../data/sonor-components.css', '../data/app-vars.css',
  '../data/sonor-brand.js', '../data/sonor-app.js', '../data/sonor-icons.js', '../data/sonor-header.js', '../data/sonor-project-list.js', '../data/sonor-project-bar.js',
  '../data/sonor-ink.js', '../data/sonor-survey-link.js', '../data/survey-config.js', '../data/survey-ink.js', '../data/survey-store.js', '../data/survey-plan.js', '../data/survey-checklist.js', '../data/survey-pdf.js', '../data/survey-app.js', '../data/survey-field.js', '../data/sonor-pdf-luxury.js', '../data/fonts/gilroy-extrabold.otf', '../data/fonts/gilroy-regular.otf', '../data/fonts/gilroy-ultralight.otf', '../data/cedia-member-stacked.png', '../data/survey-cover.jpg', '../data/favicon.svg',
  '../data/kit/kit.js', '../data/kit/manifest.json', '../data/kit/kit.css', '../data/kit/vocab.css'];   // the kit's local mirror (html onerror fallback) — its modules cache at runtime
const KIT = ['https://sonorltd.github.io/sonor-kit/v1/kit.js', 'https://sonorltd.github.io/sonor-kit/v1/manifest.json'];   // module + fetch → CORS mode (an opaque copy can't feed a module script)
const VENDOR = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js'];
const CDN = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|sonorltd\.github\.io/;
const keep = r => r && (r.ok || r.type === 'opaque');
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_VERSION);
    // per-file, never addAll: addAll is atomic, so one missing asset used to leave the WHOLE shell uncached
    await Promise.all(SHELL.map(async u => { try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(u, r); } catch (err) { } }));
    await Promise.all(KIT.map(async u => { try { const r = await fetch(new Request(u, { mode: 'cors' })); if (r.ok) await c.put(u, r); } catch (err) { } }));
    await Promise.all(VENDOR.map(async u => { try { const r = await fetch(new Request(u, { mode: 'no-cors' })); if (keep(r)) await c.put(u, r); } catch (err) { } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /supabase\.co$/.test(u.hostname)) return;
  const sameOrigin = u.origin === self.location.origin;
  if (!sameOrigin && !CDN.test(u.hostname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    if (e.request.mode === 'navigate' || /\.html$/.test(u.pathname)) {
      try { const r = await fetch(e.request); if (r.ok) cache.put('./sonor-survey.html', r.clone()); return r; } catch (err) { return (await cache.match(e.request)) || (await cache.match('./sonor-survey.html')); }
    }
    const hit = await cache.match(e.request, { ignoreVary: true }) || (!sameOrigin && await cache.match(u.href));
    if (hit) { fetch(e.request).then(r => { if (keep(r)) cache.put(e.request, r); }).catch(() => null); return hit; }
    try { const r = await fetch(e.request); if (keep(r)) cache.put(e.request, r.clone()); return r; } catch (err) { return Response.error(); }
  })());
});
