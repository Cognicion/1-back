import { ADHD_PROTOCOL_ID, ADHD_PROTOCOL_VERSION } from "../config/adhdProtocol.js";
import { round } from "../core/statistics.js";

export const ADHD_SOFIA_BRIDGE_VERSION = "1.0.0";

export function buildAdhdSofiaSummary(input = {}, options = {}) {
  const profile = input.profile || input.cognitiveProfile || {};
  const program = input.program || {};
  const longitudinal = input.longitudinal || input.longitudinalSummary || {};
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const goals = Array.isArray(input.goals) ? input.goals : (Array.isArray(program.goals) ? program.goals : []);
  const redactions = [...new Set([
    ...collectDirectTerms(input),
    ...(Array.isArray(options.redactTerms) ? options.redactTerms : []).map(String)
  ].filter(Boolean))];
  const summary = {
    bridgeVersion: ADHD_SOFIA_BRIDGE_VERSION,
    protocolId: String(input.protocolId || program.protocolId || ADHD_PROTOCOL_ID),
    protocolVersion: String(input.protocolVersion || program.protocolVersion || ADHD_PROTOCOL_VERSION),
    payloadType: "derived_read_only_summary",
    dataRole: {
      derived: true,
      readOnly: true,
      sourceOfTruth: false,
      containsRawTrials: false,
      containsDirectIdentifiers: false
    },
    authority: {
      mayDiagnose: false,
      mayChangeProgram: false,
      maySelectClinicalTreatment: false,
      mayPersistAsCanonicalRecord: false,
      clinicianRetainsFinalControl: true
    },
    provenance: {
      profileEngineVersion: safeVersion(profile.profileEngineVersion),
      programEngineVersion: safeVersion(program.programEngineVersion),
      longitudinalEngineVersion: safeVersion(longitudinal.longitudinalEngineVersion),
      sessionSchemaVersions: [...new Set(sessions.map((session) => safeVersion(session.schemaVersion)).filter((value) => value !== "unknown"))]
    },
    cognitiveProfile: summarizeProfile(profile),
    longitudinalTrends: summarizeLongitudinal(longitudinal),
    adherence: summarizeAdherence(input.adherence, program, sessions),
    functionalGoals: summarizeGoals(goals, redactions),
    programStatus: summarizeProgram(program, sessions),
    notices: [
      "Resumen derivado no normativo; no contiene un score global de TDAH.",
      "SOFÍA no es fuente de verdad y no debe convertir este resumen en decisiones clínicas automáticas.",
      "Los cambios longitudinales no demuestran causalidad y deben considerar efecto de práctica y contexto."
    ]
  };
  const validation = validateAdhdSofiaSummary(summary);
  if (!validation.valid) throw new TypeError(`Resumen para SOFÍA rechazado: ${validation.errors.join(", ")}.`);
  return summary;
}

export function validateAdhdSofiaSummary(summary = {}) {
  const errors = [];
  const warnings = [];
  if (summary.payloadType !== "derived_read_only_summary") errors.push("payload_must_be_derived_summary");
  if (summary.dataRole?.sourceOfTruth !== false) errors.push("sofia_cannot_be_source_of_truth");
  if (summary.dataRole?.readOnly !== true) errors.push("payload_must_be_read_only");
  if (summary.dataRole?.containsRawTrials !== false) errors.push("raw_trials_not_allowed");
  if (summary.dataRole?.containsDirectIdentifiers !== false) errors.push("direct_identifiers_not_allowed");
  ["mayDiagnose", "mayChangeProgram", "maySelectClinicalTreatment", "mayPersistAsCanonicalRecord"].forEach((key) => {
    if (summary.authority?.[key] !== false) errors.push(`authority_${key}_must_be_false`);
  });
  scanKeys(summary, ({ key, path }) => {
    const normalized = normalizeKey(key);
    if (["patientid", "pacienteid", "userid", "uid", "name", "nombre", "email", "curp", "rawtrials", "trials"].includes(normalized)) {
      errors.push(`forbidden_field:${path}`);
    }
    if (["recommendation", "recomendacion", "diagnosis", "diagnostico", "clinicaldecision", "decisionclinica"].includes(normalized)) {
      errors.push(`decision_field_not_allowed:${path}`);
    }
  });
  if (!summary.cognitiveProfile?.domains?.length) warnings.push("profile_domains_unavailable");
  if (!summary.longitudinalTrends?.comparisons?.length) warnings.push("longitudinal_comparisons_unavailable");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    checkedWithBridgeVersion: ADHD_SOFIA_BRIDGE_VERSION
  };
}

export const createAdhdSofiaContext = buildAdhdSofiaSummary;
export const buildSofiaAdhdSummary = buildAdhdSofiaSummary;

function summarizeProfile(profile) {
  const domains = (Array.isArray(profile.domains) ? profile.domains : []).map((domain) => ({
    domainId: String(domain.id || ""),
    label: String(domain.label || domain.id || ""),
    assessmentStatus: String(domain.status || "unknown"),
    selectionSignal: finiteOrNull(domain.selectionSignal),
    selectionSignalType: "internal_experimental_non_normative",
    observedDifficultySignal: finiteOrNull(domain.observedDifficultySignal),
    linkedGoalCount: Array.isArray(domain.linkedGoals) ? domain.linkedGoals.length : 0,
    measures: (Array.isArray(domain.measures) ? domain.measures : [])
      .filter((measure) => finiteOrNull(measure.value) !== null)
      .map((measure) => ({
        taskId: String(measure.taskId || ""),
        label: String(measure.label || ""),
        value: Number(measure.value),
        unit: String(measure.unit || "raw"),
        validity: String(measure.validity || "unknown"),
        normative: false
      })),
    caveats: (Array.isArray(domain.caveats) ? domain.caveats : []).map(String)
  }));
  return {
    assessmentPhase: String(profile.assessmentPhase || "unknown"),
    normative: false,
    scoreType: "raw_and_intraindividual",
    domains,
    quality: {
      complete: profile.quality?.complete === true,
      fullyInterpretable: profile.quality?.fullyInterpretable === true,
      validTaskCount: finiteOrNull(profile.quality?.validTasks),
      requiredTaskCount: finiteOrNull(profile.quality?.requiredTasks)
    }
  };
}

function summarizeLongitudinal(longitudinal) {
  const comparisons = Array.isArray(longitudinal.baselineComparisons)
    ? longitudinal.baselineComparisons
    : (Array.isArray(longitudinal.measures) ? [longitudinal] : []);
  return {
    normative: false,
    comparisonType: "intraindividual",
    practiceEffectConsidered: comparisons.every((comparison) => comparison.practiceEffect?.considered !== false),
    comparisons: comparisons.map((comparison) => ({
      baselinePhase: String(comparison.baseline?.phase || "T0"),
      followUpPhase: String(comparison.followUp?.phase || "unknown"),
      measures: (comparison.measures || []).map((measure) => ({
        domainId: measure.domainId ? String(measure.domainId) : null,
        taskId: measure.taskId ? String(measure.taskId) : null,
        label: String(measure.label || ""),
        baseline: finiteOrNull(measure.baseline),
        followUp: finiteOrNull(measure.followUp),
        absoluteChange: finiteOrNull(measure.absoluteChange),
        percentChange: finiteOrNull(measure.percentChange),
        unit: String(measure.unit || "raw"),
        directionalInterpretation: String(measure.directionalInterpretation || "descriptive_change_only"),
        causalAttribution: false,
        normative: false
      })),
      materiallyDifferentContext: comparison.contextComparison?.materiallyDifferent === true,
      materiallyDifferentVersions: comparison.versionComparison?.materiallyDifferent === true,
      practiceEffectNotice: String(comparison.practiceEffect?.notice || "Debe considerarse efecto de práctica.")
    }))
  };
}

function summarizeAdherence(adherenceInput, program, sessions) {
  const scheduled = finiteOrNull(adherenceInput?.scheduled ?? program.configuration?.totalSessions ?? sessions.length);
  const completedFromSessions = sessions.filter((session) => ["completed", "completed_with_incomplete_data"].includes(session.status)).length;
  const completed = finiteOrNull(adherenceInput?.completed ?? completedFromSessions);
  const directRate = finiteOrNull(adherenceInput?.rate);
  const rate = Number.isFinite(directRate)
    ? (directRate > 1 ? directRate / 100 : directRate)
    : (Number.isFinite(completed) && Number.isFinite(scheduled) && scheduled > 0 ? completed / scheduled : null);
  const transferResults = sessions.flatMap((session) => (session.blocks || [])
    .filter((block) => block.kind === "functional_transfer" && block.result)
    .map((block) => block.result.status ?? block.result.completionStatus));
  return {
    scheduledSessions: Number.isFinite(scheduled) ? scheduled : null,
    completedSessions: Number.isFinite(completed) ? completed : null,
    completionRate: Number.isFinite(rate) ? round(rate, 4) : null,
    formula: "sesiones completadas / sesiones programadas",
    transferChallenges: {
      observed: transferResults.length,
      completed: transferResults.filter((status) => status === "completed").length,
      partial: transferResults.filter((status) => status === "partial").length,
      notCompleted: transferResults.filter((status) => status === "not_completed").length
    },
    missingData: !Number.isFinite(rate)
  };
}

function summarizeGoals(goals, redactions) {
  return goals.map((goal, index) => ({
    goalCode: `goal-${index + 1}`,
    action: redact(String(goal.action || goal.label || goal.text || "Objetivo funcional"), redactions),
    context: goal.context ? redact(String(goal.context), redactions) : null,
    frequency: scalarOrNull(goal.frequency),
    target: scalarOrNull(goal.target ?? goal.meta),
    domains: (Array.isArray(goal.domains) ? goal.domains : []).map(String),
    progressStatus: String(goal.progressStatus || goal.status || "not_recorded"),
    source: String(goal.source || "structured_goal")
  }));
}

function summarizeProgram(program, sessions) {
  const completed = sessions.filter((session) => ["completed", "completed_with_incomplete_data"].includes(session.status));
  const last = [...completed].sort((left, right) => Number(left.plannedSessionNumber || 0) - Number(right.plannedSessionNumber || 0)).at(-1);
  return {
    status: String(program.status || "unknown"),
    modalityId: String(program.modality?.id || "unknown"),
    totalSessions: finiteOrNull(program.configuration?.totalSessions),
    weeks: finiteOrNull(program.configuration?.weeks),
    completedSessions: completed.length,
    lastCompletedSessionNumber: finiteOrNull(last?.plannedSessionNumber),
    clinicianEdited: program.manualOverride === true,
    generatedByExplicitRules: program.generatedBy === "explicit_rules",
    generativeAiUsedForProgramDecision: false
  };
}

function scanKeys(value, visit, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanKeys(item, visit, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, child]) => {
    const childPath = [...path, key];
    visit({ key, value: child, path: childPath.join(".") });
    scanKeys(child, visit, childPath);
  });
}

function redact(value, terms) {
  let output = value;
  terms.filter((term) => term.length >= 3).forEach((term) => {
    output = output.replace(new RegExp(escapeRegExp(term), "giu"), "[REDACTED]");
  });
  return output;
}

function collectDirectTerms(value) {
  const directKeys = new Set([
    "name", "nombre", "fullname", "nombrecompleto", "email", "correo", "curp", "rfc",
    "patientid", "pacienteid", "userid", "uid", "phone", "telefono", "address", "direccion"
  ]);
  const terms = [];
  scanKeys(value, ({ key, value: child }) => {
    if (!directKeys.has(normalizeKey(key))) return;
    if (typeof child === "string" || typeof child === "number") terms.push(String(child));
  });
  return terms;
}

function scalarOrNull(value) {
  return ["string", "number", "boolean"].includes(typeof value) ? value : null;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeVersion(value) {
  const text = String(value || "unknown");
  return /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(text) ? text : "unknown";
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
