const { HttpsError } = require("firebase-functions/v2/https");
const { assertAdmin, assertAuthorizedProfessional } = require("./access");
const { buildPatientClinicalContext } = require("./contextBuilder");
const { extractClinicalVariables } = require("./variableExtractor");
const { analyzePatientTimeline } = require("./timelineAnalyzer");
const { detectPatientPatterns, buildObservationalRelationships } = require("./patternAnalyzer");
const { calculateEmpiricalProbability } = require("./probabilityEngine");
const { persistClinicalAnalysis, readClinicalKnowledge } = require("./persistence");
const { analyticsPatientId } = require("./deidentification");

function patientLabel(patient = {}) { return patient.nombre || patient.nombreCompleto || patient.displayName || "Paciente"; }

async function analyzePatientClinicalContext({ request, db }) {
  const patientId = String(request.data?.patientId || "").trim();
  const access = await assertAuthorizedProfessional(request, db, patientId);
  const context = await buildPatientClinicalContext({ db, patientId, patient: access.patient });
  const variables = extractClinicalVariables(context);
  const timeline = analyzePatientTimeline(variables);
  const patterns = detectPatientPatterns(timeline);
  const relationships = buildObservationalRelationships(timeline);
  const runId = `patient:${analyticsPatientId(patientId)}:${variables.map((item) => `${item.variableId}:${item.observedAt}:${String(item.value)}`).sort().join("|")}`;
  const persistence = await persistClinicalAnalysis({ db, patientId, variables, patterns, relationships, runId, actorUid: request.auth.uid });
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
  return persistClinicalAnalysis({ db, patientId, variables, patterns: detectPatientPatterns(timeline), relationships: buildObservationalRelationships(timeline), runId: `event:${event.id}`, actorUid: null });
}

module.exports = { analyzePatientClinicalContext, listAuthorizedSofiaPatients, getClinicalKnowledgeAdmin, processClinicalAnalyticsWrite };
