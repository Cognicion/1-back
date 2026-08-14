const crypto = require("crypto");

function analyticsPatientId(patientId = "") {
  return crypto.createHash("sha256").update(`cognicion-clinical-analytics-v1:${String(patientId)}`).digest("hex");
}

function stripIdentifiers(value) {
  if (Array.isArray(value)) return value.map(stripIdentifiers);
  if (!value || typeof value !== "object") return value;
  const blocked = /^(name|nombre|nombres|apellido|apellidos|telefono|tel|phone|email|correo|domicilio|direccion|dirección|curp|rfc|patientid|pacienteid|pacienteuid|uid|uidpaciente|expediente|numeroexpediente|fotografia|foto|documento|path|ruta)$/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.test(key)).map(([key, item]) => [key, stripIdentifiers(item)]));
}

function monthBucket(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeGlobalValue(variable = {}) {
  if (typeof variable.value === "boolean" || typeof variable.value === "number") return variable.value;
  if (variable.variableId === "diagnosis") {
    const code = String(variable.value?.code || "").toUpperCase().trim();
    return { documented: true, code: /^[A-Z][0-9]{2}(?:\.[A-Z0-9]{1,4})?$/.test(code) ? code : null };
  }
  if (variable.variableId === "laboratory") return {
    documented: true,
    value: safeNumber(variable.value?.value)
  };
  if (variable.variableId === "vital_sign") return {
    documented: true,
    weight: safeNumber(variable.value?.weight),
    height: safeNumber(variable.value?.height),
    bmi: safeNumber(variable.value?.bmi),
    heartRate: safeNumber(variable.value?.heartRate),
    temperature: safeNumber(variable.value?.temperature),
    oxygenSaturation: safeNumber(variable.value?.oxygenSaturation)
  };
  return { documented: true };
}

function globalVariable(variable) {
  return stripIdentifiers({ variableId: variable.variableId, canonicalName: variable.canonicalName, domain: variable.domain, datatype: variable.datatype, statisticalType: variable.statisticalType, unit: variable.unit, observedAt: monthBucket(variable.observedAt), value: safeGlobalValue(variable), confidence: variable.confidence, provenance: { sourceType: "clinical_record", sourceRecordType: variable.provenance?.sourceRecordType || null, sourceField: variable.provenance?.sourceField || null, observedAt: monthBucket(variable.observedAt), extractedAt: monthBucket(variable.provenance?.extractedAt), extractorVersion: variable.provenance?.extractorVersion } });
}

module.exports = { analyticsPatientId, stripIdentifiers, globalVariable, safeGlobalValue };
