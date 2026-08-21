const crypto = require("crypto");
const { valueToIso } = require("./contextBuilder");
const { normalizeClinicalTime } = require("./patientTemporalNormalizer");
const {
  BSS_CONFIG,
  BSS_SCORING_SCHEMA_VERSION,
  PATIENT_PATTERN_ENGINE_VERSION,
  PATIENT_PATTERN_PROMPT_VERSION,
  PATIENT_PATTERN_SEMANTIC_EXTRACTOR_VERSION
} = require("./patientPatternConfig");

const PARAMETER_LABELS = Object.freeze({
  desireToDie: "Deseo de morir",
  activeSuicidalIdeation: "Ideación suicida activa",
  frequency: "Frecuencia",
  duration: "Duración",
  control: "Control",
  deterrents: "Factores disuasorios",
  plan: "Plan",
  methodAccess: "Acceso al método",
  preparatoryBehavior: "Conducta preparatoria",
  concealment: "Ocultamiento"
});

const PARAMETER_ALIASES = Object.freeze({
  desireToDie: Object.freeze(["desireToDie", "deseoMorir", "deseoDeMorir"]),
  activeSuicidalIdeation: Object.freeze(["activeSuicidalIdeation", "ideacionSuicidaActiva"]),
  frequency: Object.freeze(["frequency", "frecuencia"]),
  duration: Object.freeze(["duration", "duracion", "duración"]),
  control: Object.freeze(["control", "controlIdeacion"]),
  deterrents: Object.freeze(["deterrents", "factoresDisuasorios"]),
  plan: Object.freeze(["plan", "planSuicida"]),
  methodAccess: Object.freeze(["methodAccess", "accesoMetodo", "accesoAlMetodo"]),
  preparatoryBehavior: Object.freeze(["preparatoryBehavior", "conductaPreparatoria"]),
  concealment: Object.freeze(["concealment", "ocultamiento"])
});

function stableId(prefix, parts = []) {
  const digest = crypto.createHash("sha256").update(parts.map((item) => String(item ?? "")).join("|")).digest("hex").slice(0, 32);
  return `${prefix}-${digest}`;
}

function normalized(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBssRecord(record = {}) {
  const descriptor = normalized([
    record.nombreEscala,
    record.nombre,
    record.escala,
    record.instrumento,
    record.codigo,
    record.abreviatura,
    record.test
  ].filter(Boolean).join(" "));
  return /(?:^|\s)(?:bss|bssi|ssi)(?:\s|$)/.test(descriptor)
    || descriptor.includes("escala de ideacion suicida de beck")
    || descriptor.includes("beck scale for suicide ideation")
    || descriptor.includes("beck suicide ideation scale");
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampConfidence(value, fallback = 0.95) {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(0, Math.min(1, number));
}

function itemNumber(item, fallbackKey = null) {
  const value = item && typeof item === "object"
    ? item.itemNumber ?? item.item ?? item.numero ?? item.número ?? item.reactivo ?? item.indice ?? item.id
    : fallbackKey;
  const number = Number(String(value || "").match(/\d+/)?.[0]);
  return Number.isInteger(number) && number >= 1 && number <= BSS_CONFIG.itemCount ? number : null;
}

function itemScore(item) {
  const value = item && typeof item === "object"
    ? item.clinicianValue ?? item.clinicianScore ?? item.score ?? item.puntuacion ?? item.puntuación ?? item.valor ?? item.value ?? item.respuesta
    : item;
  const score = finiteNumber(value);
  return Number.isInteger(score) && score >= BSS_CONFIG.itemMinimum && score <= BSS_CONFIG.itemMaximum ? score : null;
}

function itemCollection(record = {}) {
  const source = record.itemResults || record.resultadosReactivos || record.reactivos || record.items || record.respuestas || record.itemInferences;
  if (Array.isArray(source)) return source.map((item, index) => ({ item, fallbackKey: index + 1 }));
  if (source && typeof source === "object") return Object.entries(source).map(([key, item]) => ({ item, fallbackKey: key }));
  return [];
}

function sourceType(collectionId = "") {
  if (/escala/i.test(collectionId)) return "scale";
  if (/historia/i.test(collectionId)) return "history";
  if (/entrevista|interconsulta/i.test(collectionId)) return "interview";
  if (/laboratorio|estudio/i.test(collectionId)) return "laboratory";
  if (/tratamiento|indicacion|receta/i.test(collectionId)) return "treatment";
  if (/nota/i.test(collectionId)) return "note";
  return "other";
}

function normalizeItem({ entry, record, collectionId, timestamp }) {
  const number = itemNumber(entry.item, entry.fallbackKey);
  const score = itemScore(entry.item);
  if (!number || score === null) return null;
  const item = entry.item && typeof entry.item === "object" ? entry.item : {};
  const excerpt = String(item.evidence || item.evidencia || item.excerpt || item.cita || "").replace(/\s+/g, " ").trim().slice(0, 500);
  const temporal = normalizeClinicalTime(excerpt, timestamp);
  return {
    itemNumber: number,
    value: score,
    status: "evaluated",
    confidence: clampConfidence(item.confidence ?? item.confianza, record.semanticConfidence ?? record.confianza ?? 0.95),
    evidence: excerpt || null,
    sourceType: sourceType(collectionId),
    sourceId: record.id || null,
    sourceDate: timestamp,
    documentDate: temporal.documentDate,
    estimatedClinicalTime: temporal.estimatedClinicalTime,
    temporalPrecision: temporal.temporalPrecision,
    temporalRelation: temporal.clinicalTimeWindow === "historical" ? "historical" : "current",
    ruleApplied: String(item.ruleApplied || item.reglaAplicada || "explicit_bss_item_value"),
    originalInference: item.originalInference ?? null,
    clinicianValue: item.clinicianValue ?? null,
    clinicianReviewed: item.clinicianReviewed === true
  };
}

function normalizeParameters(record = {}) {
  const source = record.normalizedParameters || record.parametrosNormalizados || record.parametros || record.dominiosClinicos || {};
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  return Object.entries(PARAMETER_ALIASES).flatMap(([key, aliases]) => {
    const alias = aliases.find((candidate) => source[candidate] !== undefined && source[candidate] !== null && source[candidate] !== "");
    if (!alias) return [];
    return [{
      key,
      label: PARAMETER_LABELS[key],
      value: source[alias],
      confidence: clampConfidence(source[`${alias}Confidence`], record.semanticConfidence ?? record.confianza ?? 0.9),
      source: "normalized_semantic_extractor"
    }];
  });
}

function reportedScore(record = {}) {
  return finiteNumber(record.rawScore ?? record.puntajeTotal ?? record.puntuacion ?? record.puntuación ?? record.score ?? record.resultado);
}

function buildBssObservation(record = {}, collectionId = "resultadosEscalas") {
  if (!isBssRecord(record)) return null;
  const timestamp = valueToIso(record.fechaAplicacion || record.fecha || record.observedAt || record.createdAt || record.updatedAt) || new Date().toISOString();
  const uniqueItems = new Map();
  itemCollection(record).forEach((entry) => {
    const normalizedItem = normalizeItem({ entry, record, collectionId, timestamp });
    if (normalizedItem) uniqueItems.set(normalizedItem.itemNumber, normalizedItem);
  });
  const itemResults = [...uniqueItems.values()].sort((a, b) => a.itemNumber - b.itemNumber);
  const coveredItems = itemResults.length;
  const coverage = coveredItems / BSS_CONFIG.itemCount;
  const missingItems = Array.from({ length: BSS_CONFIG.itemCount }, (_value, index) => index + 1).filter((number) => !uniqueItems.has(number));
  const partialSum = itemResults.reduce((sum, item) => sum + item.value, 0);
  const complete = coveredItems === BSS_CONFIG.itemCount;
  const explicitScore = reportedScore(record);
  const rawScore = complete ? partialSum : null;
  const sourceDocumentId = record.id ? `${record._sourceRoot || "usuarios"}/${collectionId}/${record.id}` : `${record._sourceRoot || "usuarios"}/${collectionId}/unknown`;
  const id = stableId("bss", [sourceDocumentId, timestamp, BSS_SCORING_SCHEMA_VERSION]);

  return {
    id,
    instrumentId: BSS_CONFIG.instrumentId,
    instrumentName: BSS_CONFIG.name,
    abbreviation: BSS_CONFIG.abbreviation,
    timestamp,
    rawScore,
    reportedRawScore: explicitScore,
    normalizedScore: complete ? rawScore / BSS_CONFIG.maximumScore : null,
    partialSum,
    maximumScore: BSS_CONFIG.maximumScore,
    coverage,
    coveredItems,
    requiredItems: BSS_CONFIG.itemCount,
    missingItems,
    scoreStatus: complete ? "complete" : coveredItems ? "partial" : "not_calculable",
    scoreConsistency: complete && explicitScore !== null ? (explicitScore === rawScore ? "consistent" : "mismatch") : "not_comparable",
    itemResults,
    parameters: normalizeParameters(record),
    sourceDocumentIds: [sourceDocumentId],
    sourceDocuments: [{
      sourceType: sourceType(collectionId),
      sourceId: record.id || null,
      sourceDate: timestamp,
      label: String(record.tipoNota || record.nombreEscala || record.nombre || BSS_CONFIG.name).slice(0, 120)
    }],
    temporalContext: String(record.temporalContext || record.contextoTemporal || "periodo_documentado").slice(0, 120),
    clinicianReviewed: itemResults.length > 0 && itemResults.every((item) => item.clinicianReviewed),
    audit: {
      algorithmVersion: PATIENT_PATTERN_ENGINE_VERSION,
      promptVersion: PATIENT_PATTERN_PROMPT_VERSION,
      semanticExtractorVersion: PATIENT_PATTERN_SEMANTIC_EXTRACTOR_VERSION,
      scoringSchemaVersion: BSS_SCORING_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sourceDocumentIds: [sourceDocumentId],
      clinicianReviewed: itemResults.length > 0 && itemResults.every((item) => item.clinicianReviewed),
      clinicianCorrections: itemResults.filter((item) => item.clinicianValue !== null).length
    }
  };
}

function inferBssObservations(context = {}) {
  return Object.entries(context.records || {})
    .flatMap(([collectionId, records]) => (records || []).map((record) => buildBssObservation(record, collectionId)))
    .filter(Boolean)
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

module.exports = {
  PARAMETER_LABELS,
  buildBssObservation,
  inferBssObservations,
  isBssRecord,
  normalizeParameters,
  stableId
};
