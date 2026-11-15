/* Galaxy App service worker.
   App shell: cache-first (so the app opens instantly and offline).
   Collection data: network-first with a cache fallback, so a published change
   shows up as soon as there is signal, and the last good copy is used when
   there isn't. */
const SHELL = 'galaxy-off-shell-v1';
const DATA = 'galaxy-off-data-v1';
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest',
  './vendor/zxing.min.js', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // addAll fails the whole install if one file 404s — add them tolerantly
    await Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL, DATA];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isData = () => false;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (isData(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.status === 200) { cache.put(req, fresh.clone()); return fresh; }
        throw new Error('bad status');
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response('{}', { status: 504, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // box art and other images: cache what we have seen, fall back to the network
  if (/geekdo-images\.com/.test(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh && (fresh.status === 200 || fresh.type === 'opaque')) cache.put(req, fresh.clone());
        return fresh;
      } catch (err) { return new Response('', { status: 504 }); }
    })());
    return;
  }

  if (new URL(url).origin !== self.location.origin) return;   // leave APIs alone

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200) (await caches.open(SHELL)).put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
    }
  })());
});
