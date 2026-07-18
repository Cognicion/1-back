const CACHE_VERSION = "20260718-cache-v1";
const STATIC_CACHE = `cognicion-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cognicion-runtime-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  "./css/theme.css?v=20260718-cache-v1",
  "./css/apariencia.css?v=20260718-cache-v1",
  "./assets/favicon-cognicion.png",
  "./manifest.json?v=20260718-cache-v1"
];

function esRespuestaCacheable(response) {
  return response && response.ok && (response.type === "basic" || response.type === "cors");
}

function esFirebaseODatoPrivado(url) {
  const host = url.hostname;
  const path = url.pathname;
  return (
    host.includes("firebaseio.com") ||
    host.includes("firestore.googleapis.com") ||
    host.includes("identitytoolkit.googleapis.com") ||
    host.includes("securetoken.googleapis.com") ||
    host.includes("firebaseinstallations.googleapis.com") ||
    host.includes("firebase.googleapis.com") ||
    host.includes("firebasestorage.googleapis.com") ||
    host.includes("firebasestorage.app") ||
    host.includes("cloudfunctions.net") ||
    path.includes("/google.firestore.") ||
    path.includes("/v1/accounts:")
  );
}

function esVersionado(url) {
  return (
    url.searchParams.has("v") ||
    url.searchParams.has("version") ||
    /\.[a-f0-9]{8,}\./i.test(url.pathname) ||
    /\.v\d+/i.test(url.pathname)
  );
}

function esDocumento(request, url) {
  return request.mode === "navigate" || request.destination === "document" || /\.html$/i.test(url.pathname);
}

async function networkOnly(request) {
  return fetch(request);
}

async function networkFirst(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (esRespuestaCacheable(response)) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (esRespuestaCacheable(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName = STATIC_CACHE) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (esRespuestaCacheable(response)) cache.put(request, response.clone());
    return response;
  });
  return cached || fetchPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch(() => null)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("cognicion-") && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  if (type === "GET_VERSION") event.source?.postMessage?.({ type: "COGNICION_SW_VERSION", version: CACHE_VERSION });
  if (type === "CLEAR_STATIC_CACHES") {
    event.waitUntil?.(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith("cognicion-")).map((key) => caches.delete(key))))
        .then(() => event.source?.postMessage?.({ type: "COGNICION_CACHES_CLEARED" }))
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (esFirebaseODatoPrivado(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (esDocumento(request, url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  const destino = request.destination;
  const mismoOrigen = url.origin === self.location.origin;

  if (destino === "font" || destino === "image") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (destino === "style" || destino === "script" || (mismoOrigen && /\.(css|js)$/i.test(url.pathname))) {
    event.respondWith(esVersionado(url) ? staleWhileRevalidate(request) : networkFirst(request));
    return;
  }

  if (mismoOrigen && /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
