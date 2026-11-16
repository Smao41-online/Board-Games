/* Galaxy App service worker.

   Everything here is **stale-while-revalidate**: whatever is in the cache is
   served immediately and a fresh copy is fetched in the background for next
   time. That is what makes the app usable on a phone in a shop — opening it
   costs no waiting and, on an unchanged collection, no bandwidth either,
   because the background check is a conditional request the server answers
   with "not modified".

   The earlier version fetched the 1.1 MB data file with `no-store` on every
   single launch and waited for it. On wi-fi that is invisible; on a weak
   cellular link it stalls the launch and starves the box art of bandwidth,
   which is exactly how it failed in the field. */
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
/* The ⟳ button appends ?fresh=1&t=… so it can get past every cache. Strip the
   query before storing, or each refresh would leave another copy behind. */
const keyOf = url => url.split('?')[0];

/* Serve the cached copy, refresh in the background. `insist` (the ⟳ button)
   waits for the network and only falls back to the cache if it fails. */
async function swr(e, cacheName, insist) {
  const cache = await caches.open(cacheName);
  const key = keyOf(e.request.url);
  const hit = await cache.match(key);
  /* `no-cache` means *revalidate*, not *re-download*: the browser sends the
     ETag it already has and the server answers "not modified" in a few hundred
     bytes. Re-fetching the request as it arrived would instead inherit the
     page's own reload state and pull the whole 1 MB down again. */
  const was = hit && hit.headers.get('ETag');
  const net = fetch(key, { cache: insist ? 'reload' : 'no-cache' }).then(async r => {
    if (r && r.status === 200) {
      await cache.put(key, r.clone());
      // Something genuinely changed behind the app's back — tell it, so the
      // collection refreshes itself instead of waiting for the next launch.
      if (was && r.headers.get('ETag') && r.headers.get('ETag') !== was && cacheName === DATA) {
        for (const c of await self.clients.matchAll()) c.postMessage({ type: 'data-updated' });
      }
    }
    return r;
  }).catch(() => null);

  if (hit && !insist) { e.waitUntil(net); return hit; }
  const fresh = await net;
  if (fresh && (fresh.status === 200 || !hit)) return fresh;
  if (hit) return hit;
  throw new Error('nothing cached and the network did not answer');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (isData(url)) {
    e.respondWith(swr(e, DATA, /[?&]fresh=1/.test(url))
      .catch(() => new Response('{}', { status: 504, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Box art: cache-first and kept for good. Failures are never cached, so a
  // picture missed on a bad connection is fetched again next time instead of
  // being remembered as broken.
  if (/geekdo-images\.com/.test(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      const hit = await cache.match(keyOf(url));
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh && (fresh.status === 200 || fresh.type === 'opaque')) cache.put(keyOf(url), fresh.clone());
        return fresh;
      } catch (err) { return new Response('', { status: 504 }); }
    })());
    return;
  }

  if (new URL(url).origin !== self.location.origin) return;   // leave APIs alone

  // The app itself. Cached copy first so it opens instantly, new version
  // fetched behind it — which is also what lets a published update reach a
  // phone without the service worker file having to change.
  e.respondWith((async () => {
    try { return await swr(e, SHELL, false); }
    catch (err) {
      return (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
    }
  })());
});
