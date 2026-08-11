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

function globalVariable(variable) {
  return stripIdentifiers({ variableId: variable.variableId, canonicalName: variable.canonicalName, domain: variable.domain, datatype: variable.datatype, statisticalType: variable.statisticalType, unit: variable.unit, observedAt: variable.observedAt, value: variable.value, confidence: variable.confidence, provenance: { sourceType: "clinical_record", sourceRecordType: variable.provenance?.sourceRecordType || null, sourceField: variable.provenance?.sourceField || null, observedAt: variable.observedAt, extractedAt: variable.provenance?.extractedAt, extractorVersion: variable.provenance?.extractorVersion } });
}

module.exports = { analyticsPatientId, stripIdentifiers, globalVariable };
