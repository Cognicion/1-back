const { CLINICAL_EXTRACTOR_VERSION } = require("./config");
const { valueToIso } = require("./contextBuilder");

const VARIABLE_CATALOG = Object.freeze({
  age: { canonicalName: "edad", domain: "demographics", datatype: "number", statisticalType: "continuous", unit: "years" },
  registered_sex: { canonicalName: "sexo_registrado", domain: "demographics", datatype: "string", statisticalType: "categorical", unit: null },
  education: { canonicalName: "escolaridad", domain: "demographics", datatype: "string", statisticalType: "categorical", unit: null },
  occupation: { canonicalName: "ocupacion", domain: "demographics", datatype: "string", statisticalType: "categorical", unit: null },
  psychiatric_history: { canonicalName: "antecedentes_psiquiatricos", domain: "history", datatype: "boolean", statisticalType: "binary", unit: null },
  medical_history: { canonicalName: "antecedentes_medicos", domain: "history", datatype: "boolean", statisticalType: "binary", unit: null },
  hospitalization: { canonicalName: "hospitalizacion_previa", domain: "events", datatype: "boolean", statisticalType: "binary", unit: null },
  suicide_attempt: { canonicalName: "intento_suicida", domain: "history", datatype: "boolean", statisticalType: "binary", unit: null },
  self_harm: { canonicalName: "autolesiones", domain: "history", datatype: "boolean", statisticalType: "binary", unit: null },
  substance_use: { canonicalName: "consumo_sustancias", domain: "history", datatype: "boolean", statisticalType: "binary", unit: null },
  inadequate_family_support: { canonicalName: "soporte_familiar_inadecuado", domain: "social", datatype: "boolean", statisticalType: "binary", unit: null },
  chronic_medical_condition: { canonicalName: "enfermedad_medica_cronica", domain: "history", datatype: "boolean", statisticalType: "binary", unit: null },
  diagnosis: { canonicalName: "diagnostico", domain: "diagnosis", datatype: "object", statisticalType: "categorical", unit: null },
  treatment: { canonicalName: "tratamiento", domain: "treatment", datatype: "object", statisticalType: "categorical", unit: null },
  mood: { canonicalName: "animo", domain: "symptoms", datatype: "boolean", statisticalType: "binary", unit: null },
  anxiety: { canonicalName: "ansiedad", domain: "symptoms", datatype: "boolean", statisticalType: "binary", unit: null },
  insomnia: { canonicalName: "insomnio", domain: "symptoms", datatype: "boolean", statisticalType: "binary", unit: null },
  suicidal_ideation: { canonicalName: "ideacion_suicida", domain: "symptoms", datatype: "boolean", statisticalType: "binary", unit: null },
  agitation: { canonicalName: "agitacion", domain: "symptoms", datatype: "boolean", statisticalType: "binary", unit: null },
  cognition: { canonicalName: "cognicion", domain: "symptoms", datatype: "boolean", statisticalType: "binary", unit: null },
  scale_score: { canonicalName: "puntuacion_escala", domain: "scales", datatype: "number", statisticalType: "continuous", unit: "score" },
  laboratory: { canonicalName: "laboratorio", domain: "laboratories", datatype: "object", statisticalType: "continuous", unit: null },
  vital_sign: { canonicalName: "signo_vital", domain: "vitals", datatype: "object", statisticalType: "continuous", unit: null },
  improvement: { canonicalName: "mejoria", domain: "events", datatype: "boolean", statisticalType: "binary", unit: null },
  relapse: { canonicalName: "recaida", domain: "events", datatype: "boolean", statisticalType: "binary", unit: null },
  treatment_suspension: { canonicalName: "suspension_tratamiento", domain: "events", datatype: "boolean", statisticalType: "binary", unit: null },
  readmission: { canonicalName: "reingreso", domain: "events", datatype: "boolean", statisticalType: "binary", unit: null }
});

const TERM_RULES = Object.freeze({
  mood: /\b(animo|ánimo|depres|triste|euforia|apatia|apatía)\b/i,
  anxiety: /\b(ansiedad|angustia|preocupacion|preocupación|panic|pánico)\b/i,
  insomnia: /\b(insomnio|no duerme|dificultad para dormir|sueño insuficiente)\b/i,
  suicidal_ideation: /\b(ideacion suicida|ideación suicida|ideas de muerte|deseos de morir|suicid)\b/i,
  agitation: /\b(agitacion|agitación|inquietud|irritable|irritabilidad)\b/i,
  cognition: /\b(memoria|concentracion|concentración|cognitiv)\b/i,
  hospitalization: /\b(hospitalizacion|hospitalización|ingreso hospitalario|urgencia)\b/i,
  suicide_attempt: /\b(intento suicida|intento de suicidio)\b/i,
  self_harm: /\b(autolesion|autolesión|cortarse|lesiones autoinfligidas)\b/i,
  substance_use: /\b(consumo de sustancias|alcohol|cannabis|cocaína|cocaina|opioide)\b/i,
  inadequate_family_support: /\b(sin red de apoyo|red de apoyo (?:escasa|limitada|inadecuada)|apoyo familiar (?:escaso|limitado|inadecuado)|conflicto familiar|abandono familiar)\b/i,
  chronic_medical_condition: /\b(enfermedad (?:médica|medica) crónica|padecimiento crónico|diabetes(?: mellitus)?|hipertensión(?: arterial)?|hipertension(?: arterial)?|enfermedad renal crónica|enfermedad hepatica crónica|enfermedad hepática crónica)\b/i,
  improvement: /\b(mejoria|mejoría|mejoró|mejoro|remision|remisión)\b/i,
  relapse: /\b(recaida|recaída|empeoramiento|descompensacion|descompensación)\b/i,
  treatment_suspension: /\b(suspendio|suspendió|suspension|suspensión|abandono|dejo de tomar|dejó de tomar)\b/i,
  readmission: /\b(reingreso|reingresó|reingreso hospitalario)\b/i
});

const NEGATION = /\b(niega|negó|nego|sin|no|niega presencia de|descarta)\b/i;
const ASSERTION_CONTEXT = Object.freeze({
  PRESENT: "PRESENT",
  NEGATED: "NEGATED",
  HISTORICAL: "HISTORICAL",
  POSSIBLE: "POSSIBLE",
  FAMILY: "FAMILY",
  UNKNOWN: "UNKNOWN"
});
const HISTORICAL_CONTEXT = /\b(antecedente|antecedentes|previo|previos|histori[ac]o|hace\s+\d+|en\s+20\d{2})\b/i;
const POSSIBLE_CONTEXT = /\b(posible|sospecha|a descartar|descartar|probable|se investiga)\b/i;
const FAMILY_CONTEXT = /\b(madre|padre|herman[oa]?|hijo|hija|familiar(?:es)?|pareja)\b/i;

function inferAge(patient = {}) {
  if (Number.isFinite(Number(patient.edad))) return Number(patient.edad);
  if (!patient.fechaNacimiento && !patient.nacimiento) return null;
  const date = new Date(patient.fechaNacimiento || patient.nacimiento);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function textFields(record = {}) {
  return Object.entries(record).filter(([key, value]) => typeof value === "string" && !/^id$|uid|email|correo|telefono|tel|curp|rfc|nombre|apellido|domicilio|direccion|dirección/i.test(key) && value.trim()).map(([sourceField, value]) => ({ sourceField, value }));
}

function evidenceExcerpt(text, matchIndex = 0, matchLength = 0) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= 500) return value;
  const center = Math.max(0, Math.min(value.length, matchIndex + Math.floor(matchLength / 2)));
  const start = Math.max(0, center - 220);
  const end = Math.min(value.length, center + 280);
  return `${start ? "…" : ""}${value.slice(start, end).trim()}${end < value.length ? "…" : ""}`;
}

function createVariable(variableId, value, observedAt, source, confidence = 0.7, displayValue = value) {
  const definition = VARIABLE_CATALOG[variableId];
  if (!definition || ((value === null || value === undefined || value === "") && source?.allowUnknown !== true)) return null;
  return {
    variableId,
    ...definition,
    source,
    observedAt: observedAt || null,
    value,
    displayValue,
    confidence,
    provenance: {
      sourceType: "patient_record",
      sourceModule: "clinicalAnalytics.variableExtractor",
      sourceField: source.sourceField || null,
      sourceRecordType: source.sourceRecordType || null,
      sourceRecordId: source.sourceRecordId || null,
      sourceRoot: source.sourceRoot || null,
      sourceDocumentId: source.sourceDocumentId || null,
      excerpt: source.excerpt || null,
      polarity: source.polarity || null,
      assertionContext: source.assertionContext || ASSERTION_CONTEXT.PRESENT,
      ruleApplied: source.ruleApplied || null,
      observedAt: observedAt || null,
      extractedAt: new Date().toISOString(),
      extractorVersion: CLINICAL_EXTRACTOR_VERSION
    }
  };
}

function clauseAtMatch(text = "", index = 0) {
  const value = String(text || "");
  const boundary = Math.max(value.lastIndexOf(".", index), value.lastIndexOf(";", index), value.lastIndexOf("\n", index));
  return value.slice(Math.max(0, boundary + 1), Math.min(value.length, index + 180));
}

function classifyAssertionContext(text, matchIndex = 0) {
  const clause = clauseAtMatch(text, matchIndex);
  if (FAMILY_CONTEXT.test(clause)) return ASSERTION_CONTEXT.FAMILY;
  if (NEGATION.test(clause)) return ASSERTION_CONTEXT.NEGATED;
  if (POSSIBLE_CONTEXT.test(clause)) return ASSERTION_CONTEXT.POSSIBLE;
  if (HISTORICAL_CONTEXT.test(clause)) return ASSERTION_CONTEXT.HISTORICAL;
  return ASSERTION_CONTEXT.PRESENT;
}

function extractClinicalVariables(context) {
  const variables = [];
  const patient = context.patient || {};
  const profileSource = { sourceField: "patientProfile", sourceRecordType: "patientProfile" };
  const age = inferAge(patient);
  if (age !== null) variables.push(createVariable("age", age, valueToIso(patient.updatedAt || patient.fechaNacimiento), profileSource, 0.95));
  for (const [variableId, fields] of [["registered_sex", ["sexo", "genero"]], ["education", ["escolaridad"]], ["occupation", ["ocupacion", "ocupación"]]]) {
    const field = fields.find((key) => patient[key] !== undefined && patient[key] !== "");
    if (field) variables.push(createVariable(variableId, String(patient[field]), valueToIso(patient.updatedAt), { ...profileSource, sourceField: field }, 0.9));
  }
  const diagnoses = Array.isArray(patient.diagnosticos) ? patient.diagnosticos : [...(patient.diagnostico ? [patient.diagnostico] : []), ...(Array.isArray(patient.historialDiagnosticos) ? patient.historialDiagnosticos : [])];
  diagnoses.forEach((diagnosis, index) => variables.push(createVariable("diagnosis", { code: diagnosis?.codigo || null, system: diagnosis?.sistema || null, status: diagnosis?.estado || "active", label: typeof diagnosis === "string" ? diagnosis : diagnosis?.nombre || diagnosis?.texto || null }, valueToIso(diagnosis?.fecha || patient.updatedAt), { sourceField: `diagnosticos[${index}]`, sourceRecordType: "patientProfile" }, 0.85)));
  const allRecords = Object.values(context.records || {}).flat();
  allRecords.forEach((record) => {
    const observedAt = valueToIso(record.fecha || record.fechaAplicacion || record.fechaInicio || record.observedAt || record.createdAt || record.updatedAt);
    const sourceBase = {
      sourceField: record._recordType,
      sourceRecordType: record._recordType,
      sourceRecordId: record.id || null,
      sourceRoot: record._sourceRoot || "usuarios",
      sourceDocumentId: record.id ? `${record._sourceRoot || "usuarios"}/${record._recordType}/${record.id}` : null
    };
    if (record.medicamento || record.nombreMedicamento) variables.push(createVariable("treatment", { medication: record.medicamento || record.nombreMedicamento, dose: record.dosis || null, route: record.via || null, frequency: record.frecuencia || null, status: record.estado || record.estatus || "active" }, observedAt, { ...sourceBase, sourceField: "medicamento" }, 0.9));
    if (record.puntajeTotal !== undefined || record.puntuacion !== undefined || record.score !== undefined) {
      const score = Number(record.puntajeTotal ?? record.puntuacion ?? record.score);
      if (Number.isFinite(score)) variables.push(createVariable("scale_score", score, observedAt, { ...sourceBase, sourceField: "puntajeTotal" }, 0.82, record.nombreEscala || record.nombre || record.escala));
    }
    if (record.analito || record.analyte || record.resultadoLaboratorio || record.valorLaboratorio) variables.push(createVariable("laboratory", { analyte: record.analito || record.analyte || record.nombre || null, value: record.valorLaboratorio ?? record.valor ?? record.resultadoLaboratorio ?? null, unit: record.unidad || null, referenceRange: record.rango || record.rangoReferencia || null }, observedAt, { ...sourceBase, sourceField: "laboratorio" }, 0.78));
    if (record.peso || record.talla || record.imc || record.presionArterial || record.ta || record.fc || record.frecuenciaCardiaca || record.temperatura || record.saturacion) variables.push(createVariable("vital_sign", { weight: record.peso ?? null, height: record.talla ?? null, bmi: record.imc ?? null, bloodPressure: record.presionArterial || record.ta || null, heartRate: record.fc || record.frecuenciaCardiaca || null, temperature: record.temperatura ?? null, oxygenSaturation: record.saturacion ?? null }, observedAt, { ...sourceBase, sourceField: "signosVitales" }, 0.82));
    if (record.fechaSuspension || /suspend|abandono|inactivo|finalizado/i.test(String(record.estado || record.estatus || record.motivoSuspension || ""))) variables.push(createVariable("treatment_suspension", true, valueToIso(record.fechaSuspension || record.updatedAt) || observedAt, { ...sourceBase, sourceField: "fechaSuspension" }, 0.9));
    textFields(record).forEach(({ sourceField, value }) => {
      Object.entries(TERM_RULES).forEach(([variableId, rule]) => {
        if (!rule.test(value)) return;
        const match = value.match(rule);
        const assertionContext = classifyAssertionContext(value, match?.index || 0);
        const negated = assertionContext === ASSERTION_CONTEXT.NEGATED;
        const uncertain = [ASSERTION_CONTEXT.POSSIBLE, ASSERTION_CONTEXT.FAMILY, ASSERTION_CONTEXT.UNKNOWN].includes(assertionContext);
        variables.push(createVariable(variableId, uncertain ? null : !negated, observedAt, {
          ...sourceBase,
          sourceField,
          excerpt: evidenceExcerpt(value, match?.index || 0, match?.[0]?.length || 0),
          polarity: negated ? "negative" : (uncertain ? "uncertain" : "positive"),
          assertionContext,
          allowUnknown: uncertain,
          ruleApplied: `term_rule:${variableId}:context-v2`
        }, negated ? 0.88 : (uncertain ? 0.55 : 0.72), negated ? "negated" : assertionContext.toLowerCase()));
      });
    });
  });
  return variables.filter(Boolean);
}

module.exports = {
  NEGATION,
  ASSERTION_CONTEXT,
  TERM_RULES,
  VARIABLE_CATALOG,
  createVariable,
  evidenceExcerpt,
  classifyAssertionContext,
  extractClinicalVariables,
  inferAge,
  textFields
};
