import { DEFAULT_PREFERENCES, STORAGE_KEY } from "./config.js";

const VALID_POSITIONS = new Set(["bottom-right", "bottom-left"]);
const VALID_SIZES = new Set(["small", "medium", "large"]);

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      enabled: parsed.enabled !== false,
      animationsEnabled: parsed.animationsEnabled !== false,
      position: VALID_POSITIONS.has(parsed.position) ? parsed.position : DEFAULT_PREFERENCES.position,
      size: VALID_SIZES.has(parsed.size) ? parsed.size : DEFAULT_PREFERENCES.size
    };
    console.debug("[SOFÍA Mascota]", { preferencesRecovered: preferences });
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
