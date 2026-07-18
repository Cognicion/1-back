const PREFIJO = "cognicion.dictadoClinico";
const FIRESTORE_DEVICE_PREF_KEY = "cognicion.dispositivoPersonal";
const LEGACY_INDEXED_DB_NAME = "cognicionVoiceNoteDrafts";
const LEGACY_INDEXED_DB_API = "indexedDB";
const memoriaSesion = new Map();

function claveSegura(valor = "sin-id") {
  return String(valor || "sin-id").replace(/[^\w.-]+/g, "_");
}

function dispositivoPersonalConfirmado() {
  try {
    return globalThis.localStorage?.getItem(FIRESTORE_DEVICE_PREF_KEY) === "1";
  } catch (_) {
    return false;
  }
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

  async save(snapshot = {}) {
    const payload = {
      ...snapshot,
      userId: this.userId,
      patientId: this.patientId,
      encounterId: this.encounterId,
      savedAt: new Date().toISOString()
    };
    memoriaSesion.set(this.key(), payload);
    if (dispositivoPersonalConfirmado()) {
      try {
        const { guardarBorradorClinicoLocal } = await import("./clinicalLocalStore.js");
        await guardarBorradorClinicoLocal(this.key(), payload);
      } catch (error) {
        console.warn("No se pudo guardar el borrador de dictado en IndexedDB:", error?.name || "error");
      }
    }
    return payload;
  }

  load() {
    const local = memoriaSesion.get(this.key());
    if (local) return this.validarContexto(local);
    if (!dispositivoPersonalConfirmado()) return null;
    return import("./clinicalLocalStore.js")
      .then(({ obtenerBorradorClinicoLocal }) => obtenerBorradorClinicoLocal(this.key()))
      .then((payload) => this.validarContexto(payload))
      .catch((error) => {
        console.warn(`No se pudo recuperar el borrador de dictado en ${LEGACY_INDEXED_DB_API} (${LEGACY_INDEXED_DB_NAME} legado):`, error?.name || "error");
        return null;
      });
  }

  async clear() {
    memoriaSesion.delete(this.key());
    if (!dispositivoPersonalConfirmado()) return;
    try {
      const { eliminarBorradorClinicoLocal } = await import("./clinicalLocalStore.js");
      await eliminarBorradorClinicoLocal(this.key());
    } catch (_) {
      // La limpieza local no debe bloquear la interfaz clínica.
    }
  }

  validarContexto(payload) {
    if (!payload) return null;
    if (payload?.userId !== this.userId || payload?.patientId !== this.patientId || payload?.encounterId !== this.encounterId) return null;
    return payload;
  }
}
