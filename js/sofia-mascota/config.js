export const MASCOT_STATES = Object.freeze({
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  READING: "reading",
  PATTERN_DETECTION: "pattern-detection",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  SLEEPING: "sleeping"
});

export const STATE_MAP = Object.freeze({
  idle: MASCOT_STATES.IDLE,
  listening: MASCOT_STATES.LISTENING,
  analyzing: MASCOT_STATES.THINKING,
  thinking: MASCOT_STATES.THINKING,
  retrieving_memory: MASCOT_STATES.READING,
  reading: MASCOT_STATES.READING,
  detecting_patterns: MASCOT_STATES.PATTERN_DETECTION,
  "pattern-detection": MASCOT_STATES.PATTERN_DETECTION,
  completed: MASCOT_STATES.SUCCESS,
  success: MASCOT_STATES.SUCCESS,
  warning: MASCOT_STATES.WARNING,
  error: MASCOT_STATES.ERROR
});

export const STORAGE_KEY = "cognicion.sofiaMascot.preferences";
export const DEFAULT_PREFERENCES = Object.freeze({
  enabled: true,
  animationsEnabled: true,
  position: "bottom-right",
  size: "medium"
});

export const STATE_LABELS = Object.freeze({
  idle: "está inactiva", listening: "está escuchando", thinking: "está analizando",
  reading: "está consultando memoria", "pattern-detection": "está detectando patrones",
  success: "completó la operación", warning: "detectó una advertencia",
  error: "encontró un error", sleeping: "está dormida por inactividad"
});

export const TEMPORARY_STATES = Object.freeze(new Set([
  MASCOT_STATES.SUCCESS, MASCOT_STATES.WARNING, MASCOT_STATES.ERROR
]));
