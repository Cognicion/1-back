export const VOICE_NOTE_SESSION_SCHEMA_VERSION = "voice_note_session_v1";
export const VOICE_NOTE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const VOICE_NOTE_SESSION_DB_NAME = "cognicionVoiceNoteSessionStore";
const DB_VERSION = 1;
const STORE_SESSIONS = "sessions";
const STORE_SEGMENTATION_RESULTS = "segmentationResults";
const PREFIX_SESSION = "cognicion.voiceNote.session";
const PREFIX_SEGMENTATION = "cognicion.voiceNote.segmentation";

function puedeUsarIndexedDB() {
  return typeof indexedDB !== "undefined";
}

export function claveSeguraVoz(valor = "sin-id") {
  return String(valor || "sin-id").replace(/[^\w.-]+/g, "_");
}

export function crearContextKeyVoz({ userId = "", patientId = "", encounterId = "" } = {}) {
  return [
    claveSeguraVoz(userId || "sin-usuario"),
    claveSeguraVoz(patientId || "sin-paciente"),
    claveSeguraVoz(encounterId || "sin-encuentro")
  ].join(".");
}

export function crearSessionKeyVoz({ userId = "", patientId = "", encounterId = "", sessionId = "" } = {}) {
  return `${PREFIX_SESSION}.${crearContextKeyVoz({ userId, patientId, encounterId })}.${claveSeguraVoz(sessionId || "sin-sesion")}`;
}

export function crearSegmentationKeyVoz({ userId = "", patientId = "", encounterId = "", transcriptHash = "", promptVersion = "", model = "", segmenterVersion = "" } = {}) {
  return [
    PREFIX_SEGMENTATION,
    crearContextKeyVoz({ userId, patientId, encounterId }),
    claveSeguraVoz(transcriptHash || "sin-hash"),
    claveSeguraVoz(promptVersion || "sin-prompt"),
    claveSeguraVoz(model || "sin-modelo"),
    claveSeguraVoz(segmenterVersion || "sin-version")
  ].join(".");
}

export function hashTextoVoz(valor = "") {
  const normalized = String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sesionVozTieneContenido(payload = {}) {
  const transcript = payload.transcript || {};
  const segmentation = payload.segmentation || {};
  const generatedNote = payload.generatedNote || {};
  return Boolean(
    String(transcript.original || transcript.corrected || "").trim()
    || Array.isArray(segmentation.utterances) && segmentation.utterances.length
    || String(generatedNote.evolution?.text || generatedNote.evolution || "").trim()
  );
}

export function sesionVozExpirada(payload = {}, now = Date.now()) {
  return Boolean(payload.expiresAt && Number(payload.expiresAt) < now);
}

export function validarSesionVozContexto(payload = {}, context = {}) {
  if (!payload || payload.schemaVersion !== VOICE_NOTE_SESSION_SCHEMA_VERSION) return false;
  if (sesionVozExpirada(payload)) return false;
  return payload.userId === context.userId
    && payload.patientId === context.patientId
    && payload.encounterId === context.encounterId;
}

function abrirDb() {
  if (!puedeUsarIndexedDB()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(VOICE_NOTE_SESSION_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: "key" });
        store.createIndex("contextKey", "contextKey", { unique: false });
        store.createIndex("updatedAtMs", "updatedAtMs", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SEGMENTATION_RESULTS)) {
        const store = db.createObjectStore(STORE_SEGMENTATION_RESULTS, { keyPath: "key" });
        store.createIndex("contextKey", "contextKey", { unique: false });
        store.createIndex("updatedAtMs", "updatedAtMs", { unique: false });
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

async function listarPorContexto(storeName, contextKey) {
  const db = await abrirDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const resultados = [];
    const tx = db.transaction(storeName, "readonly");
    const index = tx.objectStore(storeName).index("contextKey");
    const request = index.openCursor(IDBKeyRange.only(contextKey));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      resultados.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => resolve([]);
    tx.oncomplete = () => {
      db.close();
      resolve(resultados);
    };
    tx.onerror = () => {
      db.close();
      resolve([]);
    };
    tx.onabort = () => {
      db.close();
      resolve([]);
    };
  });
}

export async function guardarSesionNotaVozLocal(payload = {}, { ttlMs = VOICE_NOTE_SESSION_TTL_MS } = {}) {
  if (!sesionVozTieneContenido(payload)) return null;
  const now = Date.now();
  const contextKey = crearContextKeyVoz(payload);
  const key = crearSessionKeyVoz(payload);
  const record = {
    key,
    contextKey,
    updatedAtMs: now,
    expiresAt: now + ttlMs,
    payload: {
      ...payload,
      key,
      contextKey,
      schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
      updatedAtMs: now,
      updatedAt: new Date(now).toISOString(),
      expiresAt: now + ttlMs
    }
  };
  await conStore(STORE_SESSIONS, "readwrite", (store) => store.put(record));
  return record.payload;
}

export async function buscarSesionesNotaVozLocales(context = {}) {
  const contextKey = crearContextKeyVoz(context);
  const records = await listarPorContexto(STORE_SESSIONS, contextKey);
  const validas = records
    .map((record) => record.payload)
    .filter((payload) => validarSesionVozContexto(payload, context) && sesionVozTieneContenido(payload))
    .sort((a, b) => Number(b.updatedAtMs || Date.parse(b.updatedAt) || 0) - Number(a.updatedAtMs || Date.parse(a.updatedAt) || 0));
  return validas;
}

export async function eliminarSesionNotaVozLocal(payloadOrContext = {}) {
  const key = payloadOrContext.key || crearSessionKeyVoz(payloadOrContext);
  if (!key) return;
  await conStore(STORE_SESSIONS, "readwrite", (store) => store.delete(key));
}

export async function guardarSegmentacionNotaVozLocal(payload = {}, { ttlMs = VOICE_NOTE_SESSION_TTL_MS } = {}) {
  if (!payload.transcriptHash || !Array.isArray(payload.utterances) || !payload.utterances.length) return null;
  const now = Date.now();
  const contextKey = crearContextKeyVoz(payload);
  const key = crearSegmentationKeyVoz(payload);
  const record = {
    key,
    contextKey,
    updatedAtMs: now,
    expiresAt: now + ttlMs,
    payload: {
      ...payload,
      key,
      contextKey,
      updatedAtMs: now,
      updatedAt: new Date(now).toISOString(),
      expiresAt: now + ttlMs
    }
  };
  await conStore(STORE_SEGMENTATION_RESULTS, "readwrite", (store) => store.put(record));
  return record.payload;
}

export async function obtenerSegmentacionNotaVozLocal(context = {}) {
  const key = crearSegmentationKeyVoz(context);
  const record = await obtener(STORE_SEGMENTATION_RESULTS, key);
  const payload = record?.payload || null;
  if (!payload || sesionVozExpirada(payload)) return null;
  if (payload.userId !== context.userId || payload.patientId !== context.patientId || payload.encounterId !== context.encounterId) return null;
  return payload;
}

export async function limpiarSesionesNotaVozVencidas(now = Date.now()) {
  const db = await abrirDb();
  if (!db) return 0;
  return new Promise((resolve) => {
    let deleted = 0;
    const tx = db.transaction([STORE_SESSIONS, STORE_SEGMENTATION_RESULTS], "readwrite");
    for (const storeName of [STORE_SESSIONS, STORE_SEGMENTATION_RESULTS]) {
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value?.expiresAt && cursor.value.expiresAt < now) {
          cursor.delete();
          deleted += 1;
        }
        cursor.continue();
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve(deleted);
    };
    tx.onerror = () => {
      db.close();
      resolve(deleted);
    };
    tx.onabort = () => {
      db.close();
      resolve(deleted);
    };
  });
}
