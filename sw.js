/* Bloodline service worker — RETIRED.
   Offline support has been removed (it was serving stale cached versions).
   This is a kill-switch: any browser that still has the old worker installed
   will fetch this file on its next visit, install it, and on activate it wipes
   the old caches and unregisters itself — then reloads the page fresh from the
   network. After that, no service worker controls the site. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
