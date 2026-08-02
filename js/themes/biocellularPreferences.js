export const BIOCELLULAR_DEFAULTS = Object.freeze({
  style: "sutil", intensity: "baja", speed: "muy-lenta", particles: "pocas", depth: "media", blur: "medio", interaction: "desactivada",
  pauseHidden: true, respectReducedMotion: true, reduceQuality: true, disableTouch: true, disableMobile: false, batterySaverStatic: false, limitFps: true, reduceOnTables: true,
  quality: "media", animation: "ligera", fps: 18, renderScale: 0.8, dprMax: 1,
  pauseDuringFastScroll: true, reduceWhileScrolling: true, dynamicBlur: false, parallax: "bajo"
});

const KEY = "cognicion.apariencia.biocelular";

export function getBiocellularPreferences() {
  try { return { ...BIOCELLULAR_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}")} } catch { return { ...BIOCELLULAR_DEFAULTS }; }
}

export function saveBiocellularPreferences(preferences) {
  const value = { ...BIOCELLULAR_DEFAULTS, ...preferences };
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (error) { console.warn("No se pudieron guardar las preferencias Biocelular.", error); }
  return value;
}

export function resetBiocellularPreferences() { return saveBiocellularPreferences(BIOCELLULAR_DEFAULTS); }
