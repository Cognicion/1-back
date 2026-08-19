const { HttpsError } = require("firebase-functions/v2/https");
const { assertAdmin, assertAuthorizedProfessional, normalized } = require("./access");
const { buildPatientClinicalContext } = require("./contextBuilder");
const { extractClinicalVariables } = require("./variableExtractor");
const { analyzePatientTimeline } = require("./timelineAnalyzer");
const { detectPatientPatterns, buildObservationalRelationships } = require("./patternAnalyzer");
const { calculateEmpiricalProbability } = require("./probabilityEngine");
const { persistClinicalAnalysis, readClinicalKnowledge } = require("./persistence");
const { analyticsPatientId } = require("./deidentification");
const { buildPatientFeatureProfile } = require("./patientFeatureProfile");
const { buildPatternMatrices } = require("./matrixEngine");
const { persistPatientFeatureProfile, persistPatternMatrices } = require("./matrixPersistence");
const {
  indexClinicalRecordEmbeddings,
  removeClinicalRecordEmbeddings,
  removePatientEmbeddings
} = require("./embeddingPersistence");
const { rebuildClinicalEmbeddingIndexBatch } = require("./embeddingRebuild");
const {
  CLINICAL_ANALYTICS_SCHEMA_VERSION,
  CLINICAL_PATTERN_MATRIX_CONFIG,
  CLINICAL_RECORD_COLLECTIONS
} = require("./config");

function patientLabel(patient = {}) { return patient.nombre || patient.nombreCompleto || patient.displayName || "Paciente"; }

function isPatientProfile(profile = {}) {
  return [profile.rol, profile.role, profile.tipoUsuario, profile.perfil].some((value) => normalized(value) === "paciente") || profile.esPaciente === true;
}

async function analyzePatientClinicalContext({ request, db }) {
  const patientId = String(request.data?.patientId || "").trim();
  const access = await assertAuthorizedProfessional(request, db, patientId);
  const context = await buildPatientClinicalContext({ db, patientId, patient: access.patient });
  const variables = extractClinicalVariables(context);
  const timeline = analyzePatientTimeline(variables);
  const patterns = detectPatientPatterns(timeline);
  const relationships = buildObservationalRelationships(timeline);
  const runId = `patient:${CLINICAL_ANALYTICS_SCHEMA_VERSION}:${analyticsPatientId(patientId)}:${variables.map((item) => `${item.variableId}:${item.observedAt}:${String(item.value)}`).sort().join("|")}`;
  const persistence = await persistClinicalAnalysis({ db, patientId, variables, patterns, relationships, runId, actorUid: request.auth.uid, context, timeline });
  return {
    ok: true,
    session: { scope: "patient", patientId, actorUid: request.auth.uid, sessionId: analyticsPatientId(`${request.auth.uid}:${patientId}:${Date.now()}`) },
    patient: { id: patientId, label: patientLabel(access.patient) },
    summary: { variables: variables.length, timelineEvents: timeline.length, patterns: patterns.length, relationships: relationships.length },
    variables,
    timeline,
    patterns,
    associations: relationships.map((relationship) => ({ ...relationship, probability: calculateEmpiricalProbability({ numerator: relationship.numerator, denominator: relationship.denominator, cohort: { condition: relationship.condition, outcome: relationship.outcome } }) })),
    evidence: [],
    persistence: { ...persistence, storedGlobally: true, globalIdentity: "analyticsPatientId_only" },
    notice: "Análisis de apoyo clínico. No sustituye el juicio profesional. Las asociaciones son observacionales y no implican causalidad."
  };
}

async function listAuthorizedSofiaPatients({ request, db }) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const actor = actorSnap.exists ? actorSnap.data() || {} : {};
  const { isAdmin, isProfessional, patientAllowsProfessionalAccess } = require("./access");
  if (!isAdmin(actor, request.auth) && !isProfessional(actor)) throw new HttpsError("permission-denied", "Acceso restringido.");
  const snap = await db.collection("usuarios").where("rol", "==", "paciente").get();
  return { patients: snap.docs.filter((doc) => isAdmin(actor, request.auth) || patientAllowsProfessionalAccess(doc.data() || {}, request.auth.uid)).map((doc) => ({ id: doc.id, label: patientLabel(doc.data() || {}) })) };
}

async function getClinicalKnowledgeAdmin({ request, db }) {
  await assertAdmin(request, db);
  return { ok: true, ...(await readClinicalKnowledge({ db, limit: Math.min(Number(request.data?.limit) || 100, 250) })) };
}

async function rebuildClinicalPatternMatricesAdmin({ request, db }) {
  await assertAdmin(request, db);
  const startedAt = Date.now();
  const usersSnapshot = await db.collection("usuarios").get();
  const patientDocs = usersSnapshot.docs.filter((doc) => isPatientProfile(doc.data() || {}));
  if (patientDocs.length > CLINICAL_PATTERN_MATRIX_CONFIG.maxPatients) {
    throw new HttpsError("resource-exhausted", `La cohorte excede el limite operativo de ${CLINICAL_PATTERN_MATRIX_CONFIG.maxPatients} pacientes.`);
  }

  const profiles = [];
  let failures = 0;
  const concurrency = 4;
  for (let start = 0; start < patientDocs.length; start += concurrency) {
    const results = await Promise.all(patientDocs.slice(start, start + concurrency).map(async (patientDoc) => {
      try {
        const context = await buildPatientClinicalContext({ db, patientId: patientDoc.id, patient: patientDoc.data() || {} });
        const variables = extractClinicalVariables(context);
        const timeline = analyzePatientTimeline(variables);
        const profile = buildPatientFeatureProfile({ variables, timeline, context });
        await persistPatientFeatureProfile({ db, patientId: patientDoc.id, profile, markMatrixStale: false });
        return profile;
      } catch {
        return null;
      }
    }));
    results.forEach((profile) => {
      if (profile) profiles.push(profile);
      else failures += 1;
    });
  }

  if (failures) {
    console.error("[SOFIA Analytics] Reconstruccion incompleta", { patientCount: patientDocs.length, failures });
    throw new HttpsError("internal", "No fue posible construir todos los perfiles desidentificados; no se publicaron matrices parciales.", { patientCount: patientDocs.length, failures });
  }

  const result = buildPatternMatrices(profiles);
  const persistence = await persistPatternMatrices({ db, result });
  await db.collection("auditoria").add({
    accion: "reconstruir_matrices_patrones_sofia",
    modulo: "Conocimiento registrado por SOFIA",
    usuarioUid: request.auth.uid,
    cantidadPacientes: profiles.length,
    cantidadAsociaciones: Object.values(result.matrices).reduce((sum, matrix) => sum + matrix.retainedAssociations, 0),
    duracionMs: Date.now() - startedAt,
    incluyeIdentificadoresDirectos: false,
    incluyeTextoClinico: false,
    fecha: new Date().toISOString(),
    exito: true
  });
  return {
    ok: true,
    cohortSize: profiles.length,
    matrixRunId: persistence.matrixRunId,
    durationMs: Date.now() - startedAt,
    matrices: Object.fromEntries(Object.entries(result.matrices).map(([name, matrix]) => [name, {
      featureCount: matrix.featureCount || null,
      testedPairs: matrix.testedPairs,
      retainedAssociations: matrix.retainedAssociations
    }])),
    safeguards: result.safeguards
  };
}

async function rebuildClinicalEmbeddingIndexAdmin({ request, db, apiKey, OpenAIClass }) {
  await assertAdmin(request, db);
  return rebuildClinicalEmbeddingIndexBatch({
    db,
    apiKey,
    OpenAIClass,
    actorUid: request.auth.uid,
    jobId: request.data?.jobId
  });
}

async function processClinicalAnalyticsWrite({ event, db, apiKey, OpenAIClass }) {
  const patientId = event.params?.patientId;
  const collectionId = event.params?.collectionId;
  const recordId = event.params?.recordId;
  if (!patientId || !collectionId || !recordId || !CLINICAL_RECORD_COLLECTIONS.includes(collectionId)) {
    return { skipped: true, reason: "unsupported_source" };
  }
  const after = event.data?.after;
  const patientSnap = await db.doc(`usuarios/${patientId}`).get();
  if (!patientSnap.exists || !isPatientProfile(patientSnap.data() || {})) {
    return { skipped: true, patientMissing: !patientSnap.exists, nonPatientProfile: patientSnap.exists };
  }
  if (!after?.exists) {
    const removal = await removeClinicalRecordEmbeddings({
      db,
      patientId,
      sourceCollection: collectionId,
      sourceRecordId: recordId
    });
    const context = await buildPatientClinicalContext({ db, patientId, patient: patientSnap.data() || {} });
    const variables = extractClinicalVariables(context);
    const timeline = analyzePatientTimeline(variables);
    const profile = buildPatientFeatureProfile({ variables, timeline, context });
    const persistence = await persistPatientFeatureProfile({ db, patientId, profile });
    return { deleted: true, embeddingRemoved: removal.removed, profileUpdated: persistence.updated };
  }
  const context = await buildPatientClinicalContext({ db, patientId, patient: patientSnap.data() || {} });
  const variables = extractClinicalVariables(context);
  const timeline = analyzePatientTimeline(variables);
  const profile = buildPatientFeatureProfile({ variables, timeline, context });
  const persistence = await persistPatientFeatureProfile({ db, patientId, profile });
  let embedding;
  try {
    embedding = await indexClinicalRecordEmbeddings({
      db,
      apiKey,
      OpenAIClass,
      patientId,
      patient: patientSnap.data() || {},
      sourceCollection: collectionId,
      sourceRecordId: recordId,
      record: after.data() || {}
    });
  } catch (error) {
    embedding = { indexed: false, failed: true, code: String(error?.code || error?.name || "unknown").slice(0, 80) };
  }
  return {
    persisted: persistence.updated,
    duplicate: persistence.duplicate,
    analyticsPatientId: persistence.analyticsPatientId,
    featureCount: persistence.featureCount,
    matrixStale: persistence.updated,
    embedding: {
      indexed: embedding.indexed === true,
      duplicate: embedding.duplicate === true,
      skipped: embedding.skipped === true,
      failed: embedding.failed === true,
      fragmentCount: Number(embedding.fragmentCount) || 0
    }
  };
}

async function processClinicalPatientWrite({ event, db, apiKey, OpenAIClass }) {
  const patientId = event.params?.patientId;
  if (!patientId) return { skipped: true };
  const after = event.data?.after;
  if (!after?.exists) return removePatientEmbeddings({ db, patientId });
  const patient = after.data() || {};
  if (!isPatientProfile(patient)) return { skipped: true, reason: "non_patient_profile" };
  try {
    const embedding = await indexClinicalRecordEmbeddings({
      db,
      apiKey,
      OpenAIClass,
      patientId,
      patient,
      sourceCollection: "patientProfile",
      sourceRecordId: "profile",
      record: patient
    });
    return {
      indexed: embedding.indexed === true,
      duplicate: embedding.duplicate === true,
      skipped: embedding.skipped === true,
      fragmentCount: Number(embedding.fragmentCount) || 0
    };
  } catch (error) {
    console.error("[SOFIA Embeddings] Falló la actualización del perfil clínico", {
      code: String(error?.code || error?.name || "unknown").slice(0, 80)
    });
    return { indexed: false, failed: true };
  }
}

module.exports = {
  analyzePatientClinicalContext,
  listAuthorizedSofiaPatients,
  getClinicalKnowledgeAdmin,
  processClinicalAnalyticsWrite,
  processClinicalPatientWrite,
  rebuildClinicalEmbeddingIndexAdmin,
  rebuildClinicalPatternMatricesAdmin
};
