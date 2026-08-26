const crypto = require("crypto");
const {
  PATIENT_PATTERN_PROFILE_COLLECTION,
  PATIENT_PATTERN_PROFILE_DOCUMENT,
  PATIENT_PATTERN_PROFILE_SCHEMA_VERSION
} = require("./patientPatternConfig");
const { buildPatientStateVectors } = require("./patientTrajectory");

const SUBCOLLECTIONS = Object.freeze({
  evidence: "evidence",
  observations: "observations",
  instruments: "instruments",
  sources: "sourceDocuments",
  variables: "clinicalVariables",
  features: "quantitativeFeatures",
  snapshots: "snapshots"
});

function profileRef(db, patientId) {
  return db.doc(`usuarios/${patientId}/${PATIENT_PATTERN_PROFILE_COLLECTION}/${PATIENT_PATTERN_PROFILE_DOCUMENT}`);
}

function fingerprint(profile = {}) {
  const input = JSON.stringify({
    schemaVersion: PATIENT_PATTERN_PROFILE_SCHEMA_VERSION,
    sourceDocuments: (profile.sourceDocuments || []).map((item) => [item.sourceDocumentId, item.sourceDate]).sort(),
    observations: (profile.patternObservations || []).map((item) => [item.id, item.status, item.value, item.confidence]).sort(),
    instruments: (profile.instruments || []).map((item) => [item.id, item.rawScore, item.partialSum, item.coverage, item.clinicianReviewed]).sort(),
    audit: profile.audit ? [profile.audit.algorithmVersion, profile.audit.semanticExtractorVersion, profile.audit.scoringSchemaVersion] : []
  });
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function commitOperations(db, operations, batchSize = 350) {
  for (let start = 0; start < operations.length; start += batchSize) {
    const batch = db.batch();
    operations.slice(start, start + batchSize).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

function without(object, keys = []) {
  return Object.fromEntries(Object.entries(object || {}).filter(([key]) => !keys.includes(key)));
}

function documentMap(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function headerFrom(profile, sourceFingerprint) {
  const audit = without(profile.audit || {}, ["sourceDocumentIds"]);
  return {
    patientId: profile.patientId,
    generatedAt: profile.generatedAt,
    updatedAt: profile.updatedAt,
    analysisState: profile.analysisState,
    affectedPatternKeys: profile.affectedPatternKeys || [],
    patterns: (profile.patterns || []).map((item) => without(item, ["evidence", "observations", "instruments", "evidenceIds", "observationIds", "instrumentIds"])),
    quantitativeFeatureCount: (profile.quantitativeFeatures || []).length,
    temporalPatterns: (profile.temporalPatterns || []).map((item) => without(item, ["observations"])),
    derivedTemporalPatterns: profile.derivedTemporalPatterns || [],
    relationships: (profile.relationships || []).slice(0, 240),
    discoveryPatterns: (profile.discoveryPatterns || []).slice(0, 120),
    dataQuality: profile.dataQuality || {},
    audit: {
      ...audit,
      sourceDocumentCount: (profile.audit?.sourceDocumentIds || []).length,
      sourceDocumentStorage: "sourceDocuments"
    },
    notice: profile.notice || "",
    trajectoryCapabilities: profile.trajectoryCapabilities || {},
    sourceFingerprint,
    profileGeneration: profile.generatedAt,
    schemaVersion: PATIENT_PATTERN_PROFILE_SCHEMA_VERSION,
    storageScope: "protected_patient_record",
    globallyAggregated: false
  };
}

function addSetOperations(ref, collectionName, items, operations) {
  items.forEach((item) => {
    operations.push((batch) => batch.set(ref.collection(collectionName).doc(item.id), item, { merge: true }));
  });
}

async function persistPatientPatternProfile({ db, profile }) {
  const ref = profileRef(db, profile.patientId);
  const sourceFingerprint = fingerprint(profile);
  const current = await ref.get();
  if (current.exists && current.data()?.sourceFingerprint === sourceFingerprint && current.data()?.analysisState === "current") {
    return { persisted: false, duplicate: true, sourceFingerprint };
  }

  const operations = [];
  addSetOperations(ref, SUBCOLLECTIONS.evidence, profile.evidence || [], operations);
  addSetOperations(ref, SUBCOLLECTIONS.observations, profile.patternObservations || [], operations);
  addSetOperations(ref, SUBCOLLECTIONS.instruments, profile.instruments || [], operations);
  addSetOperations(ref, SUBCOLLECTIONS.sources, (profile.sourceDocuments || []).map((item) => ({ ...item, profileGeneration: profile.generatedAt })), operations);
  addSetOperations(ref, SUBCOLLECTIONS.variables, (profile.clinicalVariables || []).map((item) => ({ ...item, profileGeneration: profile.generatedAt })), operations);
  addSetOperations(ref, SUBCOLLECTIONS.features, (profile.quantitativeFeatures || []).map((item) => ({ ...item, profileGeneration: profile.generatedAt })), operations);
  addSetOperations(ref, SUBCOLLECTIONS.snapshots, profile.snapshots || [], operations);
  await commitOperations(db, operations);
  await ref.set(headerFrom(profile, sourceFingerprint), { merge: true });
  return { persisted: true, duplicate: false, sourceFingerprint };
}

async function readDocuments(ref, collectionName) {
  const snapshot = await ref.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadPatientPatternProfile({ db, patientId }) {
  const ref = profileRef(db, patientId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const header = snapshot.data() || {};
  const [allEvidence, allObservations, allInstruments, allSources, allVariables, allFeatures, allSnapshots] = await Promise.all([
    readDocuments(ref, SUBCOLLECTIONS.evidence),
    readDocuments(ref, SUBCOLLECTIONS.observations),
    readDocuments(ref, SUBCOLLECTIONS.instruments),
    readDocuments(ref, SUBCOLLECTIONS.sources),
    readDocuments(ref, SUBCOLLECTIONS.variables),
    readDocuments(ref, SUBCOLLECTIONS.features),
    readDocuments(ref, SUBCOLLECTIONS.snapshots)
  ]);
  const evidence = allEvidence;
  const patternObservations = allObservations
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const instruments = allInstruments
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const sourceDocuments = header.profileGeneration ? allSources.filter((item) => item.profileGeneration === header.profileGeneration) : allSources;
  const clinicalVariables = header.profileGeneration ? allVariables.filter((item) => item.profileGeneration === header.profileGeneration) : allVariables;
  const currentFeatures = header.profileGeneration ? allFeatures.filter((item) => item.profileGeneration === header.profileGeneration) : allFeatures;
  const quantitativeFeatures = currentFeatures.length ? currentFeatures : (header.quantitativeFeatures || []);
  const snapshots = allSnapshots
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const evidenceById = documentMap(evidence);
  const instrumentsById = documentMap(instruments);
  const patterns = (header.patterns || []).map((pattern) => ({
    ...pattern,
    observations: patternObservations.filter((item) => item.patternKey === pattern.key),
    evidence: [...new Set(patternObservations.filter((item) => item.patternKey === pattern.key).flatMap((item) => item.evidenceIds || []))].map((id) => evidenceById.get(id)).filter(Boolean),
    instruments: [...new Set(patternObservations.filter((item) => item.patternKey === pattern.key).map((item) => item.instrumentResultId).filter(Boolean))].map((id) => instrumentsById.get(id)).filter(Boolean)
  }));

  return {
    patientId,
    generatedAt: header.generatedAt,
    updatedAt: header.updatedAt,
    analysisState: header.analysisState,
    affectedPatternKeys: header.affectedPatternKeys || [],
    sourceDocuments,
    clinicalVariables,
    patterns,
    patternObservations,
    quantitativeFeatures,
    instruments,
    temporalPatterns: (header.temporalPatterns || []).map((series) => ({
      ...series,
      observations: patternObservations.filter((item) => item.patternKey === series.patternKey)
    })),
    derivedTemporalPatterns: header.derivedTemporalPatterns || [],
    relationships: header.relationships || [],
    discoveryPatterns: header.discoveryPatterns || [],
    snapshots,
    stateVectors: buildPatientStateVectors({ patientId, patterns, instruments, snapshots }),
    dataQuality: header.dataQuality || {},
    evidence,
    audit: {
      ...(header.audit || {}),
      sourceDocumentIds: sourceDocuments.map((item) => item.sourceDocumentId).filter(Boolean)
    },
    notice: header.notice || "",
    trajectoryCapabilities: header.trajectoryCapabilities || {},
    storage: {
      scope: header.storageScope,
      globallyAggregated: header.globallyAggregated === true,
      sourceFingerprint: header.sourceFingerprint
    }
  };
}

async function markPatientPatternProfileState({ db, patientId, state, affectedPatternKeys = [], errorCode = null }) {
  const now = new Date().toISOString();
  await profileRef(db, patientId).set({
    patientId,
    analysisState: state,
    affectedPatternKeys,
    stateUpdatedAt: now,
    ...(state === "outdated" ? { outdatedAt: now } : {}),
    ...(state === "error" ? { errorAt: now, errorCode: String(errorCode || "unknown").slice(0, 80) } : {})
  }, { merge: true });
}

async function removePatientPatternProfile({ db, patientId }) {
  const ref = profileRef(db, patientId);
  if (typeof db.recursiveDelete === "function") {
    await db.recursiveDelete(ref);
    return { removed: true };
  }
  const snapshot = await ref.get();
  if (!snapshot.exists) return { removed: false };
  await ref.delete();
  return { removed: true };
}

module.exports = {
  SUBCOLLECTIONS,
  fingerprint,
  loadPatientPatternProfile,
  markPatientPatternProfileState,
  persistPatientPatternProfile,
  profileRef,
  removePatientPatternProfile
};
