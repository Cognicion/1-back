const DB_NAME = "cognicionVoiceNoteStyleConfigs";
const DB_VERSION = 1;
const STORE_CONFIGS = "styleConfigs";
const STORE_DEFAULTS = "styleDefaults";
export const STYLE_CONFIG_SCHEMA_VERSION = 1;

function abrirDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CONFIGS)) {
        db.createObjectStore(STORE_CONFIGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_DEFAULTS)) {
        db.createObjectStore(STORE_DEFAULTS, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function sanitizarTexto(value = "", max = 160) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function limpiarClinicalDefaults(componentStates = {}) {
  return Object.fromEntries(Object.entries(componentStates || {}).map(([key, value]) => [
    key,
    {
      state: value?.state || "omit",
      value: value?.saveClinicalValue === true ? value?.value || "" : "",
      other: value?.saveClinicalValue === true ? sanitizarTexto(value?.other || "", 120) : "",
      confirmed: false,
      preloaded: Boolean(value?.saveClinicalValue)
    }
  ]));
}

export function crearConfiguracionSeguraExamenMental(userId = "") {
  return {
    id: "safe_default",
    userId,
    name: "Configuracion segura por defecto",
    description: "Todos los componentes omitidos, sin citas ni hallazgos precargados.",
    version: STYLE_CONFIG_SCHEMA_VERSION,
    context: "cualquier_contexto",
    type: "estructura_y_visibilidad",
    isDefault: true,
    componentOrder: [],
    componentStates: {},
    structuralPreferences: { collapsedGroups: true },
    quotePreferences: { quoteMode: "omit", maxPatientQuotes: 1, quotePriority: "automatic" },
    standardizedDefaults: {},
    containsClinicalDefaults: false,
    builtIn: true,
    createdAt: "",
    updatedAt: ""
  };
}

export function normalizarConfiguracionEstilo(raw = {}, userId = "") {
  const ahora = new Date().toISOString();
  const containsClinicalDefaults = Boolean(raw.containsClinicalDefaults)
    || Object.values(raw.componentStates || {}).some((value) => value?.saveClinicalValue === true || Boolean(value?.preloaded));
  return {
    id: raw.id || `style-config-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    name: sanitizarTexto(raw.name || "Configuracion sin nombre", 80),
    description: sanitizarTexto(raw.description || "", 240),
    version: STYLE_CONFIG_SCHEMA_VERSION,
    context: sanitizarTexto(raw.context || "cualquier_contexto", 80),
    type: raw.type === "estructura_con_valores_clinicos" ? raw.type : "estructura_y_visibilidad",
    isDefault: Boolean(raw.isDefault),
    componentOrder: Array.isArray(raw.componentOrder) ? raw.componentOrder.map((item) => sanitizarTexto(item, 80)).filter(Boolean) : [],
    componentStates: containsClinicalDefaults ? limpiarClinicalDefaults(raw.componentStates || {}) : Object.fromEntries(Object.entries(raw.componentStates || {}).map(([key, value]) => [key, { state: value?.state || "omit" }])),
    structuralPreferences: raw.structuralPreferences || {},
    quotePreferences: raw.quotePreferences || { quoteMode: "omit", maxPatientQuotes: 1, quotePriority: "automatic" },
    standardizedDefaults: containsClinicalDefaults ? (raw.standardizedDefaults || {}) : {},
    containsClinicalDefaults,
    createdAt: raw.createdAt || ahora,
    updatedAt: ahora
  };
}

export async function listarConfiguracionesEstilo(userId = "") {
  if (!userId || typeof indexedDB === "undefined") return [crearConfiguracionSeguraExamenMental(userId)];
  const db = await abrirDb();
  const all = await requestToPromise(txStore(db, STORE_CONFIGS).getAll());
  const defaults = await requestToPromise(txStore(db, STORE_DEFAULTS).get(userId)).catch(() => null);
  const propias = all.filter((item) => item.userId === userId).map((item) => ({
    ...item,
    isDefault: defaults?.configId ? item.id === defaults.configId : Boolean(item.isDefault)
  }));
  return [crearConfiguracionSeguraExamenMental(userId), ...propias];
}

export async function guardarConfiguracionEstilo(userId = "", config = {}) {
  if (!userId || typeof indexedDB === "undefined") throw new Error("No se pudo guardar la configuracion local.");
  const db = await abrirDb();
  const normalized = normalizarConfiguracionEstilo(config, userId);
  await requestToPromise(txStore(db, STORE_CONFIGS, "readwrite").put(normalized));
  if (normalized.isDefault) {
    await establecerConfiguracionEstiloPredeterminada(userId, normalized.id);
  }
  return normalized;
}

export async function eliminarConfiguracionEstilo(userId = "", configId = "") {
  if (!userId || !configId || configId === "safe_default" || typeof indexedDB === "undefined") return;
  const db = await abrirDb();
  const current = await requestToPromise(txStore(db, STORE_CONFIGS).get(configId));
  if (current?.userId !== userId) return;
  await requestToPromise(txStore(db, STORE_CONFIGS, "readwrite").delete(configId));
}

export async function establecerConfiguracionEstiloPredeterminada(userId = "", configId = "safe_default") {
  if (!userId || typeof indexedDB === "undefined") return;
  const db = await abrirDb();
  await requestToPromise(txStore(db, STORE_DEFAULTS, "readwrite").put({
    userId,
    configId,
    updatedAt: new Date().toISOString()
  }));
}

export async function obtenerConfiguracionEstiloPredeterminada(userId = "") {
  if (!userId || typeof indexedDB === "undefined") return "safe_default";
  const db = await abrirDb();
  const current = await requestToPromise(txStore(db, STORE_DEFAULTS).get(userId)).catch(() => null);
  return current?.configId || "safe_default";
}

export function exportarConfiguracionEstilo(config = {}) {
  const exportable = { ...config };
  delete exportable.userId;
  return JSON.stringify(exportable, null, 2);
}

export function importarConfiguracionEstilo(text = "", userId = "") {
  const parsed = JSON.parse(String(text || "{}"));
  delete parsed.patientId;
  delete parsed.encounterId;
  delete parsed.transcript;
  delete parsed.generatedNote;
  delete parsed.patientQuotes;
  delete parsed.manualObservations;
  return normalizarConfiguracionEstilo({ ...parsed, id: "", isDefault: false }, userId);
}
