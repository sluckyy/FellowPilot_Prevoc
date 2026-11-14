/* MCQ Coach service worker: keeps the app shell available offline.
   Static build files: cache first (their names change with every release).
   Pages: network first, falling back to the last copy seen.
   API calls: always network (answers are queued on the device by the app itself). */
const VERSION = 'prevoc-v1'; // bump when icons or the manifest change so installed apps refresh
const PAGES = ['/', '/practice', '/insights'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/manifest.webmanifest', '/icons/icon-192.png']).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected && PAGES.includes(url.pathname)) c.put(url.pathname, res.clone());
        return res;
      } catch {
        return (await c.match(url.pathname)) || (await c.match('/')) || new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
    })());
  }
});
