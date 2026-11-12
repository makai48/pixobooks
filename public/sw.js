/* PixoBooks PWA service worker — offline-capable app shell.
 * Scope-agnostic: works under any base path via the registration scope.
 * Same-origin GET assets are cache-first so lazy route chunks survive a
 * hard refresh while offline. API/backend calls are never cached.
 * Navigations fall back to cached index.html. */
const CACHE_NAME = "pixobooks-shell-v18";

// Never cache when served from localhost/dev — stale transformed modules
// break module identity (duplicate React). This also lets a fresh worker
// evict poisoned older caches on the next online load.
function isLocalhost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

function scopeBase() {
  try {
    const scope = new URL(self.registration.scope);
    return scope.pathname.endsWith("/") ? scope.pathname : scope.pathname + "/";
  } catch {
    return "/";
  }
}

function shellUrls() {
  const base = scopeBase();
  // Trim trailing slash for the root entry except bare "/".
  const root = base === "/" ? "/" : base.slice(0, -1);
  return [root, base + "index.html", base + "manifest.json"];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(shellUrls()))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isBackend(url) {
  return (
    url.pathname.startsWith("/rest/") ||
    url.hostname.includes("backend.onspace.ai") ||
    url.hostname.includes("supabase.co")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isLocalhost(url.hostname)) return; // dev passthrough: no caching
  if (isBackend(url)) return; // network-only: never serve stale API data

  const sameOrigin = url.origin === self.location.origin;
  const isNavigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  // Same-origin assets (JS/CSS/fonts/flags): cache-first, then network
  // with background revalidation. This is what keeps lazy route chunks
  // available after a hard refresh while offline.
  if (sameOrigin && !isNavigation) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => undefined);
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Navigations: network-first, fall back to cached shell.
  if (isNavigation) {
    const base = scopeBase();
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200 && sameOrigin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => undefined);
          }
          return response;
        })
        .catch(() =>
          caches
            .match(req)
            .then((r) => r || caches.match(base + "index.html"))
        )
    );
  }
});
