export const VOICE_NOTE_SESSION_SCHEMA_VERSION = "voice_note_session_v1";
export const VOICE_NOTE_SESSION_TTL_POLICY_VERSION = 2;
export const VOICE_NOTE_SESSION_TTL_HOURS = 72;
export const VOICE_NOTE_SESSION_TTL_MS = VOICE_NOTE_SESSION_TTL_HOURS * 60 * 60 * 1000;
export const VOICE_NOTE_SESSION_DB_NAME = "cognicionVoiceNoteSessionStore";
const DB_VERSION = 1;
const STORE_SESSIONS = "sessions";
const STORE_SEGMENTATION_RESULTS = "segmentationResults";
const PREFIX_SESSION = "cognicion.voiceNote.session";
const PREFIX_SEGMENTATION = "cognicion.voiceNote.segmentation";

function puedeUsarIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function crearErrorPersistencia(message, code = "indexeddb_error", cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function clonarSerializable(payload = {}) {
  try {
    if (typeof structuredClone === "function") return structuredClone(payload);
    return JSON.parse(JSON.stringify(payload));
  } catch (error) {
    throw crearErrorPersistencia("El snapshot de nota por voz contiene datos no serializables.", "serialization_failed", error);
  }
}

function logPersistenciaLocal(stage, payload = {}, extra = {}) {
  try {
    const transcript = payload.transcript || {};
    const segmentation = payload.segmentation || payload || {};
    const manifest = segmentation.blockManifest || {};
    const blocks = Array.isArray(manifest.blocks) ? manifest.blocks : [];
    console.info("[voice-session-indexeddb]", {
      stage,
      sessionId: payload.sessionId || "",
      saveVersion: payload.saveVersion || 0,
      transcriptHash: String(transcript.transcriptHash || payload.transcriptHash || "").slice(0, 10),
      transcriptLength: String(transcript.corrected || transcript.original || "").length,
      blockManifest: Boolean(blocks.length),
      totalBlocks: Number(manifest.totalBlocks || payload.totalBlocks || blocks.length || 0),
      completedBlocks: blocks.filter((block) => ["completed", "success", "completed_from_children"].includes(block.status)).length || payload.completedBlocks || 0,
      failedBlocks: blocks.filter((block) => block.status === "failed").length || payload.failedBlocks || 0,
      pendingBlocks: payload.pendingBlocks || 0,
      ...extra
    });
  } catch {
    // La telemetria tecnica nunca debe bloquear el guardado clinico local.
  }
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
    || Array.isArray(segmentation.blockManifest?.blocks) && segmentation.blockManifest.blocks.length
    || String(generatedNote.evolution?.text || generatedNote.evolution || "").trim()
  );
}

export function sesionVozExpirada(payload = {}, now = Date.now()) {
  const status = String(payload.sessionStatus || "draft");
  if (!["draft", "in_progress", "generated"].includes(status)) return false;
  return Boolean(payload.expiresAt && Number(payload.expiresAt) <= now);
}

function obtenerActividadSignificativaMs(payload = {}, now = Date.now()) {
  return Number(
    payload.lastMeaningfulActivityAtMs
    || Date.parse(payload.lastMeaningfulActivityAt)
    || payload.updatedAtMs
    || Date.parse(payload.updatedAt)
    || payload.createdAtMs
    || Date.parse(payload.createdAt)
    || now
  );
}

export function migrarPoliticaTtlSesionVoz(payload = {}, now = Date.now()) {
  if (!payload || Number(payload.ttlPolicyVersion || 0) >= VOICE_NOTE_SESSION_TTL_POLICY_VERSION) return payload;
  const meaningfulActivityMs = obtenerActividadSignificativaMs(payload, now);
  return {
    ...payload,
    ttlPolicyVersion: VOICE_NOTE_SESSION_TTL_POLICY_VERSION,
    ttlHours: VOICE_NOTE_SESSION_TTL_HOURS,
    lastMeaningfulActivityAtMs: meaningfulActivityMs,
    lastMeaningfulActivityAt: new Date(meaningfulActivityMs).toISOString(),
    expiresAt: meaningfulActivityMs + VOICE_NOTE_SESSION_TTL_MS
  };
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
  if (!db) throw crearErrorPersistencia("IndexedDB no esta disponible.", "indexeddb_unavailable");
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let resultado = null;
    try {
      resultado = callback(store);
    } catch (error) {
      db.close();
      reject(crearErrorPersistencia("No se pudo preparar la transaccion de IndexedDB.", error?.name || "transaction_prepare_failed", error));
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      const error = tx.error || new Error("IndexedDB transaction error");
      db.close();
      reject(crearErrorPersistencia("La transaccion de IndexedDB fallo.", error?.name || "transaction_error", error));
    };
    tx.onabort = () => {
      const error = tx.error || new Error("IndexedDB transaction aborted");
      db.close();
      reject(crearErrorPersistencia("La transaccion de IndexedDB fue abortada.", error?.name || "transaction_abort", error));
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
  const meaningfulActivityMs = obtenerActividadSignificativaMs(payload, now);
  const expiresAt = meaningfulActivityMs + ttlMs;
  const contextKey = crearContextKeyVoz(payload);
  const key = crearSessionKeyVoz(payload);
  const previous = await obtener(STORE_SESSIONS, key);
  const previousPayload = previous?.payload || null;
  const incomingVersion = Number(payload.saveVersion || 0);
  const previousVersion = Number(previousPayload?.saveVersion || 0);
  const incomingUpdated = Number(payload.updatedAtMs || Date.parse(payload.updatedAt) || now);
  const previousUpdated = Number(previousPayload?.updatedAtMs || Date.parse(previousPayload?.updatedAt) || 0);
  if (previousPayload && incomingVersion < previousVersion) return previousPayload;
  if (previousPayload && incomingVersion === previousVersion && incomingUpdated < previousUpdated) return previousPayload;
  logPersistenciaLocal("serialization_validated", payload);
  const safePayload = clonarSerializable(payload);
  const record = clonarSerializable({
    key,
    contextKey,
    updatedAtMs: now,
    expiresAt,
    payload: {
      ...safePayload,
      key,
      contextKey,
      schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
      ttlPolicyVersion: VOICE_NOTE_SESSION_TTL_POLICY_VERSION,
      ttlHours: VOICE_NOTE_SESSION_TTL_HOURS,
      saveVersion: Math.max(incomingVersion, previousVersion + 1),
      sessionStatus: safePayload.sessionStatus || (safePayload.generatedNote ? "generated" : "in_progress"),
      lastMeaningfulActivityAtMs: meaningfulActivityMs,
      lastMeaningfulActivityAt: new Date(meaningfulActivityMs).toISOString(),
      updatedAtMs: now,
      updatedAt: new Date(now).toISOString(),
      expiresAt
    }
  });
  logPersistenciaLocal("transaction_started", record.payload);
  await conStore(STORE_SESSIONS, "readwrite", (store) => store.put(record));
  logPersistenciaLocal("transaction_completed", record.payload, { transactionStatus: "complete" });
  logPersistenciaLocal("readback_started", record.payload);
  const verified = await obtener(STORE_SESSIONS, key);
  if (!verified?.payload || verified.payload.sessionId !== record.payload.sessionId) {
    throw crearErrorPersistencia("IndexedDB no confirmo la lectura posterior del snapshot.", "verification_failed");
  }
  logPersistenciaLocal("readback_completed", verified.payload, { transactionStatus: "verified" });
  return record.payload;
}

export async function buscarSesionesNotaVozLocales(context = {}) {
  const contextKey = crearContextKeyVoz(context);
  const records = await listarPorContexto(STORE_SESSIONS, contextKey);
  const migratedRecords = await Promise.all(records.map(async (record) => {
    const payload = record.payload || null;
    const migratedPayload = migrarPoliticaTtlSesionVoz(payload);
    if (!payload || migratedPayload === payload) return record;
    const migratedRecord = clonarSerializable({
      ...record,
      expiresAt: migratedPayload.expiresAt,
      payload: migratedPayload
    });
    try {
      await conStore(STORE_SESSIONS, "readwrite", (store) => store.put(migratedRecord));
      logPersistenciaLocal("ttl_policy_migrated", migratedPayload, {
        previousPolicyVersion: Number(payload.ttlPolicyVersion || 1),
        newPolicyVersion: VOICE_NOTE_SESSION_TTL_POLICY_VERSION,
        sessionId: String(payload.sessionId || "").slice(0, 12)
      });
      return migratedRecord;
    } catch (error) {
      logPersistenciaLocal("ttl_policy_migration_failed", payload, {
        errorCode: error?.code || error?.name || "ttl_migration_failed"
      });
      return record;
    }
  }));
  const validas = migratedRecords
    .map((record) => record.payload)
    .filter((payload) => validarSesionVozContexto(payload, context) && sesionVozTieneContenido(payload))
    .sort((a, b) => Number(b.updatedAtMs || Date.parse(b.updatedAt) || 0) - Number(a.updatedAtMs || Date.parse(a.updatedAt) || 0));
  return validas;
}

export async function eliminarSesionNotaVozLocal(payloadOrContext = {}) {
  const key = payloadOrContext.key || crearSessionKeyVoz(payloadOrContext);
  if (!key) return;
  await conStore(STORE_SESSIONS, "readwrite", (store) => store.delete(key));
  const sessionId = payloadOrContext.sessionId || "";
  if (!sessionId) return;
  const db = await abrirDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(STORE_SEGMENTATION_RESULTS, "readwrite");
    const store = tx.objectStore(STORE_SEGMENTATION_RESULTS);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const payload = cursor.value?.payload || {};
      if ((payload.sourceSessionId || payload.sessionId || "") === sessionId) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      resolve();
    };
  });
}

export async function guardarSegmentacionNotaVozLocal(payload = {}, { ttlMs = VOICE_NOTE_SESSION_TTL_MS } = {}) {
  const hasUtterances = Array.isArray(payload.utterances) && payload.utterances.length;
  const hasBlocks = Array.isArray(payload.blockManifest?.blocks) && payload.blockManifest.blocks.length;
  if (!payload.transcriptHash || (!hasUtterances && !hasBlocks)) return null;
  const now = Date.now();
  const meaningfulActivityMs = obtenerActividadSignificativaMs(payload, now);
  const expiresAt = meaningfulActivityMs + ttlMs;
  const contextKey = crearContextKeyVoz(payload);
  const key = crearSegmentationKeyVoz(payload);
  const previous = await obtener(STORE_SEGMENTATION_RESULTS, key);
  const previousPayload = previous?.payload || null;
  const incomingCompleted = Number(payload.completedBlocks || payload.blockManifest?.blocks?.filter((block) => ["completed", "success", "completed_from_children"].includes(block.status)).length || 0);
  const previousCompleted = Number(previousPayload?.completedBlocks || previousPayload?.blockManifest?.blocks?.filter((block) => ["completed", "success", "completed_from_children"].includes(block.status)).length || 0);
  if (previousPayload && incomingCompleted < previousCompleted && !payload.allowOlderProgress) return previousPayload;
  logPersistenciaLocal("serialization_validated", payload);
  const safePayload = clonarSerializable(payload);
  const record = clonarSerializable({
    key,
    contextKey,
    updatedAtMs: now,
    expiresAt,
    payload: {
      ...safePayload,
      key,
      contextKey,
      ttlPolicyVersion: VOICE_NOTE_SESSION_TTL_POLICY_VERSION,
      ttlHours: VOICE_NOTE_SESSION_TTL_HOURS,
      updatedAtMs: now,
      updatedAt: new Date(now).toISOString(),
      lastMeaningfulActivityAtMs: meaningfulActivityMs,
      lastMeaningfulActivityAt: new Date(meaningfulActivityMs).toISOString(),
      expiresAt
    }
  });
  logPersistenciaLocal("transaction_started", record.payload);
  await conStore(STORE_SEGMENTATION_RESULTS, "readwrite", (store) => store.put(record));
  logPersistenciaLocal("transaction_completed", record.payload, { transactionStatus: "complete" });
  logPersistenciaLocal("readback_started", record.payload);
  const verified = await obtener(STORE_SEGMENTATION_RESULTS, key);
  if (!verified?.payload) {
    throw crearErrorPersistencia("IndexedDB no confirmo la lectura posterior de la segmentacion.", "segmentation_verification_failed");
  }
  logPersistenciaLocal("readback_completed", verified.payload, { transactionStatus: "verified" });
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
    const expiredSessionIds = new Set();
    const tx = db.transaction(STORE_SESSIONS, "readwrite");
    const sessionStore = tx.objectStore(STORE_SESSIONS);
    const sessionRequest = sessionStore.openCursor();
    sessionRequest.onsuccess = () => {
      const cursor = sessionRequest.result;
      if (!cursor) return;
      const payload = cursor.value?.payload || {};
      const migratedPayload = migrarPoliticaTtlSesionVoz(payload, now);
      if (sesionVozExpirada(migratedPayload, now)) {
        expiredSessionIds.add(migratedPayload.sessionId);
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
    tx.oncomplete = () => {
      if (!expiredSessionIds.size) {
        db.close();
        resolve(0);
        return;
      }
      const txSeg = db.transaction(STORE_SEGMENTATION_RESULTS, "readwrite");
      const segmentationStore = txSeg.objectStore(STORE_SEGMENTATION_RESULTS);
      const segmentationRequest = segmentationStore.openCursor();
      segmentationRequest.onsuccess = () => {
        const cursor = segmentationRequest.result;
        if (!cursor) return;
        const payload = cursor.value?.payload || {};
        const sessionId = payload.sourceSessionId || payload.sessionId || "";
        if (sessionId && expiredSessionIds.has(sessionId)) {
          cursor.delete();
          deleted += 1;
        }
        cursor.continue();
      };
      txSeg.oncomplete = () => {
        db.close();
        console.info("[voice-session-indexeddb]", { stage: "ttl_cleanup", deletedCount: deleted, reason: "ttl_expired" });
        resolve(deleted);
      };
      txSeg.onerror = () => {
        db.close();
        resolve(deleted);
      };
      txSeg.onabort = () => {
        db.close();
        resolve(deleted);
      };
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
