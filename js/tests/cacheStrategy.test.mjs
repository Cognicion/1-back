import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const serviceWorker = read("service-worker.js");
assert.match(serviceWorker, /const CACHE_VERSION = "20260718-cache-v1"/);
assert.match(serviceWorker, /cognicion-static-\$\{CACHE_VERSION\}/);
assert.match(serviceWorker, /cognicion-runtime-\$\{CACHE_VERSION\}/);
assert.match(serviceWorker, /esFirebaseODatoPrivado/);
assert.match(serviceWorker, /firestore\.googleapis\.com/);
assert.match(serviceWorker, /identitytoolkit\.googleapis\.com/);
assert.match(serviceWorker, /cloudfunctions\.net/);
assert.match(serviceWorker, /esDocumento\(request, url\)[\s\S]*networkOnly\(request\)/);
assert.match(serviceWorker, /request\.method !== "GET"/);
assert.match(serviceWorker, /response\.ok/);
assert.equal(/\.html["']/.test(serviceWorker.match(/const PRECACHE_ASSETS = \[[\s\S]*?\];/)?.[0] || ""), false);

const firebaseAppService = read("js/services/firebaseAppService.js");
assert.match(firebaseAppService, /setPersistence\(auth, browserLocalPersistence\)/);
assert.match(firebaseAppService, /initializeFirestore/);
assert.match(firebaseAppService, /memoryLocalCache/);
assert.match(firebaseAppService, /persistentLocalCache/);
assert.match(firebaseAppService, /persistentMultipleTabManager/);
assert.match(firebaseAppService, /FIRESTORE_DEVICE_PREF_KEY/);

const firebaseBridge = read("js/firebase.js");
assert.match(firebaseBridge, /authPersistenceReady/);
assert.match(firebaseBridge, /firestoreCacheMode/);

const cacheService = read("js/services/cacheControlService.js");
assert.match(cacheService, /navigator\.serviceWorker\.register\("\.\/service-worker\.js"/);
assert.match(cacheService, /limpiarCachesEstaticosCognicion/);
assert.match(cacheService, /limpiarDatosClinicosLocalesCognicion/);
assert.match(cacheService, /cognicionCache/);

const dictadoPersistence = read("js/services/dictadoPersistence.js");
assert.equal(/localStorage\.setItem/.test(dictadoPersistence), false);
assert.equal(/localStorage\.getItem\(this\.key/.test(dictadoPersistence), false);
assert.equal(/localStorage\.removeItem\(this\.key/.test(dictadoPersistence), false);
assert.match(dictadoPersistence, /clinicalLocalStore\.js/);
assert.match(dictadoPersistence, /memoriaSesion/);

const notaSource = read("js/nota.js");
const pacienteSource = read("js/paciente.js");
assert.match(notaSource, /obtenerTransferenciaClinicaLocal/);
assert.match(notaSource, /guardarBorradorClinicoLocal/);
assert.equal(/sessionStorage\.(setItem|getItem|removeItem)\(claveRespaldoNota/.test(notaSource), false);
assert.match(pacienteSource, /guardarTransferenciaClinicaLocal/);
assert.equal(/localStorage\.setItem\("cognicion_indicaciones_generadas_ultimo"/.test(pacienteSource), false);

console.log("OK: estrategia segura de cache y persistencia verificada.");
