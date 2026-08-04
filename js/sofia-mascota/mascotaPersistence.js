import { DEFAULT_PREFERENCES, STORAGE_KEY } from "./config.js";

const VALID_POSITIONS = new Set(["bottom-right", "bottom-left"]);
const VALID_SIZES = new Set(["small", "medium", "large"]);

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const preferences = { ...DEFAULT_PREFERENCES };
      console.debug("[SOFÍA Mascota] Preferencias cargadas", { preferences, source: "defaults" });
      return preferences;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.enabled === false) {
      console.warn("[SOFÍA Mascota] Preferencia enabled=false detectada; se restablece temporalmente a true para validar el montaje.");
      const { enabled: _ignored, ...otherPreferences } = parsed;
      const preferences = { ...DEFAULT_PREFERENCES, ...otherPreferences, enabled: true };
      console.debug("[SOFÍA Mascota] Preferencias cargadas", { preferences, source: "safe-migration" });
      return preferences;
    }
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      enabled: parsed.enabled !== false,
      animationsEnabled: parsed.animationsEnabled !== false,
      position: VALID_POSITIONS.has(parsed.position) ? parsed.position : DEFAULT_PREFERENCES.position,
      size: VALID_SIZES.has(parsed.size) ? parsed.size : DEFAULT_PREFERENCES.size
    };
    console.debug("[SOFÍA Mascota] Preferencias cargadas", { preferences, source: "storage" });
    return preferences;
  } catch (error) {
    console.warn("[SOFÍA Mascota] Preferencias corruptas; se restauran valores por defecto.", error);
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn("[SOFÍA Mascota] Error de persistencia.", error);
  }
}
