const loggerConfig = { enabled: true };

export const clinicalImportLogger = Object.freeze({
  configure(options = {}) { if (typeof options.enabled === "boolean") loggerConfig.enabled = options.enabled; },
  debug(...args) { if (loggerConfig.enabled) console.debug("[patient-transfer]", ...args); },
  info(...args) { if (loggerConfig.enabled) console.info("[patient-transfer]", ...args); },
  warn(...args) { if (loggerConfig.enabled) console.warn("[patient-transfer]", ...args); },
  error(...args) { if (loggerConfig.enabled) console.error("[patient-transfer]", ...args); }
});
