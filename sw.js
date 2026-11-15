const CACHE = "ornament-atelier-v1";
const PRECACHE = [
  "./",
  "index.html",
  "app.js",
  "style.css",
  "manifest.webmanifest",
  "images/icon-192.png",
  "images/icon-512.png",
  "images/icon-maskable-512.png",
  "images/banner.png",
  "images/divider.png",
  "images/divider-export.png",
  "images/divider-mode.png",
  "images/divider-layers.png",
  "fonts/Caudex-Regular.ttf",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Network first, so a new version shows as soon as it is online; the cache is the
  // offline fallback. One cache entry per file, whatever its ?v= query.
  const key = url.origin + url.pathname;
  const network = req.mode === "navigate" ? fetch(req) : fetch(req, { cache: "no-cache" });
  event.respondWith(
    network
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || caches.match(req, { ignoreSearch: true })).then((hit) => hit || caches.match("index.html")))
  );
});
