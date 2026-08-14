const SOFIA_ORCHESTRATOR_VERSION = "1.1.0";
const SOFIA_UNIFIED_MODEL = "gpt-5.5";

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
  "narrative",
  "clinical-reasoning",
  "monitoring",
  "pharmacology",
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
  "note_review"
]);

module.exports = {
  SOFIA_ORCHESTRATOR_VERSION,
  SOFIA_UNIFIED_MODEL,
  SOFIA_ORCHESTRATOR_LIMITS,
  SOFIA_PAGE_SECTIONS,
  SOFIA_PAGE_ANALYSIS_SECTIONS
};
