const PREFIJO = "cognicion.dictadoClinico";
const DB_NAME = "cognicionVoiceNoteDrafts";
const DB_VERSION = 1;
const STORE_NAME = "dictationDrafts";

function claveSegura(valor = "sin-id") {
  return String(valor || "sin-id").replace(/[^\w.-]+/g, "_");
}

export class DraftPersistenceService {
  constructor({ userId = "anonimo", patientId = "sin-paciente", encounterId = "sin-encuentro" } = {}) {
    this.setContext({ userId, patientId, encounterId });
  }

  setContext({ userId, patientId, encounterId } = {}) {
    if (userId !== undefined) this.userId = claveSegura(userId || "anonimo");
    if (patientId !== undefined) this.patientId = claveSegura(patientId || "sin-paciente");
    if (encounterId !== undefined) this.encounterId = claveSegura(encounterId || "sin-encuentro");
  }

  key() {
    return `${PREFIJO}.draft.${this.userId}.${this.patientId}.${this.encounterId}`;
  }

  indexKey() {
    return `${PREFIJO}.draft.index.${this.userId}`;
  }

  save(snapshot = {}) {
    const payload = {
      ...snapshot,
      userId: this.userId,
      patientId: this.patientId,
      encounterId: this.encounterId,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(this.key(), JSON.stringify(payload));
    localStorage.setItem(this.indexKey(), this.key());
    this.saveIndexedDB(payload).catch(() => {});
    return payload;
  }

  load() {
    try {
      const directo = localStorage.getItem(this.key());
      if (!directo) return null;
      const payload = JSON.parse(directo);
      if (payload?.userId !== this.userId || payload?.patientId !== this.patientId || payload?.encounterId !== this.encounterId) return null;
      return payload;
    } catch (error) {
      console.warn("No se pudo recuperar el borrador de dictado:", error);
      return null;
    }
  }

  clear() {
    localStorage.removeItem(this.key());
    this.deleteIndexedDB(this.key()).catch(() => {});
  }

  openIndexedDB() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async saveIndexedDB(payload = {}) {
    const db = await this.openIndexedDB();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ ...payload, storageKey: this.key() });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
    db.close();
  }

  async deleteIndexedDB(storageKey = this.key()) {
    const db = await this.openIndexedDB();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(storageKey);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
    db.close();
  }
}
