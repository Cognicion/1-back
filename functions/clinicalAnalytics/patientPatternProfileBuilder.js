const crypto = require("crypto");
const { analyzePatientTimeline } = require("./timelineAnalyzer");
const { buildObservationalRelationships, detectPatientPatterns } = require("./patternAnalyzer");
const { normalizeClinicalTime } = require("./patientTemporalNormalizer");
const { inferBssObservations } = require("./suicideIdeationBeckInferenceService");
const { buildPatientStateVectors } = require("./patientTrajectory");
const {
  BSS_CONFIG,
  BSS_SCORING_SCHEMA_VERSION,
  PATIENT_PATTERN_ENGINE_VERSION,
  PATIENT_PATTERN_PROFILE_SCHEMA_VERSION,
  PATIENT_PATTERN_PROMPT_VERSION,
  PATIENT_PATTERN_SEMANTIC_EXTRACTOR_VERSION,
  PATTERN_CATALOG
} = require("./patientPatternConfig");
const { CLINICAL_EXTRACTOR_VERSION } = require("./config");

const SOURCE_TYPES = Object.freeze({
  notasMedicas: "note",
  notas: "note",
  notasClinicas: "note",
  notasRapidas: "note",
  notasFlotantes: "note",
  documentosImportados: "note",
  historiaClinica: "history",
  escalasAplicadas: "scale",
  resultadosEscalas: "scale",
  interconsultas: "interview",
  laboratorios: "laboratory",
  estudios: "laboratory",
  tratamientos: "treatment",
  indicaciones: "treatment",
  recetas: "treatment"
});

function stableId(prefix, parts = []) {
  const digest = crypto.createHash("sha256").update(parts.map((item) => String(item ?? "")).join("|")).digest("hex").slice(0, 32);
  return `${prefix}-${digest}`;
}

function sourceType(recordType = "") {
  return SOURCE_TYPES[recordType] || "other";
}

function dateValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const candidate = typeof value?.toDate === "function"
    ? value.toDate()
    : typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : value;
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function effectiveTime(item = {}) {
  return item.estimatedClinicalTime || item.timestamp || item.sourceDate || item.observedAt || item.generatedAt || "";
}

function mergeById(...groups) {
  const values = new Map();
  groups.flat().filter(Boolean).forEach((item) => {
    const id = item.id || item.evidenceId || item.observationId || item.instrumentResultId;
    if (id) values.set(id, { ...(values.get(id) || {}), ...item });
  });
  return [...values.values()];
}

function mergeReviewedResults(fresh = [], stored = []) {
  const values = new Map(stored.filter(Boolean).map((item) => [item.id, item]));
  fresh.filter(Boolean).forEach((item) => {
    const previous = values.get(item.id);
    const hasClinicianDecision = previous?.clinicianReviewed === true
      || previous?.reviewStatus === "corrected"
      || Number(previous?.audit?.clinicianCorrections) > 0;
    values.set(item.id, hasClinicianDecision ? { ...item, ...previous } : { ...(previous || {}), ...item });
  });
  return [...values.values()];
}

function markSuperseded(items = [], { currentVersion, versionOf, groupOf }) {
  const groups = new Map();
  items.forEach((item) => {
    const key = groupOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return items.map((item) => {
    const group = groups.get(groupOf(item)) || [];
    const hasCurrent = group.some((candidate) => versionOf(candidate) === currentVersion);
    return {
      ...item,
      superseded: item.superseded === true || (hasCurrent && versionOf(item) !== currentVersion)
    };
  });
}

function clinicalTimeMetadata(variable = {}) {
  const excerpt = variable.provenance?.excerpt || "";
  return normalizeClinicalTime(excerpt, variable.observedAt);
}

function buildPatternEvidence(patientId, variable = {}) {
  const provenance = variable.provenance || {};
  const temporal = clinicalTimeMetadata(variable);
  const sourceDocumentId = provenance.sourceDocumentId
    || (provenance.sourceRecordId && provenance.sourceRecordType ? `${provenance.sourceRecordType}/${provenance.sourceRecordId}` : null);
  const excerpt = String(provenance.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 500);
  const id = stableId("evidence", [
    patientId,
    variable.variableId,
    sourceDocumentId,
    provenance.sourceField,
    excerpt,
    variable.value,
    variable.observedAt
  ]);
  return {
    id,
    evidenceId: id,
    variableId: variable.variableId,
    sourceType: sourceType(provenance.sourceRecordType),
    sourceId: provenance.sourceRecordId || null,
    sourceDocumentId,
    sourceRecordType: provenance.sourceRecordType || null,
    sourceField: provenance.sourceField || null,
    sourceDate: variable.observedAt || null,
    documentDate: temporal.documentDate,
    estimatedClinicalTime: temporal.estimatedClinicalTime,
    temporalPrecision: temporal.temporalPrecision,
    clinicalTimeWindow: temporal.clinicalTimeWindow,
    excerpt,
    temporalRelation: temporal.clinicalTimeWindow === "historical" ? "historical" : (temporal.clinicalTimeWindow === "current" ? "current" : "recent"),
    polarity: variable.value === false ? "negative" : provenance.polarity || "positive",
    confidence: Number(variable.confidence) || 0,
    ruleApplied: provenance.ruleApplied || "structured_field_extraction",
    extractorVersion: provenance.extractorVersion || CLINICAL_EXTRACTOR_VERSION,
    generatedAt: provenance.extractedAt || new Date().toISOString()
  };
}

function observationStatus(evidence = {}) {
  if (evidence.polarity === "negative") return "absent";
  if (evidence.polarity === "uncertain") return "possible";
  if (evidence.clinicalTimeWindow === "historical") return "historical";
  return evidence.confidence < 0.6 ? "possible" : "present";
}

function buildPatternObservation(patientId, patternKey, variable, evidence) {
  const timestamp = evidence.estimatedClinicalTime || evidence.documentDate || variable.observedAt || evidence.generatedAt;
  const id = stableId("observation", [patientId, patternKey, evidence.id, PATIENT_PATTERN_ENGINE_VERSION]);
  return {
    id,
    observationId: id,
    patientId,
    patternKey,
    timestamp,
    documentDate: evidence.documentDate,
    estimatedClinicalTime: evidence.estimatedClinicalTime,
    temporalPrecision: evidence.temporalPrecision,
    clinicalTimeWindow: evidence.clinicalTimeWindow,
    value: variable.value === true ? true : variable.value === false ? false : null,
    normalizedValue: variable.value === true ? 1 : variable.value === false ? 0 : null,
    status: observationStatus(evidence),
    confidence: evidence.confidence,
    sourceDocumentIds: evidence.sourceDocumentId ? [evidence.sourceDocumentId] : [],
    evidenceIds: [evidence.id],
    instrumentResultId: null,
    coverage: 1,
    temporalContext: evidence.temporalRelation,
    generatedAt: evidence.generatedAt,
    algorithmVersion: PATIENT_PATTERN_ENGINE_VERSION,
    clinicianReviewed: false,
    clinicianCorrections: []
  };
}

function bssEvidence(patientId, observation) {
  const source = observation.sourceDocuments?.[0] || {};
  const temporal = normalizeClinicalTime("", observation.timestamp);
  const id = stableId("evidence", [patientId, observation.id, "bss"]);
  return {
    id,
    evidenceId: id,
    variableId: "suicidal_ideation",
    sourceType: source.sourceType || "scale",
    sourceId: source.sourceId || null,
    sourceDocumentId: observation.sourceDocumentIds?.[0] || null,
    sourceRecordType: "scale",
    sourceField: "itemResults",
    sourceDate: observation.timestamp,
    documentDate: observation.timestamp,
    estimatedClinicalTime: observation.timestamp,
    temporalPrecision: "day",
    clinicalTimeWindow: temporal.clinicalTimeWindow,
    excerpt: "",
    temporalRelation: temporal.clinicalTimeWindow === "historical" ? "historical" : "recent",
    polarity: observation.scoreStatus === "complete" && observation.rawScore === 0 ? "negative" : "positive",
    confidence: observation.itemResults?.length
      ? Math.min(...observation.itemResults.map((item) => Number(item.confidence) || 0))
      : 0,
    ruleApplied: "explicit_bss_item_scoring",
    extractorVersion: PATIENT_PATTERN_SEMANTIC_EXTRACTOR_VERSION,
    generatedAt: observation.audit?.generatedAt || new Date().toISOString()
  };
}

function bssPatternObservation(patientId, instrument, evidence) {
  const complete = instrument.scoreStatus === "complete";
  const positive = complete ? instrument.rawScore > 0 : instrument.partialSum > 0;
  const id = stableId("observation", [patientId, "suicidal_ideation", instrument.id, PATIENT_PATTERN_ENGINE_VERSION]);
  return {
    id,
    observationId: id,
    patientId,
    patternKey: "suicidal_ideation",
    timestamp: instrument.timestamp,
    documentDate: instrument.timestamp,
    estimatedClinicalTime: instrument.timestamp,
    temporalPrecision: "day",
    clinicalTimeWindow: evidence.clinicalTimeWindow,
    value: complete ? positive : null,
    normalizedValue: complete ? (positive ? 1 : 0) : null,
    status: complete ? (positive ? (evidence.clinicalTimeWindow === "historical" ? "historical" : "present") : "absent") : "possible",
    confidence: evidence.confidence,
    sourceDocumentIds: instrument.sourceDocumentIds || [],
    evidenceIds: [evidence.id],
    instrumentResultId: instrument.id,
    coverage: instrument.coverage,
    temporalContext: instrument.temporalContext,
    generatedAt: instrument.audit?.generatedAt || new Date().toISOString(),
    algorithmVersion: PATIENT_PATTERN_ENGINE_VERSION,
    clinicianReviewed: instrument.clinicianReviewed === true,
    clinicianCorrections: []
  };
}

function latestGroup(observations = []) {
  const sorted = [...observations].sort((a, b) => String(effectiveTime(a)).localeCompare(String(effectiveTime(b))));
  const latest = sorted.at(-1);
  if (!latest) return [];
  const day = String(effectiveTime(latest)).slice(0, 10);
  return sorted.filter((item) => String(effectiveTime(item)).slice(0, 10) === day);
}

function deriveCurrentState(patternKey, observations = []) {
  const availableObservations = observations.filter((item) => item.sourceAvailable !== false && item.superseded !== true);
  const group = latestGroup(availableObservations);
  if (!group.length) return {
    patternKey,
    value: null,
    sourceObservationId: null,
    effectiveAt: null,
    confidence: 0,
    status: "insufficient_data",
    stale: observations.length > 0
  };
  const statuses = new Set(group.map((item) => item.status));
  const contradictory = statuses.has("present") && statuses.has("absent");
  const source = [...group].sort((a, b) => Number(b.confidence) - Number(a.confidence))[0];
  return {
    patternKey,
    value: contradictory ? null : source.value,
    sourceObservationId: source.id,
    effectiveAt: effectiveTime(source),
    confidence: contradictory ? Math.min(...group.map((item) => Number(item.confidence) || 0)) : Number(source.confidence) || 0,
    status: contradictory ? "contradictory" : source.status,
    stale: false
  };
}

function patternFromSeries(definition, observations, evidence, instruments) {
  const currentState = deriveCurrentState(definition.key, observations);
  const linkedEvidenceIds = new Set(observations.flatMap((item) => item.evidenceIds || []));
  const linkedEvidence = evidence.filter((item) => linkedEvidenceIds.has(item.id));
  const instrumentIds = observations.map((item) => item.instrumentResultId).filter(Boolean);
  return {
    id: `pattern-${definition.key}`,
    patternId: `pattern-${definition.key}`,
    key: definition.key,
    label: definition.label,
    category: definition.category,
    status: currentState.status,
    value: currentState.value,
    confidence: currentState.confidence,
    evidence: linkedEvidence,
    evidenceIds: linkedEvidence.map((item) => item.id),
    observations,
    observationIds: observations.map((item) => item.id),
    currentState,
    temporalState: {
      observationCount: observations.length,
      firstObservedAt: observations.length ? effectiveTime(observations[0]) : null,
      lastObservedAt: observations.length ? effectiveTime(observations.at(-1)) : null,
      latestObservationId: observations.at(-1)?.id || null
    },
    derivedFrom: definition.variableIds,
    instrumentIds: [...new Set(instrumentIds)],
    instruments: instruments.filter((item) => instrumentIds.includes(item.id)),
    lastUpdated: currentState.effectiveAt || null
  };
}

function compactClinicalVariable(variable, index) {
  return {
    id: stableId("variable", [variable.variableId, variable.observedAt, variable.provenance?.sourceDocumentId, variable.provenance?.sourceField, index]),
    variableId: variable.variableId,
    canonicalName: variable.canonicalName,
    domain: variable.domain,
    datatype: variable.datatype,
    statisticalType: variable.statisticalType,
    unit: variable.unit,
    observedAt: variable.observedAt,
    value: variable.value,
    displayValue: variable.displayValue,
    confidence: variable.confidence,
    provenance: {
      sourceType: variable.provenance?.sourceType || "patient_record",
      sourceModule: variable.provenance?.sourceModule || "clinicalAnalytics.variableExtractor",
      sourceField: variable.provenance?.sourceField || null,
      sourceRecordType: variable.provenance?.sourceRecordType || null,
      sourceRecordId: variable.provenance?.sourceRecordId || null,
      sourceRoot: variable.provenance?.sourceRoot || null,
      sourceDocumentId: variable.provenance?.sourceDocumentId || null,
      observedAt: variable.observedAt,
      extractedAt: variable.provenance?.extractedAt || null,
      extractorVersion: variable.provenance?.extractorVersion || CLINICAL_EXTRACTOR_VERSION
    }
  };
}

function sourceDocuments(context = {}) {
  return Object.entries(context.records || {}).flatMap(([recordType, records]) => (records || []).map((record) => ({
    id: `${record._sourceRoot || "usuarios"}/${recordType}/${record.id}`,
    sourceDocumentId: `${record._sourceRoot || "usuarios"}/${recordType}/${record.id}`,
    sourceRoot: record._sourceRoot || "usuarios",
    sourceType: sourceType(recordType),
    sourceRecordType: recordType,
    sourceId: record.id,
    sourceDate: [record.fecha, record.fechaAplicacion, record.fechaInicio, record.observedAt, record.createdAt, record.updatedAt]
      .map(dateValue).find(Boolean)?.toISOString() || null,
    label: String(record.tipoNota || record.nombreEscala || record.nombre || recordType).slice(0, 120)
  })));
}

function patternFeature(pattern) {
  const value = pattern.currentState.value === true ? 1 : pattern.currentState.value === false ? 0 : null;
  const availableObservations = pattern.observations.filter((item) => item.sourceAvailable !== false && item.superseded !== true);
  return {
    id: stableId("feature", [pattern.key, pattern.currentState.sourceObservationId, PATIENT_PATTERN_ENGINE_VERSION]),
    feature: PATTERN_CATALOG[pattern.key].quantitativeFeature,
    patternKey: pattern.key,
    rawValue: value,
    normalizedValue: value,
    coverage: availableObservations.length ? 1 : 0,
    confidence: pattern.currentState.confidence,
    sourceObservationId: pattern.currentState.sourceObservationId,
    timestamp: pattern.currentState.effectiveAt,
    sourceInstrument: null,
    meaning: "Estado semántico normalizado; no representa una probabilidad clínica."
  };
}

function bssFeatures(instruments = []) {
  return instruments.filter((item) => item.scoreStatus === "complete" && item.superseded !== true && item.sourceAvailable !== false).map((item) => ({
    id: stableId("feature", ["suicidalIdeationBSS", item.id, BSS_SCORING_SCHEMA_VERSION]),
    feature: "suicidalIdeationBSS",
    rawValue: item.rawScore,
    normalizedValue: item.normalizedScore,
    coverage: item.coverage,
    confidence: item.itemResults.length ? Math.min(...item.itemResults.map((entry) => Number(entry.confidence) || 0)) : 0,
    sourceObservationId: item.id,
    timestamp: item.timestamp,
    sourceInstrument: "BSS",
    meaning: "Puntaje BSS normalizado (BSS/38); no es una probabilidad de suicidio."
  }));
}

function snapshotsFrom(patterns, instruments) {
  const timestamps = [...new Set([
    ...patterns.flatMap((pattern) => pattern.observations.filter((item) => item.superseded !== true && item.sourceAvailable !== false).map((item) => item.timestamp)),
    ...instruments.filter((item) => item.superseded !== true && item.sourceAvailable !== false).map((item) => item.timestamp)
  ].filter(Boolean))].sort();
  return timestamps.map((timestamp) => {
    const day = timestamp.slice(0, 10);
    const featureValues = Object.fromEntries(Object.values(PATTERN_CATALOG).map((definition) => [definition.quantitativeFeature, null]));
    const sourceObservationIds = [];
    patterns.forEach((pattern) => {
      const observation = pattern.observations.filter((item) => item.superseded !== true && item.sourceAvailable !== false && String(item.timestamp).slice(0, 10) === day).at(-1);
      if (!observation) return;
      featureValues[PATTERN_CATALOG[pattern.key].quantitativeFeature] = observation.normalizedValue ?? null;
      sourceObservationIds.push(observation.id);
    });
    const bss = instruments.filter((item) => item.superseded !== true && item.sourceAvailable !== false && item.scoreStatus === "complete" && String(item.timestamp).slice(0, 10) === day).at(-1);
    featureValues.suicidalIdeationBSS = bss?.normalizedScore ?? null;
    if (bss) sourceObservationIds.push(bss.id);
    return {
      id: stableId("snapshot", [day, ...sourceObservationIds.sort()]),
      timestamp,
      featureValues,
      sourceObservationIds
    };
  });
}

function relationshipsFrom(timeline = []) {
  return buildObservationalRelationships(timeline).map((item) => ({
    id: `relationship-${item.relationshipId}`,
    sourcePattern: item.condition,
    targetPattern: item.outcome,
    relationship: "temporal_precedence",
    strength: item.denominator ? item.numerator / item.denominator : null,
    observations: item.numerator,
    eligibleObservations: item.denominator,
    confidence: null,
    sourceType: "cognicion_empirical",
    causalInterpretationAllowed: false,
    algorithmVersion: item.algorithmVersion
  }));
}

function profileAudit(sourceIds, generatedAt) {
  return {
    algorithmVersion: PATIENT_PATTERN_ENGINE_VERSION,
    promptVersion: PATIENT_PATTERN_PROMPT_VERSION,
    semanticExtractorVersion: PATIENT_PATTERN_SEMANTIC_EXTRACTOR_VERSION,
    scoringSchemaVersion: BSS_SCORING_SCHEMA_VERSION,
    schemaVersion: PATIENT_PATTERN_PROFILE_SCHEMA_VERSION,
    generatedAt,
    sourceDocumentIds: sourceIds,
    clinicianReviewed: false,
    clinicianCorrections: 0
  };
}

function buildPatientPatternProfile({ patientId, context, variables = [], existingProfile = null, affectedPatternKeys = null }) {
  const generatedAt = new Date().toISOString();
  const requestedPatternKeys = existingProfile && Array.isArray(affectedPatternKeys) && affectedPatternKeys.length
    ? new Set(affectedPatternKeys.filter((key) => PATTERN_CATALOG[key]))
    : new Set(Object.keys(PATTERN_CATALOG));
  const timeline = analyzePatientTimeline(variables);
  const documents = sourceDocuments(context).map((item) => ({ ...item, sourceAvailable: true }));
  const activeSourceIds = new Set(documents.map((item) => item.sourceDocumentId));
  const existingEvidence = existingProfile?.evidence || [];
  const existingObservations = existingProfile?.patternObservations || existingProfile?.patterns?.flatMap((pattern) => pattern.observations || []) || [];
  const existingInstruments = existingProfile?.instruments || [];
  const evidence = [];
  const observations = [];

  Object.values(PATTERN_CATALOG).forEach((definition) => {
    if (!requestedPatternKeys.has(definition.key)) return;
    variables.filter((variable) => definition.variableIds.includes(variable.variableId)).forEach((variable) => {
      const itemEvidence = buildPatternEvidence(patientId, variable);
      evidence.push(itemEvidence);
      observations.push(buildPatternObservation(patientId, definition.key, variable, itemEvidence));
    });
  });

  const refreshBss = requestedPatternKeys.has("suicidal_ideation");
  const instruments = markSuperseded(mergeReviewedResults(refreshBss ? inferBssObservations(context) : [], existingInstruments)
    .map((item) => ({
      ...item,
      sourceAvailable: !(item.sourceDocumentIds || []).length || (item.sourceDocumentIds || []).some((id) => activeSourceIds.has(id))
    })), {
    currentVersion: BSS_SCORING_SCHEMA_VERSION,
    versionOf: (item) => item.audit?.scoringSchemaVersion,
    groupOf: (item) => `${(item.sourceDocumentIds || []).join(",")}|${item.timestamp}`
  })
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  if (refreshBss) {
    instruments.forEach((instrument) => {
      const itemEvidence = bssEvidence(patientId, instrument);
      evidence.push(itemEvidence);
      observations.push({ ...bssPatternObservation(patientId, instrument, itemEvidence), superseded: instrument.superseded === true });
    });
  }

  const mergedEvidence = mergeById(existingEvidence, evidence)
    .map((item) => ({
      ...item,
      sourceAvailable: !item.sourceDocumentId || activeSourceIds.has(item.sourceDocumentId)
    }))
    .sort((a, b) => String(effectiveTime(a)).localeCompare(String(effectiveTime(b))));
  const mergedObservations = markSuperseded(mergeReviewedResults(observations, existingObservations)
    .map((item) => ({
      ...item,
      sourceAvailable: !(item.sourceDocumentIds || []).length || (item.sourceDocumentIds || []).some((id) => activeSourceIds.has(id))
    })), {
    currentVersion: PATIENT_PATTERN_ENGINE_VERSION,
    versionOf: (item) => item.algorithmVersion,
    groupOf: (item) => `${item.patternKey}|${(item.sourceDocumentIds || []).join(",")}|${item.timestamp}`
  })
    .sort((a, b) => String(effectiveTime(a)).localeCompare(String(effectiveTime(b))));
  const patterns = Object.values(PATTERN_CATALOG).map((definition) => patternFromSeries(
    definition,
    mergedObservations.filter((item) => item.patternKey === definition.key),
    mergedEvidence,
    instruments
  ));
  const clinicalVariables = variables.map(compactClinicalVariable);
  const quantitativeFeatures = [...patterns.map(patternFeature), ...bssFeatures(instruments)];
  const availableObservationIds = new Set(mergedObservations.filter((item) => item.sourceAvailable !== false && item.superseded !== true).map((item) => item.id));
  const snapshots = mergeById(existingProfile?.snapshots || [], snapshotsFrom(patterns, instruments))
    .map((item) => ({
      ...item,
      sourceAvailable: !(item.sourceObservationIds || []).length || (item.sourceObservationIds || []).some((id) => availableObservationIds.has(id))
    }))
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const sourceIds = documents.map((item) => item.sourceDocumentId);

  return {
    patientId,
    generatedAt,
    updatedAt: generatedAt,
    analysisState: "current",
    affectedPatternKeys: [...requestedPatternKeys],
    sourceDocuments: documents,
    clinicalVariables,
    patterns,
    patternObservations: mergedObservations,
    quantitativeFeatures,
    instruments,
    temporalPatterns: patterns.map((pattern) => ({
      patternKey: pattern.key,
      patientId,
      observations: pattern.observations,
      latestObservationId: pattern.temporalState.latestObservationId,
      firstObservedAt: pattern.temporalState.firstObservedAt,
      lastObservedAt: pattern.temporalState.lastObservedAt
    })),
    derivedTemporalPatterns: patterns.map((pattern) => ({
      patternKey: pattern.key,
      type: "undetermined",
      confidence: 0,
      methodVersion: "not_enabled_v1",
      featureFlag: false
    })),
    relationships: relationshipsFrom(timeline),
    discoveryPatterns: detectPatientPatterns(timeline),
    stateVectors: buildPatientStateVectors({ patientId, patterns, instruments, snapshots }),
    snapshots,
    dataQuality: {
      sourceDocumentCount: documents.length,
      extractedVariableCount: clinicalVariables.length,
      evidenceCount: mergedEvidence.length,
      observationCount: mergedObservations.length,
      patternsWithEvidence: patterns.filter((pattern) => pattern.observations.some((item) => item.sourceAvailable !== false && item.superseded !== true)).length,
      incompleteInstrumentCount: instruments.filter((item) => item.sourceAvailable !== false && item.superseded !== true && item.scoreStatus !== "complete").length,
      contradictions: patterns.filter((pattern) => pattern.status === "contradictory").length,
      unknownIsNotAbsence: true
    },
    evidence: mergedEvidence,
    audit: profileAudit(sourceIds, generatedAt),
    trajectoryCapabilities: {
      patientModel: "partially_observed_time_dependent_vector",
      descriptiveDeltaPrepared: true,
      velocityFeatureFlag: false,
      crossPatientTrajectoryComparisonFeatureFlag: false,
      automaticTrajectoryLabelsFeatureFlag: false
    },
    notice: "Análisis de apoyo clínico. No sustituye el juicio profesional. Un puntaje o variable normalizada no equivale a una probabilidad de desenlace."
  };
}

module.exports = {
  buildPatientPatternProfile,
  buildPatternEvidence,
  deriveCurrentState,
  mergeById,
  mergeReviewedResults,
  markSuperseded,
  snapshotsFrom,
  stableId
};
