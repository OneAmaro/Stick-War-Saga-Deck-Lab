const CACHE = "sws-deck-lab";

const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/simulator.js",
  "/validator.js",
  "/storage.js",
  "/manifest.json",
  "/data/units.json",
  "/data/modes.json",
  "/data/rules.json",
  "/data/presets.json"
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
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});