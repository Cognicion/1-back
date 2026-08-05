export function validatePatient(value = {}) {
  const hasName = Boolean(String(value.nombreCompleto || value.name || "").trim());
  const hasRecord = Boolean(String(value.expediente || value.recordNumber || "").trim());
  return { valid: hasName || hasRecord, errors: hasName || hasRecord ? [] : ["nombreCompleto|expediente"] };
}
