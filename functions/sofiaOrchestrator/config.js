const SOFIA_ORCHESTRATOR_VERSION = "1.2.0";
const SOFIA_UNIFIED_MODEL = "gpt-5.5";

// Fase 0: una sola política de disponibilidad, capacidad y límites. El
// backend es la autoridad; el frontend solo refleja los errores seguros.
const SOFIA_RELEASE_CONFIG = Object.freeze({
  enabled: true,
  access: Object.freeze({
    authenticated: true,
    patientContext: "professional_only"
  }),
  capabilities: Object.freeze({
    chat: true,
    patientContext: true,
    patterns: true,
    legacyFallbackWithoutPatient: true
  }),
  limits: Object.freeze({
    windowMs: 5 * 60 * 1000,
    requestsPerWindow: 12,
    burstWindowMs: 30 * 1000,
    burstRequests: 3,
    maxConcurrentRequests: 2,
    leaseMs: 130 * 1000
  })
});

const SOFIA_ORCHESTRATOR_LIMITS = Object.freeze({
  maxMessageLength: 6000,
  maxHistoryItems: 8,
  maxHistoryItemLength: 3000,
  maxToolRounds: 5,
  maxToolCalls: 12,
  maxTimelineEvents: 40,
  maxVariablesPerTool: 60,
  maxPageItems: 30
});

const SOFIA_PAGE_SECTIONS = Object.freeze([
  "patient-overview",
  "alerts",
  "risk-estimates",
  "timeline",
  "relationships",
  "structured-analysis",
  "patient-patterns",
  "narrative",
  "clinical-reasoning",
  "monitoring",
  "pharmacology",
  "electrocardiogram",
  "note-review",
  "chat"
]);

const SOFIA_PAGE_ANALYSIS_SECTIONS = Object.freeze([
  "patient_overview",
  "alerts",
  "risk_estimates",
  "narrative",
  "clinical_reasoning",
  "monitoring",
  "pharmacology",
  "electrocardiogram",
  "note_review"
]);

module.exports = {
  SOFIA_ORCHESTRATOR_VERSION,
  SOFIA_UNIFIED_MODEL,
  SOFIA_RELEASE_CONFIG,
  SOFIA_ORCHESTRATOR_LIMITS,
  SOFIA_PAGE_SECTIONS,
  SOFIA_PAGE_ANALYSIS_SECTIONS
};
