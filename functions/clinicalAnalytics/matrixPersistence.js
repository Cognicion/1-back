const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");
const {
  ANALYTICS_COLLECTIONS,
  CLINICAL_ANALYTICS_SCHEMA_VERSION,
  CLINICAL_FEATURE_PROFILE_VERSION,
  CLINICAL_MATRIX_ENGINE_VERSION,
  CLINICAL_PATTERN_MATRIX_CONFIG
} = require("./config");
const { analyticsPatientId, stripIdentifiers } = require("./deidentification");

const MATRIX_DOCUMENTS = Object.freeze({
  mixed: "mixed-values",
  documentation: "documentation-presence",
  temporal: "temporal-sequences"
});

function compactKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 450);
}

function matrixRunId(matrices) {
  const digest = crypto.createHash("sha256").update(JSON.stringify({
    generatedAt: matrices.generatedAt,
    cohortSize: matrices.cohortSize,
    versions: matrices.versions
  })).digest("hex").slice(0, 16);
  return `matrix-${Date.parse(matrices.generatedAt) || Date.now()}-${digest}`;
}

function profileFingerprint(profile) {
  return crypto.createHash("sha256").update(JSON.stringify({
    features: profile.features,
    positiveVariableIds: profile.positiveVariableIds,
    temporalPairs: profile.temporalPairs,
    featureProfileVersion: profile.featureProfileVersion
  })).digest("hex");
}

function assertSafeProfile(profile) {
  const serialized = JSON.stringify(profile);
  const forbiddenKeys = /"(?:patientId|pacienteId|pacienteUid|uidPaciente|nombre|apellidos|telefono|email|correo|domicilio|direccion|curp|rfc|numeroExpediente)"\s*:/i;
  if (forbiddenKeys.test(serialized) || profile.rawClinicalTextIncluded !== false || profile.directIdentifiersIncluded !== false) {
    throw new TypeError("El perfil analitico contiene campos no permitidos.");
  }
}

async function persistPatientFeatureProfile({ db, patientId, profile, markMatrixStale = true }) {
  assertSafeProfile(profile);
  const analyticsId = analyticsPatientId(patientId);
  const safeProfile = stripIdentifiers(profile);
  const ref = db.collection(ANALYTICS_COLLECTIONS.patientProfiles).doc(analyticsId);
  const fingerprint = profileFingerprint(safeProfile);
  const payload = {
    ...safeProfile,
    analyticsPatientId: analyticsId,
    schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION,
    featureProfileVersion: CLINICAL_FEATURE_PROFILE_VERSION,
    profileFingerprint: fingerprint,
    updatedAt: new Date().toISOString()
  };
  const updated = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists && existing.data()?.profileFingerprint === fingerprint) return false;
    transaction.set(ref, payload, { merge: false });
    if (markMatrixStale) transaction.set(db.collection(ANALYTICS_COLLECTIONS.matrixStatus).doc("current"), {
      stale: true,
      staleReason: "patient_profile_updated",
      dirtyProfiles: FieldValue.increment(1),
      lastProfileUpdatedAt: new Date().toISOString(),
      matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION,
      schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION
    }, { merge: true });
    return true;
  });
  return { analyticsPatientId: analyticsId, featureCount: payload.features?.length || 0, updated, duplicate: !updated };
}

async function readPatientFeatureProfiles({ db }) {
  const snapshot = await db.collection(ANALYTICS_COLLECTIONS.patientProfiles)
    .limit(CLINICAL_PATTERN_MATRIX_CONFIG.maxPatients + 1)
    .get();
  if (snapshot.size > CLINICAL_PATTERN_MATRIX_CONFIG.maxPatients) {
    const error = new RangeError(`La cohorte supera el limite operativo de ${CLINICAL_PATTERN_MATRIX_CONFIG.maxPatients} perfiles.`);
    error.code = "analytics/cohort-too-large";
    throw error;
  }
  return snapshot.docs.map((doc) => ({ ...doc.data(), analyticsPatientId: doc.id }));
}

async function commitOperations(db, operations, batchSize = 400) {
  for (let start = 0; start < operations.length; start += batchSize) {
    const batch = db.batch();
    operations.slice(start, start + batchSize).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

async function writeAssociations({ db, matrixRef, associations, runId }) {
  const collectionRef = matrixRef.collection("associations");
  const writeOperations = associations.map((association, index) => (batch) => batch.set(
    collectionRef.doc(compactKey(association.associationId || association.patternId)),
    { ...association, displayRank: index + 1, matrixRunId: runId },
    { merge: false }
  ));
  await commitOperations(db, writeOperations);
}

async function persistPatternMatrices({ db, result }) {
  const runId = matrixRunId(result);
  const matrixDocuments = {};
  for (const [name, documentId] of Object.entries(MATRIX_DOCUMENTS)) {
    const matrix = result.matrices[name];
    const versionedDocumentId = compactKey(`${documentId}--${runId}`);
    matrixDocuments[name] = versionedDocumentId;
    const matrixRef = db.collection(ANALYTICS_COLLECTIONS.matrices).doc(versionedDocumentId);
    const { associations, ...metadata } = matrix;
    await matrixRef.set({
      ...metadata,
      matrixRunId: runId,
      generatedAt: result.generatedAt,
      safeguards: result.safeguards,
      schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION,
      matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
    }, { merge: false });
    await writeAssociations({ db, matrixRef, associations, runId });
  }
  await db.collection(ANALYTICS_COLLECTIONS.matrixStatus).doc("current").set({
    stale: false,
    staleReason: null,
    dirtyProfiles: 0,
    matrixRunId: runId,
    matrixDocuments,
    cohortSize: result.cohortSize,
    generatedAt: result.generatedAt,
    matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION,
    schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION,
    safeguards: result.safeguards
  }, { merge: false });
  return { matrixRunId: runId, cohortSize: result.cohortSize };
}

function sortAssociationsForDisplay(associations = [], matrixType = "") {
  return [...associations].sort((a, b) => {
    if (Number.isFinite(Number(a.displayRank)) || Number.isFinite(Number(b.displayRank))) {
      return (Number(a.displayRank) || Number.MAX_SAFE_INTEGER) - (Number(b.displayRank) || Number.MAX_SAFE_INTEGER);
    }
    if (Number.isFinite(Number(a.utilityScore)) || Number.isFinite(Number(b.utilityScore))) {
      return (Number(b.utilityScore) || 0) - (Number(a.utilityScore) || 0)
        || (Number(b.robustnessScore) || 0) - (Number(a.robustnessScore) || 0)
        || (Number(b.sampleSize) || 0) - (Number(a.sampleSize) || 0)
        || String(a.associationId || a.id).localeCompare(String(b.associationId || b.id));
    }
    if ((a.matrixType || matrixType) === "temporal_sequences") {
      return (Number(b.patientSupport) || 0) - (Number(a.patientSupport) || 0)
        || (Number(b.lift) || 0) - (Number(a.lift) || 0)
        || String(a.associationId || a.id).localeCompare(String(b.associationId || b.id));
    }
    return Number(b.passesFalseDiscoveryRate === true) - Number(a.passesFalseDiscoveryRate === true)
      || Math.abs(Number(b.effectSize) || 0) - Math.abs(Number(a.effectSize) || 0)
      || (Number(b.sampleSize) || 0) - (Number(a.sampleSize) || 0)
      || String(a.associationId || a.id).localeCompare(String(b.associationId || b.id));
  });
}

function effectiveMatrixStatus(status = null) {
  if (!status) return {
    stale: true,
    staleReason: "not_generated",
    versionOutdated: false,
    currentMatrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
  };
  const versionOutdated = status.matrixEngineVersion !== CLINICAL_MATRIX_ENGINE_VERSION;
  return {
    ...status,
    stale: status.stale !== false || versionOutdated,
    staleReason: versionOutdated ? "matrix_engine_version_changed" : status.staleReason || null,
    versionOutdated,
    currentMatrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
  };
}

async function readMatrix(db, documentId, limit) {
  const ref = db.collection(ANALYTICS_COLLECTIONS.matrices).doc(documentId);
  const metadata = await ref.get();
  if (!metadata.exists) return null;
  const associationRef = ref.collection("associations");
  let associations = await associationRef.orderBy("displayRank", "asc").limit(limit).get();
  if (associations.empty && Number(metadata.data()?.retainedAssociations) > 0) {
    const legacyLimit = Math.max(
      CLINICAL_PATTERN_MATRIX_CONFIG.maxAssociations,
      CLINICAL_PATTERN_MATRIX_CONFIG.maxPresenceAssociations,
      CLINICAL_PATTERN_MATRIX_CONFIG.maxTemporalPatterns
    );
    associations = await associationRef.limit(legacyLimit).get();
  }
  const sortedAssociations = sortAssociationsForDisplay(
    associations.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    metadata.data()?.matrixType
  ).slice(0, limit);
  return {
    id: documentId,
    ...metadata.data(),
    associations: sortedAssociations
  };
}

async function readClinicalMatrices({ db, limit = 100 }) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const status = await db.collection(ANALYTICS_COLLECTIONS.matrixStatus).doc("current").get();
  const statusData = status.exists ? status.data() : null;
  const documents = statusData?.matrixDocuments || MATRIX_DOCUMENTS;
  const [mixed, documentation, temporal] = await Promise.all([
    readMatrix(db, documents.mixed || MATRIX_DOCUMENTS.mixed, boundedLimit),
    readMatrix(db, documents.documentation || MATRIX_DOCUMENTS.documentation, boundedLimit),
    readMatrix(db, documents.temporal || MATRIX_DOCUMENTS.temporal, boundedLimit)
  ]);
  return {
    matrixStatus: effectiveMatrixStatus(statusData),
    matrices: { mixed, documentation, temporal }
  };
}

module.exports = {
  MATRIX_DOCUMENTS,
  assertSafeProfile,
  effectiveMatrixStatus,
  persistPatientFeatureProfile,
  persistPatternMatrices,
  readClinicalMatrices,
  readPatientFeatureProfiles,
  sortAssociationsForDisplay
};
