// Stale-while-revalidate for static assets only (JS/CSS/fonts/icons). API
// responses are never touched here - IndexedDB is the offline data store,
// this SW just keeps the app shell loadable with no network.
const CACHE_NAME = "pos-static-v2";

const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp)$/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!STATIC_EXTENSIONS.test(url.pathname)) return;

  // Stale-while-revalidate: serve the cached copy immediately if present
  // (fast + offline-capable), but always refetch in the background and
  // update the cache so the *next* load gets fresh content instead of the
  // cached response sticking forever.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      const fetchAndUpdate = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });

      return cached ?? fetchAndUpdate;
    })
  );
});
