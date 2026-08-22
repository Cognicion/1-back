const CLINICAL_ANALYTICS_SCHEMA_VERSION = "1.2";
const CLINICAL_EXTRACTOR_VERSION = "1.1.0";
const CLINICAL_PATTERN_ENGINE_VERSION = "2.1.0";
const CLINICAL_PROBABILITY_ENGINE_VERSION = "1.1.0";
const CLINICAL_EVIDENCE_REGISTRY_VERSION = "1.4.0";
const CLINICAL_FEATURE_PROFILE_VERSION = "1.1.0";
const CLINICAL_MATRIX_ENGINE_VERSION = "2.0.0";
const CLINICAL_PRESENTATION_VERSION = "1.1.0";
const CLINICAL_EMBEDDING_ENGINE_VERSION = "1.0.0";
const CLINICAL_SEMANTIC_RELATION_VERSION = "1.1.0";

const CLINICAL_RECORD_SOURCE_CATALOG = Object.freeze({
  patientProfile: Object.freeze({ label: "Perfil clínico", domain: "perfil_clinico", rootDocument: true }),
  notasMedicas: Object.freeze({ label: "Notas médicas", domain: "documentacion" }),
  notas: Object.freeze({ label: "Notas", domain: "documentacion" }),
  notasClinicas: Object.freeze({ label: "Notas clínicas", domain: "documentacion" }),
  notasRapidas: Object.freeze({ label: "Notas rápidas", domain: "documentacion" }),
  historiaClinica: Object.freeze({ label: "Historia clínica", domain: "antecedentes" }),
  documentosImportados: Object.freeze({ label: "Documentos importados", domain: "documentacion" }),
  notasFlotantes: Object.freeze({ label: "Notas de seguimiento", domain: "documentacion" }),
  interconsultas: Object.freeze({ label: "Interconsultas", domain: "eventos" }),
  tratamientos: Object.freeze({ label: "Tratamientos", domain: "tratamientos" }),
  indicaciones: Object.freeze({ label: "Indicaciones", domain: "tratamientos" }),
  recetas: Object.freeze({ label: "Recetas", domain: "tratamientos" }),
  prescripcionesPediatricas: Object.freeze({ label: "Prescripciones pediátricas", domain: "tratamientos" }),
  estudios: Object.freeze({ label: "Estudios", domain: "estudios" }),
  solicitudesEstudios: Object.freeze({ label: "Solicitudes de estudios", domain: "estudios" }),
  laboratorios: Object.freeze({ label: "Laboratorios", domain: "laboratorios" }),
  signosVitales: Object.freeze({ label: "Signos vitales", domain: "signos_vitales" }),
  medicionesPediatricas: Object.freeze({ label: "Mediciones pediátricas", domain: "signos_vitales" }),
  escalasAplicadas: Object.freeze({ label: "Escalas aplicadas", domain: "escalas" }),
  resultadosEscalas: Object.freeze({ label: "Resultados de escalas", domain: "escalas" }),
  rehabilitacionResultados: Object.freeze({ label: "Resultados de rehabilitación", domain: "rehabilitacion" }),
  eventos: Object.freeze({ label: "Eventos clínicos", domain: "eventos" })
});

const CLINICAL_RECORD_COLLECTIONS = Object.freeze(
  Object.keys(CLINICAL_RECORD_SOURCE_CATALOG)
    .filter((sourceId) => CLINICAL_RECORD_SOURCE_CATALOG[sourceId].rootDocument !== true)
);

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
  confidenceLevel: 0.95,
  pearsonSpearmanAgreementTolerance: 0.15,
  lowCoverageThreshold: 0.25,
  minimumUtilityScore: 0.45,
  highUtilityScore: 0.75,
  moderateUtilityScore: 0.6,
  robustnessFolds: 5,
  minimumRobustnessObservations: 8,
  minimumRobustnessScore: 0.45,
  utilityReferenceSampleSize: 100,
  maximumTemporalLagDays: 730,
  featureLayerShares: Object.freeze({
    clinical: 0.65,
    documentation: 0.2,
    operations: 0.15
  }),
  utilityWeights: Object.freeze({
    effect: 0.2,
    evidence: 0.18,
    robustness: 0.2,
    sample: 0.12,
    coverage: 0.12,
    novelty: 0.1,
    information: 0.08
  }),
  maxCategories: 12,
  maxProfileFeatures: 260,
  maxMatrixFeatures: 160,
  maxAssociations: 500,
  maxPresenceAssociations: 300,
  maxTemporalPatterns: 300,
  maxTemporalPairsPerPatient: 240,
  maxPatients: 5000
});

const CLINICAL_EMBEDDING_CONFIG = Object.freeze({
  model: "text-embedding-3-small",
  dimensions: 512,
  maxFragmentCharacters: 4800,
  maxFragmentsPerRecord: 12,
  requestBatchSize: 32,
  nearestNeighbors: 20,
  minimumSimilarity: 0.78,
  minimumCrossPatientPairs: 3,
  minimumSemanticUtilityScore: 0.5,
  moderateSemanticUtilityScore: 0.62,
  highSemanticUtilityScore: 0.78,
  semanticUtilityReferencePairs: 20,
  rebuildBatchRecords: 20,
  processingLeaseMs: 5 * 60 * 1000,
  maxRelationsRead: 1500
});

const ANALYTICS_COLLECTIONS = Object.freeze({
  variables: "clinicalAnalyticsVariables",
  patterns: "clinicalAnalyticsPatterns",
  relationships: "clinicalAnalyticsRelationships",
  probabilities: "clinicalAnalyticsProbabilities",
  patientProfiles: "clinicalAnalyticsPatientProfiles",
  matrices: "clinicalAnalyticsMatrices",
  matrixStatus: "clinicalAnalyticsMatrixStatus",
  embeddings: "clinicalAnalyticsEmbeddings",
  embeddingManifests: "clinicalAnalyticsEmbeddingManifests",
  embeddingStatus: "clinicalAnalyticsEmbeddingStatus",
  embeddingSources: "clinicalAnalyticsEmbeddingSources",
  embeddingJobs: "clinicalAnalyticsEmbeddingJobs",
  semanticRelations: "clinicalAnalyticsSemanticRelations",
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
  CLINICAL_PRESENTATION_VERSION,
  CLINICAL_EMBEDDING_ENGINE_VERSION,
  CLINICAL_SEMANTIC_RELATION_VERSION,
  CLINICAL_PROBABILITY_CONFIG,
  CLINICAL_PATTERN_MATRIX_CONFIG,
  CLINICAL_EMBEDDING_CONFIG,
  CLINICAL_RECORD_SOURCE_CATALOG,
  CLINICAL_RECORD_COLLECTIONS,
  ANALYTICS_COLLECTIONS
};
