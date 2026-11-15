/* The build prepends CACHE and ASSETS for this version. */
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const prior = (await caches.keys()).filter((key) => key.startsWith("acorn-offline-") && key !== CACHE);
    await Promise.all(prior.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match("/")));
  } else {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(request)) ?? fetch(request)));
  }
});
