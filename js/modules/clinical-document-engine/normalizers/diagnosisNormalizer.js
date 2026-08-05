export function normalizeDiagnosticCode(value = "") {
  const code = String(value || "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]\d{2}(?:\.\d{1,2})?$/.test(code) || /^\d[A-Z]\d{2,3}$/.test(code) ? code : "";
}

export function normalizeDiagnosis(value = "") {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
