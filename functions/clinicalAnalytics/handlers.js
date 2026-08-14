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
  CLINICAL_ANALYTICS_SCHEMA_VERSION,
  CLINICAL_PATTERN_MATRIX_CONFIG
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

async function processClinicalAnalyticsWrite({ event, db }) {
  const patientId = event.params?.patientId;
  const collectionId = event.params?.collectionId;
  if (!patientId || !collectionId || collectionId.startsWith("clinicalAnalytics")) return { skipped: true };
  const after = event.data?.after;
  if (!after?.exists) return { skipped: true, deleted: true };
  const patientSnap = await db.doc(`usuarios/${patientId}`).get();
  if (!patientSnap.exists) return { skipped: true, patientMissing: true };
  const context = await buildPatientClinicalContext({ db, patientId, patient: patientSnap.data() || {} });
  const variables = extractClinicalVariables(context);
  const timeline = analyzePatientTimeline(variables);
  const profile = buildPatientFeatureProfile({ variables, timeline, context });
  const persistence = await persistPatientFeatureProfile({ db, patientId, profile });
  return {
    persisted: persistence.updated,
    duplicate: persistence.duplicate,
    analyticsPatientId: persistence.analyticsPatientId,
    featureCount: persistence.featureCount,
    matrixStale: persistence.updated
  };
}

module.exports = { analyzePatientClinicalContext, listAuthorizedSofiaPatients, getClinicalKnowledgeAdmin, rebuildClinicalPatternMatricesAdmin, processClinicalAnalyticsWrite };
