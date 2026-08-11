const CLINICAL_ANALYTICS_SCHEMA_VERSION = "1.0";
const CLINICAL_EXTRACTOR_VERSION = "1.0.0";
const CLINICAL_PATTERN_ENGINE_VERSION = "1.0.0";
const CLINICAL_PROBABILITY_ENGINE_VERSION = "1.0.0";
const CLINICAL_EVIDENCE_REGISTRY_VERSION = "1.0.0";

const CLINICAL_PROBABILITY_CONFIG = Object.freeze({
  minimumObservations: 10,
  minimumEvents: 3,
  confidenceLevel: 0.95
});

const ANALYTICS_COLLECTIONS = Object.freeze({
  variables: "clinicalAnalyticsVariables",
  patterns: "clinicalAnalyticsPatterns",
  relationships: "clinicalAnalyticsRelationships",
  probabilities: "clinicalAnalyticsProbabilities",
  runs: "clinicalAnalyticsRuns",
  queue: "clinicalAnalyticsQueue",
  evidence: "clinicalAnalyticsEvidence"
});

module.exports = {
  CLINICAL_ANALYTICS_SCHEMA_VERSION,
  CLINICAL_EXTRACTOR_VERSION,
  CLINICAL_PATTERN_ENGINE_VERSION,
  CLINICAL_PROBABILITY_ENGINE_VERSION,
  CLINICAL_EVIDENCE_REGISTRY_VERSION,
  CLINICAL_PROBABILITY_CONFIG,
  ANALYTICS_COLLECTIONS
};
