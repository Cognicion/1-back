import { normalizeDiagnosticCode } from "../normalizers/diagnosisNormalizer.js";
export function validateDiagnosis(value = {}) {
  const errors = [];
  if (!String(value.diagnosisName || value.name || "").trim()) errors.push("diagnosisName");
  if (value.code && !normalizeDiagnosticCode(value.code)) errors.push("code");
  return { valid: errors.length === 0, errors };
}
