const { FieldValue } = require("firebase-admin/firestore");
const { ANALYTICS_COLLECTIONS, CLINICAL_ANALYTICS_SCHEMA_VERSION, CLINICAL_EXTRACTOR_VERSION, CLINICAL_PATTERN_ENGINE_VERSION, CLINICAL_PROBABILITY_ENGINE_VERSION } = require("./config");
const { analyticsPatientId, globalVariable } = require("./deidentification");
const { calculateEmpiricalProbability } = require("./probabilityEngine");
const { listClinicalEvidence } = require("./evidenceRegistry");

function compactKey(value) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 450); }

async function persistClinicalAnalysis({ db, patientId, variables, patterns, relationships, runId, actorUid = null }) {
  const analyticsId = analyticsPatientId(patientId);
  const runRef = db.collection(ANALYTICS_COLLECTIONS.runs).doc(compactKey(runId));
  const runSnap = await runRef.get();
  if (runSnap.exists) return { persisted: false, duplicate: true, analyticsPatientId: analyticsId };
  await runRef.create({ runId, analyticsPatientId: analyticsId, scope: "patient", createdAt: new Date().toISOString(), schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, extractorVersion: CLINICAL_EXTRACTOR_VERSION, patternEngineVersion: CLINICAL_PATTERN_ENGINE_VERSION, probabilityEngineVersion: CLINICAL_PROBABILITY_ENGINE_VERSION, actorAnalyticsId: actorUid ? analyticsPatientId(actorUid) : null });
  const batch = db.batch();
  variables.forEach((variable) => {
    const value = globalVariable(variable);
    const ref = db.collection(ANALYTICS_COLLECTIONS.variables).doc(compactKey(variable.variableId));
    batch.set(ref, { variableId: variable.variableId, canonicalName: variable.canonicalName, domain: variable.domain, datatype: variable.datatype, statisticalType: variable.statisticalType, unit: variable.unit, observations: FieldValue.increment(1), lastObservedAt: variable.observedAt || null, firstObservedAt: variable.observedAt || null, schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, extractorVersion: CLINICAL_EXTRACTOR_VERSION, updatedAt: new Date().toISOString() }, { merge: true });
    batch.set(ref.collection("patients").doc(analyticsId), { analyticsPatientId: analyticsId, lastObservedAt: variable.observedAt || null, value, sourceType: "cognicion_empirical" }, { merge: true });
  });
  patterns.forEach((pattern) => {
    const ref = db.collection(ANALYTICS_COLLECTIONS.patterns).doc(compactKey(pattern.variables.join("__")));
    batch.set(ref, { patternId: pattern.variables.join("__"), scope: "platform", patternType: pattern.patternType, variables: pattern.variables, supportCount: FieldValue.increment(1), lastObservedAt: pattern.lastObservedAt, firstObservedAt: pattern.firstObservedAt, sourceType: "cognicion_empirical", algorithmVersion: pattern.algorithmVersion, schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, updatedAt: new Date().toISOString() }, { merge: true });
  });
  relationships.forEach((relationship) => {
    const ref = db.collection(ANALYTICS_COLLECTIONS.relationships).doc(compactKey(relationship.relationshipId));
    batch.set(ref, { relationshipId: relationship.relationshipId, variableA: relationship.condition, variableB: relationship.outcome, relationshipType: relationship.relationshipType, numerator: FieldValue.increment(relationship.numerator), denominator: FieldValue.increment(relationship.denominator), sourceType: "cognicion_empirical", updatedAt: new Date().toISOString(), schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION }, { merge: true });
  });
  await batch.commit();
  await Promise.all(relationships.map(async (relationship) => {
    const probability = calculateEmpiricalProbability({ numerator: relationship.numerator, denominator: relationship.denominator, cohort: { condition: relationship.condition, outcome: relationship.outcome }, period: null });
    await db.collection(ANALYTICS_COLLECTIONS.probabilities).doc(compactKey(relationship.relationshipId)).set({ event: relationship.outcome, condition: relationship.condition, ...probability, version: CLINICAL_PROBABILITY_ENGINE_VERSION, schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, updatedAt: new Date().toISOString() }, { merge: true });
  }));
  await Promise.all(listClinicalEvidence().map((evidence) => db.collection(ANALYTICS_COLLECTIONS.evidence).doc(evidence.evidenceId).set({ ...evidence, addedAt: evidence.addedAt || new Date().toISOString() }, { merge: true })));
  return { persisted: true, duplicate: false, analyticsPatientId: analyticsId };
}

async function readClinicalKnowledge({ db, limit = 100 }) {
  const read = async (collectionName) => (await db.collection(collectionName).limit(limit).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const [variables, patterns, relationships, probabilities, evidence] = await Promise.all(Object.values(ANALYTICS_COLLECTIONS).slice(0, 4).map(read).concat([read(ANALYTICS_COLLECTIONS.evidence)]));
  return { variables, patterns, relationships, probabilities, evidence, versions: { schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION, extractorVersion: CLINICAL_EXTRACTOR_VERSION, patternEngineVersion: CLINICAL_PATTERN_ENGINE_VERSION, probabilityEngineVersion: CLINICAL_PROBABILITY_ENGINE_VERSION } };
}

module.exports = { persistClinicalAnalysis, readClinicalKnowledge };
