const CLINICAL_ANALYTICS_SCHEMA_VERSION = "1.1";
const CLINICAL_EXTRACTOR_VERSION = "1.0.0";
const CLINICAL_PATTERN_ENGINE_VERSION = "2.0.0";
const CLINICAL_PROBABILITY_ENGINE_VERSION = "1.1.0";
const CLINICAL_EVIDENCE_REGISTRY_VERSION = "1.1.0";
const CLINICAL_FEATURE_PROFILE_VERSION = "1.0.0";
const CLINICAL_MATRIX_ENGINE_VERSION = "1.0.0";

const CLINICAL_PROBABILITY_CONFIG = Object.freeze({
  minimumObservations: 10,
  minimumEvents: 3,
  confidenceLevel: 0.95
});

const CLINICAL_PATTERN_MATRIX_CONFIG = Object.freeze({
  minimumObservations: 10,
  minimumEvents: 3,
  minimumCellCount: 3,
  minimumAbsoluteEffect: 0.1,
  falseDiscoveryRate: 0.05,
  maxCategories: 12,
  maxProfileFeatures: 260,
  maxMatrixFeatures: 160,
  maxAssociations: 500,
  maxPresenceAssociations: 300,
  maxTemporalPatterns: 300,
  maxTemporalPairsPerPatient: 240,
  maxPatients: 5000
});

const ANALYTICS_COLLECTIONS = Object.freeze({
  variables: "clinicalAnalyticsVariables",
  patterns: "clinicalAnalyticsPatterns",
  relationships: "clinicalAnalyticsRelationships",
  probabilities: "clinicalAnalyticsProbabilities",
  patientProfiles: "clinicalAnalyticsPatientProfiles",
  matrices: "clinicalAnalyticsMatrices",
  matrixStatus: "clinicalAnalyticsMatrixStatus",
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
  CLINICAL_FEATURE_PROFILE_VERSION,
  CLINICAL_MATRIX_ENGINE_VERSION,
  CLINICAL_PROBABILITY_CONFIG,
  CLINICAL_PATTERN_MATRIX_CONFIG,
  ANALYTICS_COLLECTIONS
};
