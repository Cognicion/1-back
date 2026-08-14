const { HttpsError } = require("firebase-functions/v2/https");
const {
  assertAuthorizedProfessional,
  isAdmin,
  isProfessional
} = require("../clinicalAnalytics/access");
const { buildPatientClinicalContext } = require("../clinicalAnalytics/contextBuilder");
const { extractClinicalVariables } = require("../clinicalAnalytics/variableExtractor");
const { analyzePatientTimeline } = require("../clinicalAnalytics/timelineAnalyzer");
const {
  detectPatientPatterns,
  buildObservationalRelationships
} = require("../clinicalAnalytics/patternAnalyzer");
const { calculateEmpiricalProbability } = require("../clinicalAnalytics/probabilityEngine");
const { stripIdentifiers } = require("../clinicalAnalytics/deidentification");
const { readClinicalMatrices } = require("../clinicalAnalytics/matrixPersistence");
const {
  SOFIA_ORCHESTRATOR_LIMITS,
  SOFIA_PAGE_ANALYSIS_SECTIONS,
  SOFIA_PAGE_SECTIONS
} = require("./config");

const BLOCKED_CONTEXT_KEYS = /^(name|nombre|nombres|apellido|apellidos|telefono|tel|phone|email|correo|domicilio|direccion|direcci[oó]n|curp|rfc|patientid|pacienteid|pacienteuid|uid|uidpaciente|expediente|numeroexpediente|fotografia|foto|documento|path|ruta|medicotratante)$/i;

function redactKnownIdentifiers(value, identityTerms = []) {
  let text = String(value ?? "");
  [...new Set(identityTerms)]
    .filter((term) => typeof term === "string" && term.trim().length >= 4)
    .sort((a, b) => b.length - a.length)
    .forEach((term) => {
      const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[paciente actual]");
    });
  return text;
}

function cleanText(value, maxLength = 500, identityTerms = []) {
  return redactKnownIdentifiers(value, identityTerms)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[correo oculto]")
    .replace(/\b[A-Z]{4}\d{6}[A-Z0-9]{3}\b/gi, "[identificador oculto]")
    .replace(/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi, "[identificador oculto]")
    .replace(/\b(?:\+?\d[\s().-]*){8,}\b/g, "[teléfono oculto]")
    .trim()
    .slice(0, maxLength);
}

function sanitizeSupplementalValue(value, depth = 0, identityTerms = []) {
  if (depth > 5 || value === undefined) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return cleanText(value, 500, identityTerms);
  if (Array.isArray(value)) {
    return value
      .slice(0, SOFIA_ORCHESTRATOR_LIMITS.maxPageItems)
      .map((item) => sanitizeSupplementalValue(item, depth + 1, identityTerms));
  }
  if (typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !BLOCKED_CONTEXT_KEYS.test(key))
      .slice(0, 40)
      .map(([key, item]) => [key, sanitizeSupplementalValue(item, depth + 1, identityTerms)])
  );
}

function sanitizePageState(pageState = {}, identityTerms = []) {
  const capabilities = Array.isArray(pageState.capabilities)
    ? pageState.capabilities.filter((item) => SOFIA_PAGE_SECTIONS.includes(item))
    : [];
  const panelContextSource = pageState.panelContext && typeof pageState.panelContext === "object"
    ? pageState.panelContext
    : {};
  const panelContext = Object.fromEntries(
    SOFIA_PAGE_ANALYSIS_SECTIONS
      .filter((section) => panelContextSource[section] !== undefined)
      .map((section) => [section, sanitizeSupplementalValue(panelContextSource[section], 0, identityTerms)])
  );
  return {
    capabilities,
    hasNoteDraft: pageState.hasNoteDraft === true,
    timelineFilter: cleanText(pageState.timelineFilter || "", 120, identityTerms),
    panelContext: stripIdentifiers(panelContext)
  };
}

function patientIdentityTerms(patient = {}) {
  const fullName = [patient.nombres, patient.apellidoPaterno, patient.apellidoMaterno].filter(Boolean).join(" ");
  return [
    patient.nombreCompleto,
    patient.displayName,
    fullName,
    patient.nombre,
    patient.apellidos,
    patient.apellidoPaterno,
    patient.apellidoMaterno
  ].map((item) => String(item || "").trim()).filter(Boolean);
}

async function assertAuthorizedSofiaActor(request, db) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Autenticación requerida.");
  }
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const actor = actorSnap.exists ? actorSnap.data() || {} : {};
  const actorIsAdmin = isAdmin(actor, request.auth);
  if (!actorIsAdmin && !isProfessional(actor)) {
    throw new HttpsError("permission-denied", "SOFÍA está disponible únicamente para personal autorizado.");
  }
  return { actor, isAdmin: actorIsAdmin };
}

function buildAnalysis(context) {
  const variables = extractClinicalVariables(context);
  const timeline = analyzePatientTimeline(variables);
  const patterns = detectPatientPatterns(timeline);
  const relationships = buildObservationalRelationships(timeline).map((relationship) => ({
    ...relationship,
    probability: calculateEmpiricalProbability({
      numerator: relationship.numerator,
      denominator: relationship.denominator,
      cohort: { condition: relationship.condition, outcome: relationship.outcome }
    })
  }));
  return { variables, timeline, patterns, relationships };
}

async function buildAuthorizedSofiaContext({ request, db }) {
  const patientId = String(request.data?.patientId || "").trim();
  if (!patientId) {
    const access = await assertAuthorizedSofiaActor(request, db);
    return {
      mode: "general",
      actorUid: request.auth.uid,
      isAdmin: access.isAdmin,
      patientId: null,
      analysis: null,
      pageState: sanitizePageState(request.data?.pageState),
      identityTerms: [],
      loadPlatformMatrices: access.isAdmin ? () => readClinicalMatrices({ db, limit: 60 }) : null
    };
  }

  const access = await assertAuthorizedProfessional(request, db, patientId);
  const clinicalContext = await buildPatientClinicalContext({
    db,
    patientId,
    patient: access.patient
  });
  const identityTerms = patientIdentityTerms(access.patient);
  return {
    mode: "patient",
    actorUid: request.auth.uid,
    isAdmin: access.isAdmin,
    patientId,
    analysis: buildAnalysis(clinicalContext),
    pageState: sanitizePageState(request.data?.pageState, identityTerms),
    identityTerms,
    loadPlatformMatrices: access.isAdmin ? () => readClinicalMatrices({ db, limit: 60 }) : null
  };
}

module.exports = {
  buildAnalysis,
  buildAuthorizedSofiaContext,
  cleanText,
  patientIdentityTerms,
  redactKnownIdentifiers,
  sanitizePageState,
  sanitizeSupplementalValue
};
