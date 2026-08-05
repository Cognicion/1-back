export function normalizeRecordNumber(value = "") { return String(value || "").replace(/\u00a0/g, " ").trim().replace(/[\s\-–—._/]+/g, "").toUpperCase(); }
