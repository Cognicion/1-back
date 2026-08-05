import { fieldValues, normalizeLabelForMatching } from "./patientFieldParser.js";
import { normalizeRecordNumber } from "./patientDuplicateMatcher.js";

export function normalizePatientIdentityValue(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function resolvePatientIdentity(fields = {}) {
  const values = fieldValues(fields);
  const nombreCompleto = String(values.nombre || "").trim();
  const expediente = normalizeRecordNumber(values.expediente);
  const fechaNacimiento = String(values.fechaNacimiento || "").trim();
  const edad = String(values.edad || "").trim();
  const servicio = String(values.servicio || "").trim();
  const cama = String(values.cama || "").trim();
  const hasRecordNumber = Boolean(expediente);
  const hasName = Boolean(nombreCompleto);
  const hasBirthDate = Boolean(fechaNacimiento);
  const hasContext = Boolean(edad && (servicio || cama));
  let identityConfidence = "none";
  if (hasRecordNumber && hasName) identityConfidence = "high";
  else if (hasName && hasBirthDate) identityConfidence = "high";
  else if (hasName && hasContext) identityConfidence = "medium";
  else if (hasName || hasRecordNumber) identityConfidence = "low";
  return {
    identifiable: identityConfidence === "high" || identityConfidence === "medium",
    identityConfidence,
    nombreCompleto,
    normalizedName: normalizePatientIdentityValue(nombreCompleto),
    expediente,
    fechaNacimiento,
    sourceFields: Object.entries(values)
      .filter(([, value]) => Boolean(String(value || "").trim()))
      .map(([key]) => key),
    values
  };
}

export function identityComparisonKey(value = "") {
  return normalizePatientIdentityValue(value).replace(/[^A-Z0-9 ]/g, "");
}

export { normalizeLabelForMatching };
