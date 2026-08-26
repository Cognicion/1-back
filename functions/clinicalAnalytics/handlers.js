const { HttpsError } = require("firebase-functions/v2/https");
const {
  assertAdmin,
  assertAuthorizedPatientClinician,
  isProfessional,
  listAuthorizedPatientSnapshots,
  normalized
} = require("./access");
const { buildPatientClinicalContext } = require("./contextBuilder");
const { extractClinicalVariables } = require("./variableExtractor");
const { analyzePatientTimeline } = require("./timelineAnalyzer");
const { detectPatientPatterns, buildObservationalRelationships } = require("./patternAnalyzer");
const { calculateEmpiricalProbability } = require("./probabilityEngine");
const {
  persistClinicalAnalysis,
  readClinicalKnowledge,
  removePatientClinicalAnalysisArtifacts
} = require("./persistence");
const { analyticsPatientId } = require("./deidentification");
const { buildPatientFeatureProfile } = require("./patientFeatureProfile");
const { buildPatternMatrices } = require("./matrixEngine");
const {
  persistPatientFeatureProfile,
  persistPatternMatrices,
  removePatientFeatureProfile
} = require("./matrixPersistence");
const {
  indexClinicalRecordEmbeddings,
  removeClinicalRecordEmbeddings,
  removePatientEmbeddings
} = require("./embeddingPersistence");
const { rebuildClinicalEmbeddingIndexBatch } = require("./embeddingRebuild");
const {
  getOrBuildPatientPatternProfile,
  refreshPatientPatternProfile
} = require("./patientPatternProfileService");
const {
  markPatientPatternProfileState,
  removePatientPatternProfile
} = require("./patientPatternProfilePersistence");
const { AFFECTED_PATTERNS_BY_COLLECTION, PATTERN_CATALOG } = require("./patientPatternConfig");
const { accountDeletionTombstonePath } = require("../accountSecurity/accountDeletion");
const {
  CLINICAL_ANALYTICS_SCHEMA_VERSION,
  CLINICAL_PATTERN_MATRIX_CONFIG,
  CLINICAL_RECORD_COLLECTIONS
} = require("./config");

function patientLabel(patient = {}) { return patient.nombre || patient.nombreCompleto || patient.displayName || "Paciente"; }

function isPatientProfile(profile = {}) {
  return [profile.rol, profile.role, profile.tipoUsuario, profile.perfil].some((value) => normalized(value) === "paciente") || profile.esPaciente === true;
}

async function readCurrentClinicalPatientState({ db, patientId }) {
  const [patientSnapshot, deletionSnapshot] = await Promise.all([
    db.doc(`usuarios/${patientId}`).get(),
    db.doc(accountDeletionTombstonePath(patientId)).get()
  ]);
  const patient = patientSnapshot.exists ? patientSnapshot.data() || {} : null;
  const linkedPatientOrigin = normalized(patient?.estado) === "vinculado" && Boolean(String(patient?.vinculadoA || "").trim());
  return {
    active: patientSnapshot.exists && !deletionSnapshot.exists && !linkedPatientOrigin,
    patient,
    linkedPatientOrigin,
    patientMissing: !patientSnapshot.exists,
    tombstoneExists: deletionSnapshot.exists
  };
}

async function removePatientClinicalArtifacts({ db, patientId }) {
  const [analysis, embeddings, featureProfile, patternProfile] = await Promise.all([
    removePatientClinicalAnalysisArtifacts({ db, patientId }),
    removePatientEmbeddings({ db, patientId }),
    removePatientFeatureProfile({ db, patientId }),
    removePatientPatternProfile({ db, patientId })
  ]);
  return { analysis, embeddings, featureProfile, patternProfile };
}

async function activeClinicalPatientOrCleanup({ db, patientId }) {
  const state = await readCurrentClinicalPatientState({ db, patientId });
  if (state.active) return state;
  return {
    ...state,
    cleanupResult: {
      skipped: true,
      cleanupOnly: true,
      reason: state.tombstoneExists
        ? "account_deletion"
        : (state.patientMissing ? "patient_missing" : "linked_patient_origin"),
      linkedPatientOrigin: state.linkedPatientOrigin,
      patientMissing: state.patientMissing,
      tombstoneExists: state.tombstoneExists,
      cleanup: await removePatientClinicalArtifacts({ db, patientId })
    }
  };
}

async function analyzePatientClinicalContext({ request, db }) {
  const patientId = String(request.data?.patientId || "").trim();
  const access = await assertAuthorizedPatientClinician(request, db, patientId);
  const central = await getOrBuildPatientPatternProfile({
    db,
    patientId,
    patient: access.patient,
    actorUid: request.auth.uid,
    force: true
  });
  const context = central.clinicalContext;
  const { variables, timeline, patterns, relationships } = central.analysis;
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
    evidence: central.profile.evidence,
    profile: central.profile,
    persistence: { ...persistence, storedGlobally: true, globalIdentity: "analyticsPatientId_only" },
    notice: "Análisis de apoyo clínico. No sustituye el juicio profesional. Las asociaciones son observacionales y no implican causalidad."
  };
}

async function listAuthorizedSofiaPatients({ request, db }) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const actor = actorSnap.exists ? actorSnap.data() || {} : {};
  if (!isProfessional(actor)) throw new HttpsError("permission-denied", "Acceso restringido a personal clínico autorizado.");
  const patients = await listAuthorizedPatientSnapshots({
    db,
    professionalProfile: actor,
    professionalUid: request.auth.uid
  });
  return {
    patients: patients.map((doc) => ({
      id: doc.id,
      label: patientLabel(doc.data() || {})
    }))
  };
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

async function processClinicalAnalyticsWrite({ event, db, apiKey, OpenAIClass, sourceRoot = "usuarios" }) {
  const patientId = event.params?.patientId;
  const collectionId = event.params?.collectionId;
  const recordId = event.params?.recordId;
  const embeddingRecordId = sourceRoot === "usuarios" ? recordId : `${sourceRoot}:${recordId}`;
  if (!patientId || !collectionId || !recordId || !CLINICAL_RECORD_COLLECTIONS.includes(collectionId)) {
    return { skipped: true, reason: "unsupported_source" };
  }
  const after = event.data?.after;
  let patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  if (!isPatientProfile(patientState.patient)) return { skipped: true, nonPatientProfile: true };
  const affectedPatternKeys = AFFECTED_PATTERNS_BY_COLLECTION[collectionId] || Object.keys(PATTERN_CATALOG);

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  await markPatientPatternProfileState({ db, patientId, state: "outdated", affectedPatternKeys });

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  const context = await buildPatientClinicalContext({ db, patientId, patient: patientState.patient });

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  const patientPatternResult = await refreshPatientPatternProfile({
    db,
    patientId,
    patient: patientState.patient,
    context,
    affectedPatternKeys
  });

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  const variables = patientPatternResult.analysis.variables;
  const timeline = patientPatternResult.analysis.timeline;
  const profile = buildPatientFeatureProfile({ variables, timeline, context });

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  const persistence = await persistPatientFeatureProfile({ db, patientId, profile });

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  if (!after?.exists) {
    const removal = await removeClinicalRecordEmbeddings({
      db,
      patientId,
      sourceCollection: collectionId,
      sourceRecordId: embeddingRecordId
    });
    patientState = await activeClinicalPatientOrCleanup({ db, patientId });
    if (!patientState.active) return patientState.cleanupResult;
    return {
      deleted: true,
      embeddingRemoved: removal.removed,
      profileUpdated: persistence.updated,
      patientPatternProfileUpdated: patientPatternResult.persistence.persisted === true,
      affectedPatternKeys
    };
  }
  let embedding;
  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  try {
    embedding = await indexClinicalRecordEmbeddings({
      db,
      apiKey,
      OpenAIClass,
      patientId,
      patient: patientState.patient,
      sourceCollection: collectionId,
      sourceRecordId: embeddingRecordId,
      record: after.data() || {}
    });
  } catch (error) {
    embedding = { indexed: false, failed: true, code: String(error?.code || error?.name || "unknown").slice(0, 80) };
  }
  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  return {
    persisted: persistence.updated,
    duplicate: persistence.duplicate,
    analyticsPatientId: persistence.analyticsPatientId,
    featureCount: persistence.featureCount,
    matrixStale: persistence.updated,
    patientPatternProfileUpdated: patientPatternResult.persistence.persisted === true,
    affectedPatternKeys,
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
  if (!after?.exists) return removePatientClinicalArtifacts({ db, patientId });

  let patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  let patient = patientState.patient;
  if (!isPatientProfile(patient)) return { skipped: true, reason: "non_patient_profile" };
  let patientPatternProfileUpdated = false;
  let patternStateMarked = false;

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  try {
    await markPatientPatternProfileState({ db, patientId, state: "outdated", affectedPatternKeys: Object.keys(PATTERN_CATALOG) });
    patternStateMarked = true;
  } catch (error) {
    console.error("[SOFIA Patient Patterns] Falló la actualización del perfil protegido", {
      code: String(error?.code || error?.name || "unknown").slice(0, 80)
    });
  }

  if (patternStateMarked) {
    patientState = await activeClinicalPatientOrCleanup({ db, patientId });
    if (!patientState.active) return patientState.cleanupResult;
    patient = patientState.patient;
    try {
      const result = await refreshPatientPatternProfile({ db, patientId, patient, affectedPatternKeys: Object.keys(PATTERN_CATALOG) });
      patientPatternProfileUpdated = result.persistence.persisted === true;
    } catch (error) {
      console.error("[SOFIA Patient Patterns] Falló la actualización del perfil protegido", {
        code: String(error?.code || error?.name || "unknown").slice(0, 80)
      });
    }
  }

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  patient = patientState.patient;
  let embedding;
  try {
    embedding = await indexClinicalRecordEmbeddings({
      db,
      apiKey,
      OpenAIClass,
      patientId,
      patient,
      sourceCollection: "patientProfile",
      sourceRecordId: "profile",
      record: patient
    });
  } catch (error) {
    console.error("[SOFIA Embeddings] Falló la actualización del perfil clínico", {
      code: String(error?.code || error?.name || "unknown").slice(0, 80)
    });
    embedding = { indexed: false, failed: true };
  }

  patientState = await activeClinicalPatientOrCleanup({ db, patientId });
  if (!patientState.active) return patientState.cleanupResult;
  return {
    indexed: embedding.indexed === true,
    duplicate: embedding.duplicate === true,
    skipped: embedding.skipped === true,
    failed: embedding.failed === true,
    fragmentCount: Number(embedding.fragmentCount) || 0,
    patientPatternProfileUpdated
  };
}

module.exports = {
  activeClinicalPatientOrCleanup,
  analyzePatientClinicalContext,
  listAuthorizedSofiaPatients,
  getClinicalKnowledgeAdmin,
  processClinicalAnalyticsWrite,
  processClinicalPatientWrite,
  readCurrentClinicalPatientState,
  rebuildClinicalEmbeddingIndexAdmin,
  rebuildClinicalPatternMatricesAdmin,
  removePatientClinicalArtifacts
};
