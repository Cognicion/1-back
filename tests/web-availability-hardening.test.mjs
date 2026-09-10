import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

function basicResponse(body, init = {}) {
  const response = new Response(body, init);
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

async function loadWorker({ fetchImpl, initialCaches = {}, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const source = await read("service-worker.js");
  const listeners = new Map();
  const cacheStores = new Map(
    Object.entries(initialCaches).map(([name, entries]) => [
      name,
      new Map(Object.entries(entries).map(([url, response]) => [url, response.clone()]))
    ])
  );

  const requestKey = (request) => typeof request === "string" ? request : request.url;
  const caches = {
    async keys() {
      return [...cacheStores.keys()];
    },
    async delete(name) {
      return cacheStores.delete(name);
    },
    async open(name) {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const store = cacheStores.get(name);
      return {
        async match(request) {
          return store.get(requestKey(request))?.clone();
        },
        async put(request, response) {
          store.set(requestKey(request), response.clone());
        },
        async add() {},
        async addAll() {}
      };
    }
  };

  const self = {
    registration: { scope: "https://cognicion.test/" },
    location: { origin: "https://cognicion.test" },
    clients: {
      async matchAll() { return []; },
      async claim() {}
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    skipWaiting() {}
  };

  const context = vm.createContext({
    self,
    caches,
    fetch: fetchImpl || (async () => { throw new TypeError("network unavailable"); }),
    URL,
    Request,
    Response,
    Headers,
    AbortController,
    Promise,
    Date,
    Set,
    Error,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl
  });
  vm.runInContext(source, context, { filename: "service-worker.js" });
  return { listeners, cacheStores };
}

async function dispatchFetch(listeners, request) {
  let responsePromise = null;
  listeners.get("fetch")({
    request,
    respondWith(value) { responsePromise = Promise.resolve(value); }
  });
  return responsePromise ? responsePromise : null;
}

test("el SW conserva network-first con timeout y una Response terminal", async () => {
  const source = await read("service-worker.js");
  assert.match(source, /NAVIGATION_TIMEOUT_MS = 8000/u);
  assert.match(source, /AbortController/u);
  assert.match(source, /event\.respondWith\(networkFirstDocument\(request\)\)/u);
  assert.match(source, /return respuestaRecoveryInline\(\)/u);
  assert.doesNotMatch(source, /event\.respondWith\(networkOnly\(request\)\)/u);
});

test("una navegación clínica sin red recibe recovery y nunca una promesa rechazada", async () => {
  const cacheName = "cognicion-static-20260909-availability-hardening-v2";
  const offlineUrl = "https://cognicion.test/offline.html";
  const { listeners } = await loadWorker({
    initialCaches: {
      [cacheName]: {
        [offlineUrl]: basicResponse("RECOVERY SIN PHI", { headers: { "Content-Type": "text/html" } })
      }
    }
  });
  const response = await dispatchFetch(listeners, new Request("https://cognicion.test/paciente.html?id=patient-secret"));
  assert.ok(response instanceof Response);
  assert.equal(await response.text(), "RECOVERY SIN PHI");
});

test("un timeout de transporte simulado termina en recovery", async () => {
  const cacheName = "cognicion-static-20260909-availability-hardening-v2";
  const offlineUrl = "https://cognicion.test/offline.html";
  const fetchImpl = (_request, options = {}) => new Promise((resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      const error = new Error("simulated TCP timeout");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const { listeners } = await loadWorker({
    fetchImpl,
    setTimeoutImpl: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeoutImpl: () => {},
    initialCaches: {
      [cacheName]: {
        [offlineUrl]: basicResponse("TIMEOUT RECOVERY", { headers: { "Content-Type": "text/html" } })
      }
    }
  });
  const response = await dispatchFetch(listeners, new Request("https://cognicion.test/dashboard.html"));
  assert.equal(await response.text(), "TIMEOUT RECOVERY");
});

test("con red y caché vacías el SW genera recovery inline 503", async () => {
  const { listeners } = await loadWorker();
  const response = await dispatchFetch(listeners, new Request("https://cognicion.test/dashboard.html"));
  assert.ok(response instanceof Response);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("X-Cognicion-Recovery"), "inline");
  assert.match(await response.text(), /COGNICIÓN no puede conectarse/u);
});

test("el documento público anterior puede recuperarse sin reintroducir su query", async () => {
  const previousCache = "cognicion-runtime-20260909-navigation-networkfirst-v1";
  const { listeners } = await loadWorker({
    initialCaches: {
      [previousCache]: {
        "https://cognicion.test/index.html": basicResponse("PREVIOUS PUBLIC HOME", { headers: { "Content-Type": "text/html" } })
      }
    }
  });
  const response = await dispatchFetch(listeners, new Request("https://cognicion.test/index.html?patient=not-a-cache-key"));
  assert.equal(await response.text(), "PREVIOUS PUBLIC HOME");
});

test("un documento público se cachea con clave canónica sin query string", async () => {
  const fetchImpl = async () => basicResponse("PUBLIC HOME", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" }
  });
  const { listeners, cacheStores } = await loadWorker({ fetchImpl });
  const response = await dispatchFetch(
    listeners,
    new Request("https://cognicion.test/index.html?campaign=mobile&patient=must-not-be-cached")
  );
  assert.equal(await response.text(), "PUBLIC HOME");
  const runtime = cacheStores.get("cognicion-runtime-20260909-availability-hardening-v2");
  assert.ok(runtime.has("https://cognicion.test/index.html"));
  assert.ok([...runtime.keys()].every((key) => !key.includes("patient=") && !key.includes("campaign=")));
});

test("documentos clínicos exitosos no se guardan en Cache Storage", async () => {
  const fetchImpl = async () => basicResponse("STATIC CLINICAL SHELL", {
    status: 200,
    headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=60" }
  });
  const { listeners, cacheStores } = await loadWorker({ fetchImpl });
  const response = await dispatchFetch(listeners, new Request("https://cognicion.test/nota.html?paciente=abc"));
  assert.equal(await response.text(), "STATIC CLINICAL SHELL");
  const entries = [...cacheStores.values()].flatMap((store) => [...store.keys()]);
  assert.ok(entries.every((key) => !key.includes("nota.html") && !key.includes("paciente=")));
});

test("Firebase, APIs externas y requests autorizados no son interceptados", async () => {
  const { listeners } = await loadWorker();
  const firestore = await dispatchFetch(listeners, new Request("https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel"));
  const external = await dispatchFetch(listeners, new Request("https://example.net/api"));
  const authorized = await dispatchFetch(listeners, new Request("https://cognicion.test/api/private", {
    headers: { Authorization: "Bearer redacted" }
  }));
  assert.equal(firestore, null);
  assert.equal(external, null);
  assert.equal(authorized, null);
});

test("recovery, health y diagnóstico son mínimos y no contienen credenciales ni PHI", async () => {
  const [offline, diagnostic, healthText, healthStat] = await Promise.all([
    read("offline.html"),
    read("diagnostico-red.html"),
    read("health.json"),
    stat(resolve(root, "health.json"))
  ]);
  const health = JSON.parse(healthText);
  assert.ok(healthStat.size < 1024, "health.json debe medir menos de 1 KB");
  assert.equal(health.appVersion, "2.209");
  assert.match(offline, /no consulta, almacena ni muestra información clínica/u);
  assert.doesNotMatch(offline, /<link[^>]+stylesheet|<script[^>]+src=/u);
  assert.match(diagnostic, /sin API key/u);
  assert.doesNotMatch(diagnostic, /AIza|Bearer\s|accessToken|refreshToken|pacientes\//u);
});

test("watchdog cubre las tres entradas críticas y no recarga automáticamente", async () => {
  const [bootstrap, index, login, dashboard] = await Promise.all([
    read("js/availability-bootstrap.js"),
    read("index.html"),
    read("login.html"),
    read("dashboard.html")
  ]);
  for (const html of [index, login, dashboard]) {
    assert.match(html, /availability-bootstrap\.js\?v=2\.209/u);
    assert.match(html, /data-cognicion-critical=/u);
  }
  assert.match(dashboard, /data-cognicion-ready="event"/u);
  const dashboardModule = await read("js/dashboard.js");
  assert.match(dashboardModule, /cognicionAvailability\?\.ready\?\.\(\)/u);
  assert.match(dashboardModule, /cognicionAvailability\?\.showRecovery\?\.\(\)/u);
  assert.match(bootstrap, /WATCHDOG_MS = 12000/u);
  assert.match(bootstrap, /FIRST_RENDER/u);
  assert.match(bootstrap, /APP_READY/u);
  assert.doesNotMatch(bootstrap, /setInterval\([^)]*reload|setTimeout\([^)]*reload/u);
});

test("APP_VERSION, health y bootstrap permanecen separados de CACHE_VERSION", async () => {
  const [appVersion, healthText, bootstrap, worker, cacheControl] = await Promise.all([
    read("js/config/appVersion.js"),
    read("health.json"),
    read("js/availability-bootstrap.js"),
    read("service-worker.js"),
    read("js/services/cacheControlService.js")
  ]);
  assert.match(appVersion, /APP_VERSION = "2\.209"/u);
  assert.equal(JSON.parse(healthText).appVersion, "2.209");
  assert.match(bootstrap, /APP_VERSION = "2\.209"/u);
  assert.match(worker, /CACHE_VERSION = "20260909-availability-hardening-v2"/u);
  assert.match(cacheControl, /import \{ APP_VERSION \} from "\.\.\/config\/appVersion\.js"/u);
  assert.doesNotMatch(cacheControl, /cognicion\.swReloaded/u);
  assert.match(cacheControl, /controllerchange", reloadOnce, \{ once: true \}/u);
  assert.match(cacheControl, /updateViaCache: "none"/u);
});
