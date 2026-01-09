const CACHE = "sws-deck-lab";

const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/simulator.js",
  "/validator.js",
  "/storage.js",
  "/manifest.json"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Always fetch fresh data files
  if (url.pathname.startsWith("/data/")) {
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
  );
  return;
}

  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});