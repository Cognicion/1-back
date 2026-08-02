const CLAVE = "cognicion_pattern_discovery_text_v1";
const DB_NAME = "cognicion_pattern_discovery";
const DB_VERSION = 1;
const STORE = "indices";

function abrirBase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("IndexedDB no está disponible en este navegador.")); return; }
    const solicitud = indexedDB.open(DB_NAME, DB_VERSION);
    solicitud.onupgradeneeded = () => solicitud.result.createObjectStore(STORE);
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error || new Error("No se pudo abrir IndexedDB."));
  });
}

export async function cargarIndice() {
  try {
    const db = await abrirBase();
    const indice = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const solicitud = tx.objectStore(STORE).get(CLAVE);
      solicitud.onsuccess = () => resolve(solicitud.result || null);
      solicitud.onerror = () => reject(solicitud.error);
    });
    db.close();
    if (indice) return indice;
  } catch (error) {
    console.warn("[PATTERNS] No se pudo leer IndexedDB; se intentará memoria/localStorage", error);
  }
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{"notas":{}}'); } catch { return { notas: {} }; }
}

export async function guardarIndice(indice) {
  const db = await abrirBase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(indice, CLAVE);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("No se pudo guardar el índice en IndexedDB."));
    tx.onabort = () => reject(tx.error || new Error("Se canceló el guardado del índice."));
  });
  db.close();
}

export function actualizarNotaIndice(indice, nota) { indice.notas[nota.notaId] = nota; return indice; }
