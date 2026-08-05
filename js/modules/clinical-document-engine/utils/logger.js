const state = { enabled: true };
export const logger = Object.freeze({
  configure({ enabled } = {}) { if (typeof enabled === "boolean") state.enabled = enabled; },
  debug(...args) { if (state.enabled) console.debug("[MIDC]", ...args); },
  info(...args) { if (state.enabled) console.info("[MIDC]", ...args); },
  warn(...args) { if (state.enabled) console.warn("[MIDC]", ...args); },
  error(...args) { if (state.enabled) console.error("[MIDC]", ...args); }
});
