const CACHE_VERSION = "20260911-modafinil-substances-lab-v1";
const STATIC_CACHE = `cognicion-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cognicion-runtime-${CACHE_VERSION}`;
const NAVIGATION_TIMEOUT_MS = 8000;
const ASSET_TIMEOUT_MS = 8000;

const SCOPE_URL = new URL(self.registration.scope);
const OFFLINE_URL = new URL("./offline.html", SCOPE_URL).href;
const DIAGNOSTIC_URL = new URL("./diagnostico-red.html", SCOPE_URL).href;
const INDEX_URL = new URL("./index.html", SCOPE_URL).href;

const REQUIRED_PRECACHE_ASSETS = [
  OFFLINE_URL,
  DIAGNOSTIC_URL
];

const OPTIONAL_PRECACHE_ASSETS = [
  INDEX_URL,
  new URL("./js/availability-bootstrap.js?v=2.210", SCOPE_URL).href,
  new URL("./css/theme.css?v=20260811-pharmacology-files-consolidated-v1", SCOPE_URL).href,
  new URL("./css/apariencia.css?v=20260811-pharmacology-files-consolidated-v1", SCOPE_URL).href,
  new URL("./assets/favicon-cognicion.png", SCOPE_URL).href,
  new URL("./manifest.json?v=20260811-pharmacology-files-consolidated-v1", SCOPE_URL).href
];

const PUBLIC_DOCUMENT_PATHS = new Set([
  SCOPE_URL.pathname,
  new URL("./index.html", SCOPE_URL).pathname,
  new URL("./offline.html", SCOPE_URL).pathname,
  new URL("./diagnostico-red.html", SCOPE_URL).pathname
]);

const PRIVATE_HOST_SUFFIXES = [
  "firebaseio.com",
  "firebaseapp.com",
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "firebase.googleapis.com",
  "googleapis.com",
  "firebasestorage.googleapis.com",
  "firebasestorage.app",
  "appspot.com",
  "cloudfunctions.net"
];

const SENSITIVE_SAME_ORIGIN_PATHS = [
  /\/api(?:\/|$)/i,
  /\/__\/auth(?:\/|$)/i,
  /\/google\.firestore\./i,
  /\/v\d+\/accounts:/i,
  /\/(?:firestore|storage|functions)(?:\/|$)/i
];

function hostCoincide(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function esFirebaseODatoPrivado(url, request) {
  return (
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostCoincide(url.hostname, suffix)) ||
    SENSITIVE_SAME_ORIGIN_PATHS.some((pattern) => pattern.test(url.pathname)) ||
    request.headers.has("authorization")
  );
}

function esProbeDeRed(url) {
  return (
    url.searchParams.get("__cognicion_network_probe") === "1" ||
    url.pathname === new URL("./health.json", SCOPE_URL).pathname
  );
}

function esRespuestaCacheablePublica(response) {
  if (!response || !response.ok || !["basic", "cors"].includes(response.type)) return false;
  const cacheControl = String(response.headers.get("cache-control") || "").toLowerCase();
  const vary = String(response.headers.get("vary") || "").toLowerCase();
  return !/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/.test(cacheControl) && vary !== "*";
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

function claveDocumentoPublico(url) {
  const path = url.pathname === SCOPE_URL.pathname
    ? new URL("./index.html", SCOPE_URL).pathname
    : url.pathname;
  if (!PUBLIC_DOCUMENT_PATHS.has(path)) return null;
  const cacheUrl = new URL(path, SCOPE_URL.origin);
  return new Request(cacheUrl.href, { method: "GET" });
}

async function fetchConTimeout(request, timeoutMs) {
  if (typeof AbortController === "undefined") return fetch(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function esTimeout(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError";
}

function respuestaRecoveryInline() {
  const body = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>COGNICIÓN no disponible</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#081018;color:#f8fafc;font:16px/1.5 system-ui,sans-serif"><main style="max-width:36rem;padding:2rem"><h1>COGNICIÓN no puede conectarse en este momento.</h1><p>No fue posible recuperar la aplicación ni la pantalla de recuperación guardada.</p><button type="button" onclick="location.reload()" style="padding:.75rem 1rem">Reintentar</button></main></body></html>`;
  return new Response(body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Cognicion-Recovery": "inline"
    }
  });
}

async function notificarEventoTecnico(eventName, { durationMs = null, resourceType = "unknown" } = {}) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const payload = {
      type: "COGNICION_AVAILABILITY_EVENT",
      event: eventName,
      durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
      resourceType
    };
    clients.forEach((client) => client.postMessage(payload));
  } catch (_) {
    // La telemetría nunca participa en la respuesta funcional.
  }
}

async function nombresCacheParaFallback(preferredCache) {
  const keys = await caches.keys();
  return [
    preferredCache,
    ...keys
      .filter((key) => key.startsWith("cognicion-") && key !== preferredCache)
      .sort()
      .reverse()
  ];
}

async function buscarEnCachesCognicion(request, preferredCache) {
  try {
    const names = await nombresCacheParaFallback(preferredCache);
    for (const name of names) {
      const cached = await (await caches.open(name)).match(request);
      if (cached) return cached;
    }
  } catch (_) {
    // Cache Storage puede estar bloqueado o sin cuota; se degrada a red/recovery.
  }
  return null;
}

async function networkFirstDocument(request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const publicCacheKey = claveDocumentoPublico(url);
  try {
    const response = await fetchConTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (response.status >= 500) throw new Error(`origin-http-${response.status}`);
    if (publicCacheKey && esRespuestaCacheablePublica(response)) {
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("text/html")) {
        await (await caches.open(RUNTIME_CACHE)).put(publicCacheKey, response.clone()).catch(() => null);
      }
    }
    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (esTimeout(error)) {
      await notificarEventoTecnico("SW_NETWORK_TIMEOUT", { durationMs, resourceType: "document" });
    }
    if (publicCacheKey) {
      const cached = await buscarEnCachesCognicion(publicCacheKey, RUNTIME_CACHE);
      if (cached) {
        await notificarEventoTecnico("SW_CACHE_FALLBACK", { durationMs, resourceType: "public-document" });
        return cached;
      }
    }
    const offline = await buscarEnCachesCognicion(OFFLINE_URL, STATIC_CACHE);
    if (offline) {
      await notificarEventoTecnico("SW_CACHE_FALLBACK", { durationMs, resourceType: "recovery" });
      return offline;
    }
    await notificarEventoTecnico("SW_CACHE_MISS", { durationMs, resourceType: "document" });
    return respuestaRecoveryInline();
  }
}

async function networkFirstAsset(request) {
  const startedAt = Date.now();
  try {
    const response = await fetchConTimeout(request, ASSET_TIMEOUT_MS);
    if (esRespuestaCacheablePublica(response)) {
      await (await caches.open(RUNTIME_CACHE)).put(request, response.clone()).catch(() => null);
    }
    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (esTimeout(error)) {
      await notificarEventoTecnico("SW_NETWORK_TIMEOUT", { durationMs, resourceType: "asset" });
    }
    const cached = await buscarEnCachesCognicion(request, RUNTIME_CACHE);
    if (cached) {
      await notificarEventoTecnico("SW_CACHE_FALLBACK", { durationMs, resourceType: "asset" });
      return cached;
    }
    await notificarEventoTecnico("SW_CACHE_MISS", { durationMs, resourceType: "asset" });
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await buscarEnCachesCognicion(request, STATIC_CACHE);
  if (cached) return cached;
  try {
    const response = await fetchConTimeout(request, ASSET_TIMEOUT_MS);
    if (esRespuestaCacheablePublica(response)) {
      await (await caches.open(STATIC_CACHE)).put(request, response.clone()).catch(() => null);
    }
    return response;
  } catch (error) {
    const durationMs = ASSET_TIMEOUT_MS;
    if (esTimeout(error)) {
      await notificarEventoTecnico("SW_NETWORK_TIMEOUT", { durationMs, resourceType: "static-asset" });
    }
    await notificarEventoTecnico("SW_CACHE_MISS", { durationMs, resourceType: "static-asset" });
    return Response.error();
  }
}

async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll(REQUIRED_PRECACHE_ASSETS.map((url) => new Request(url, { cache: "reload" })));
  await Promise.allSettled(
    OPTIONAL_PRECACHE_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" })))
  );
}

async function limpiarCachesAntiguos() {
  const keys = await caches.keys();
  const previousVersions = [...new Set(
    keys
      .filter((key) => key.startsWith("cognicion-"))
      .map((key) => key.replace(/^cognicion-(?:static|runtime)-/, ""))
      .filter((version) => version && version !== CACHE_VERSION)
  )].sort().reverse();
  const keepVersions = new Set([CACHE_VERSION, previousVersions[0]].filter(Boolean));
  await Promise.all(
    keys
      .filter((key) => key.startsWith("cognicion-"))
      .filter((key) => ![...keepVersions].some((version) => key.endsWith(version)))
      .map((key) => caches.delete(key))
  );
}

self.addEventListener("install", (event) => {
  // No se usa skipWaiting: la versión funcional actual sigue activa hasta que
  // el usuario acepta explícitamente la actualización.
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    limpiarCachesAntiguos().then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  if (type === "GET_VERSION") {
    event.source?.postMessage?.({ type: "COGNICION_SW_VERSION", version: CACHE_VERSION });
  }
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
  const sameOrigin = url.origin === self.location.origin;

  // Los datos, APIs y orígenes externos permanecen completamente fuera del SW.
  if (!sameOrigin || esFirebaseODatoPrivado(url, request) || esProbeDeRed(url)) return;

  if (esDocumento(request, url)) {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  const destination = request.destination;

  if (destination === "font" || destination === "image") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (destination === "style" || destination === "script" || /\.(?:css|js)$/i.test(url.pathname)) {
    event.respondWith(esVersionado(url) ? cacheFirst(request) : networkFirstAsset(request));
    return;
  }

  if (/\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
