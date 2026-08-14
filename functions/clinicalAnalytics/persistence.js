const { FieldValue } = require("firebase-admin/firestore");
const {
  ANALYTICS_COLLECTIONS,
  CLINICAL_ANALYTICS_SCHEMA_VERSION,
  CLINICAL_EVIDENCE_REGISTRY_VERSION,
  CLINICAL_EXTRACTOR_VERSION,
  CLINICAL_FEATURE_PROFILE_VERSION,
  CLINICAL_MATRIX_ENGINE_VERSION,
  CLINICAL_PATTERN_ENGINE_VERSION,
  CLINICAL_PROBABILITY_ENGINE_VERSION
} = require("./config");
const { analyticsPatientId, globalVariable } = require("./deidentification");
const { calculateEmpiricalProbability } = require("./probabilityEngine");
const { listClinicalEvidence } = require("./evidenceRegistry");
const { buildPatientFeatureProfile } = require("./patientFeatureProfile");
const { persistPatientFeatureProfile, readClinicalMatrices } = require("./matrixPersistence");

function compactKey(value) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 450); }
function monthBucket(value) { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7); }

async function commitOperations(db, operations, batchSize = 400) {
  for (let start = 0; start < operations.length; start += batchSize) {
    const batch = db.batch();
    operations.slice(start, start + batchSize).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  for (let start = 0; start < items.length; start += concurrency) {
    await Promise.all(items.slice(start, start + concurrency).map(mapper));
  }
}

async function persistClinicalAnalysis({ db, patientId, variables, patterns, relationships, runId, actorUid = null, context = null, timeline = [] }) {
  const analyticsId = analyticsPatientId(patientId);
  const runRef = db.collection(ANALYTICS_COLLECTIONS.runs).doc(compactKey(runId));
  const runSnap = await runRef.get();
  if (runSnap.exists) return { persisted: false, duplicate: true, analyticsPatientId: analyticsId };
  await runRef.create({ runId, analyticsPatientId: analyticsId, scope: "patient", createdAt: new Date().toISOString(), schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, extractorVersion: CLINICAL_EXTRACTOR_VERSION, patternEngineVersion: CLINICAL_PATTERN_ENGINE_VERSION, probabilityEngineVersion: CLINICAL_PROBABILITY_ENGINE_VERSION, actorAnalyticsId: actorUid ? analyticsPatientId(actorUid) : null });
  const operations = [];
  const variablesById = new Map();
  variables.forEach((variable) => {
    if (!variablesById.has(variable.variableId)) variablesById.set(variable.variableId, []);
    variablesById.get(variable.variableId).push(variable);
  });
  variablesById.forEach((group) => {
    const variable = [...group].sort((a, b) => String(a.observedAt || "").localeCompare(String(b.observedAt || ""))).at(-1);
    const value = globalVariable(variable);
    const ref = db.collection(ANALYTICS_COLLECTIONS.variables).doc(compactKey(variable.variableId));
    operations.push((batch) => batch.set(ref, { variableId: variable.variableId, canonicalName: variable.canonicalName, domain: variable.domain, datatype: variable.datatype, statisticalType: variable.statisticalType, unit: variable.unit, observations: FieldValue.increment(group.length), lastObservedAt: value.observedAt, firstObservedAt: value.observedAt, schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, extractorVersion: CLINICAL_EXTRACTOR_VERSION, updatedAt: new Date().toISOString() }, { merge: true }));
    operations.push((batch) => batch.set(ref.collection("patients").doc(analyticsId), { analyticsPatientId: analyticsId, lastObservedAt: value.observedAt, observationCount: group.length, value, sourceType: "cognicion_empirical" }, { merge: true }));
  });
  patterns.forEach((pattern) => {
    const patternId = `${pattern.patternType}__${pattern.variables.join("__")}`;
    const ref = db.collection(ANALYTICS_COLLECTIONS.patterns).doc(compactKey(patternId));
    operations.push((batch) => batch.set(ref, { patternId, scope: "platform", patternType: pattern.patternType, variables: pattern.variables, supportCount: FieldValue.increment(1), lastObservedAt: monthBucket(pattern.lastObservedAt), firstObservedAt: monthBucket(pattern.firstObservedAt), sourceType: "cognicion_empirical", algorithmVersion: pattern.algorithmVersion, schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, updatedAt: new Date().toISOString() }, { merge: true }));
  });
  relationships.forEach((relationship) => {
    const ref = db.collection(ANALYTICS_COLLECTIONS.relationships).doc(compactKey(relationship.relationshipId));
    operations.push((batch) => batch.set(ref, { relationshipId: relationship.relationshipId, variableA: relationship.condition, variableB: relationship.outcome, relationshipType: relationship.relationshipType, numerator: FieldValue.increment(relationship.numerator), denominator: FieldValue.increment(relationship.denominator), sourceType: "cognicion_empirical", updatedAt: new Date().toISOString(), schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION }, { merge: true }));
  });
  await commitOperations(db, operations);
  await mapWithConcurrency(relationships, 20, async (relationship) => {
    const relationshipSnapshot = await db.collection(ANALYTICS_COLLECTIONS.relationships).doc(compactKey(relationship.relationshipId)).get();
    const accumulated = relationshipSnapshot.data() || {};
    const probability = calculateEmpiricalProbability({ numerator: Number(accumulated.numerator) || 0, denominator: Number(accumulated.denominator) || 0, cohort: { condition: relationship.condition, outcome: relationship.outcome }, period: null });
    await db.collection(ANALYTICS_COLLECTIONS.probabilities).doc(compactKey(relationship.relationshipId)).set({ event: relationship.outcome, condition: relationship.condition, ...probability, version: CLINICAL_PROBABILITY_ENGINE_VERSION, schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, updatedAt: new Date().toISOString() }, { merge: true });
  });
  const featureProfile = buildPatientFeatureProfile({ variables, timeline, context: context || {} });
  await persistPatientFeatureProfile({ db, patientId, profile: featureProfile });
  await Promise.all(listClinicalEvidence().map((evidence) => db.collection(ANALYTICS_COLLECTIONS.evidence).doc(evidence.evidenceId).set({ ...evidence, addedAt: evidence.addedAt || new Date().toISOString() }, { merge: true })));
  return { persisted: true, duplicate: false, analyticsPatientId: analyticsId, featureProfile: { featureCount: featureProfile.featureCount, directIdentifiersIncluded: false, rawClinicalTextIncluded: false } };
}

async function readClinicalKnowledge({ db, limit = 100 }) {
  const read = async (collectionName) => (await db.collection(collectionName).limit(limit).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const [variables, patterns, relationships, probabilities, evidence, matrixKnowledge] = await Promise.all([
    read(ANALYTICS_COLLECTIONS.variables),
    read(ANALYTICS_COLLECTIONS.patterns),
    read(ANALYTICS_COLLECTIONS.relationships),
    read(ANALYTICS_COLLECTIONS.probabilities),
    read(ANALYTICS_COLLECTIONS.evidence),
    readClinicalMatrices({ db, limit })
  ]);
  return { variables, patterns, relationships, probabilities, evidence, ...matrixKnowledge, versions: { schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, extractorVersion: CLINICAL_EXTRACTOR_VERSION, featureProfileVersion: CLINICAL_FEATURE_PROFILE_VERSION, patternEngineVersion: CLINICAL_PATTERN_ENGINE_VERSION, probabilityEngineVersion: CLINICAL_PROBABILITY_ENGINE_VERSION, matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION, evidenceRegistryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION } };
}

module.exports = { persistClinicalAnalysis, readClinicalKnowledge };
