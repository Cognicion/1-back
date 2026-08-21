const { HttpsError } = require("firebase-functions/v2/https");
const {
  assertAuthorizedPatientClinician,
  isAdmin,
  isProfessional
} = require("../clinicalAnalytics/access");
const { getOrBuildPatientPatternProfile, analysisFromProfile } = require("../clinicalAnalytics/patientPatternProfileService");
const { stripIdentifiers } = require("../clinicalAnalytics/deidentification");
const { readClinicalMatrices } = require("../clinicalAnalytics/matrixPersistence");
const { readClinicalEmbeddingKnowledge } = require("../clinicalAnalytics/embeddingPersistence");
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

function buildAnalysis(profile) {
  return analysisFromProfile(profile);
}

function getSelectedPatientPatternContext(context = {}) {
  const profile = context.patientPatternProfile;
  if (!profile) return null;
  const identityTerms = context.identityTerms || [];
  return {
    analysisState: profile.analysisState,
    generatedAt: profile.generatedAt,
    updatedAt: profile.updatedAt,
    notice: cleanText(profile.notice, 500, identityTerms),
    patterns: (profile.patterns || []).map((pattern) => ({
      id: pattern.id,
      key: pattern.key,
      label: pattern.label,
      category: pattern.category,
      status: pattern.status,
      value: sanitizeSupplementalValue(pattern.value, 0, identityTerms),
      confidence: pattern.confidence,
      currentState: sanitizeSupplementalValue(pattern.currentState, 0, identityTerms),
      evidence: (pattern.evidence || []).map((item) => ({
        evidenceId: item.id,
        sourceType: item.sourceType,
        sourceDate: item.sourceDate,
        documentDate: item.documentDate,
        estimatedClinicalTime: item.estimatedClinicalTime,
        temporalPrecision: item.temporalPrecision,
        clinicalTimeWindow: item.clinicalTimeWindow,
        excerpt: cleanText(item.excerpt, 500, identityTerms),
        polarity: item.polarity,
        confidence: item.confidence,
        ruleApplied: item.ruleApplied
      })),
      observations: (pattern.observations || []).map((item) => ({
        id: item.id,
        timestamp: item.timestamp,
        documentDate: item.documentDate,
        estimatedClinicalTime: item.estimatedClinicalTime,
        temporalPrecision: item.temporalPrecision,
        clinicalTimeWindow: item.clinicalTimeWindow,
        value: sanitizeSupplementalValue(item.value, 0, identityTerms),
        normalizedValue: item.normalizedValue,
        status: item.status,
        confidence: item.confidence,
        coverage: item.coverage,
        instrumentResultId: item.instrumentResultId,
        clinicianReviewed: item.clinicianReviewed === true,
        sourceAvailable: item.sourceAvailable !== false,
        superseded: item.superseded === true
      }))
    })),
    instruments: (profile.instruments || []).map((instrument) => ({
      id: instrument.id,
      instrumentId: instrument.instrumentId,
      instrumentName: instrument.instrumentName,
      abbreviation: instrument.abbreviation,
      timestamp: instrument.timestamp,
      rawScore: instrument.rawScore,
      normalizedScore: instrument.normalizedScore,
      partialSum: instrument.partialSum,
      maximumScore: instrument.maximumScore,
      coverage: instrument.coverage,
      coveredItems: instrument.coveredItems,
      requiredItems: instrument.requiredItems,
      missingItems: instrument.missingItems,
      scoreStatus: instrument.scoreStatus,
      sourceAvailable: instrument.sourceAvailable !== false,
      superseded: instrument.superseded === true,
      parameters: sanitizeSupplementalValue(instrument.parameters, 0, identityTerms),
      itemResults: (instrument.itemResults || []).map((item) => ({
        itemNumber: item.itemNumber,
        value: item.value,
        status: item.status,
        confidence: item.confidence,
        evidence: cleanText(item.evidence, 500, identityTerms),
        sourceType: item.sourceType,
        sourceDate: item.sourceDate,
        estimatedClinicalTime: item.estimatedClinicalTime,
        temporalPrecision: item.temporalPrecision,
        ruleApplied: item.ruleApplied,
        clinicianReviewed: item.clinicianReviewed === true
      })),
      clinicianReviewed: instrument.clinicianReviewed === true
    })),
    quantitativeFeatures: (profile.quantitativeFeatures || []).map((feature) => ({
      feature: feature.feature,
      patternKey: feature.patternKey || null,
      rawValue: feature.rawValue,
      normalizedValue: feature.normalizedValue,
      coverage: feature.coverage,
      confidence: feature.confidence,
      timestamp: feature.timestamp,
      sourceInstrument: feature.sourceInstrument,
      meaning: feature.meaning
    })),
    snapshots: (profile.snapshots || []).map((snapshot) => ({
      timestamp: snapshot.timestamp,
      featureValues: snapshot.featureValues
    })),
    dataQuality: profile.dataQuality,
    directIdentifiersIncluded: false,
    rawReasoningIncluded: false
  };
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
      patientPatternProfile: null,
      pageState: sanitizePageState(request.data?.pageState),
      identityTerms: [],
      loadPlatformMatrices: access.isAdmin ? () => readClinicalMatrices({ db, limit: 60 }) : null,
      loadPlatformSemanticKnowledge: access.isAdmin ? () => readClinicalEmbeddingKnowledge({ db }) : null
    };
  }

  const access = await assertAuthorizedPatientClinician(request, db, patientId);
  const patternResult = await getOrBuildPatientPatternProfile({
    db,
    patientId,
    patient: access.patient,
    actorUid: request.auth.uid
  });
  const identityTerms = patientIdentityTerms(access.patient);
  const context = {
    mode: "patient",
    actorUid: request.auth.uid,
    isAdmin: access.isAdmin,
    patientId,
    analysis: patternResult.analysis,
    patientPatternProfile: patternResult.profile,
    pageState: sanitizePageState(request.data?.pageState, identityTerms),
    identityTerms,
    loadPlatformMatrices: access.isAdmin ? () => readClinicalMatrices({ db, limit: 60 }) : null,
    loadPlatformSemanticKnowledge: access.isAdmin ? () => readClinicalEmbeddingKnowledge({ db }) : null
  };
  context.getSelectedPatientPatternContext = () => getSelectedPatientPatternContext(context);
  return context;
}

module.exports = {
  buildAnalysis,
  buildAuthorizedSofiaContext,
  cleanText,
  getSelectedPatientPatternContext,
  patientIdentityTerms,
  redactKnownIdentifiers,
  sanitizePageState,
  sanitizeSupplementalValue
};
