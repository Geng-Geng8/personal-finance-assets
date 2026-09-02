const CACHE_NAME = "finance-shell-v2";

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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
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

  // Cache-first strategy for static image assets
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for HTML navigation and application scripts
  // Prevents stale-shell lock-in during development and ensures new code loads on F5
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === "navigate" || url.pathname.endsWith(".html")) {
            return caches.match("index.html");
          }
          return null;
        });
      })
  );
});
