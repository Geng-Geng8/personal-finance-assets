const CACHE_NAME = "finance-shell-v1";

const SHELL_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "api.js",
  "config.js",
  "manifest.webmanifest",
  "assets/finance-icon.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // STRICT SAFETY: Do NOT intercept or cache any cross-origin requests
  // (e.g. Google APIs, Google Identity Services, Apps Script execution API)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Do NOT intercept non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Do NOT cache API endpoints or financial data
  if (url.pathname.includes(":run") || url.search.includes("action=")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in the background for shell updates
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});
