const DB_NAME = "cognicionClinicalLocalStore";
const LEGACY_DB_NAMES = ["cognicionVoiceNoteDrafts"];
const DB_VERSION = 1;
const STORE_HANDOFFS = "handoffs";
const STORE_DRAFTS = "drafts";

const stores = [STORE_HANDOFFS, STORE_DRAFTS];

function puedeUsarIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function abrirDb() {
  if (!puedeUsarIndexedDB()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of stores) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function conStore(storeName, mode, callback) {
  const db = await abrirDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let resultado = null;
    try {
      resultado = callback(store);
    } catch (_) {
      resolve(null);
    }
    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      db.close();
      resolve(null);
    };
    tx.onabort = () => {
      db.close();
      resolve(null);
    };
  });
}

async function obtener(storeName, key) {
  const db = await abrirDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
}

export async function guardarBorradorClinicoLocal(key, payload) {
  if (!key) return null;
  const registro = {
    key,
    payload,
    updatedAt: Date.now()
  };
  await conStore(STORE_DRAFTS, "readwrite", (store) => store.put(registro));
  return registro;
}

export async function obtenerBorradorClinicoLocal(key) {
  if (!key) return null;
  const registro = await obtener(STORE_DRAFTS, key);
  return registro?.payload || null;
}

export async function eliminarBorradorClinicoLocal(key) {
  if (!key) return;
  await conStore(STORE_DRAFTS, "readwrite", (store) => store.delete(key));
}

export async function guardarTransferenciaClinicaLocal(key, payload, { ttlMs = 12 * 60 * 60 * 1000 } = {}) {
  if (!key) return null;
  const registro = {
    key,
    payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  };
  await conStore(STORE_HANDOFFS, "readwrite", (store) => store.put(registro));
  return registro;
}

export async function obtenerTransferenciaClinicaLocal(key, { consumir = true } = {}) {
  if (!key) return null;
  const registro = await obtener(STORE_HANDOFFS, key);
  if (!registro) return null;
  if (registro.expiresAt && registro.expiresAt < Date.now()) {
    await eliminarTransferenciaClinicaLocal(key);
    return null;
  }
  if (consumir) await eliminarTransferenciaClinicaLocal(key);
  return registro.payload || null;
}

export async function eliminarTransferenciaClinicaLocal(key) {
  if (!key) return;
  await conStore(STORE_HANDOFFS, "readwrite", (store) => store.delete(key));
}

export async function limpiarAlmacenClinicoLocalCognicion() {
  if (!puedeUsarIndexedDB()) return false;
  const objetivos = [DB_NAME, ...LEGACY_DB_NAMES];
  const resultados = await Promise.all(objetivos.map((dbName) => new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve({ dbName, deleted: true });
    request.onerror = () => resolve({ dbName, deleted: false });
    request.onblocked = () => resolve({ dbName, deleted: false, blocked: true });
  })));
  return resultados;
}
