const { CLINICAL_EVIDENCE_REGISTRY_VERSION } = require("./config");

const CLINICAL_EVIDENCE_REGISTRY = Object.freeze([
  {
    evidenceId: "tripod-ai",
    title: "TRIPOD+AI statement: updated guidance for reporting clinical prediction models that use regression or machine learning methods",
    authors: "Collins GS et al.",
    year: 2024,
    journal: "BMJ",
    doi: "10.1136/bmj-2023-078378",
    url: "https://www.bmj.com/content/385/bmj-2023-078378",
    evidenceType: "reporting_guideline",
    domain: "prediction_model_reporting",
    variablesSupported: [],
    modelSupported: ["future_predictive_models"],
    notes: "Marco de transparencia y reporte; no valida resultados de COGNICIÓN.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  },
  {
    evidenceId: "probast-ai",
    title: "PROBAST+AI: an updated quality, risk of bias, and applicability assessment tool for prediction models using regression or artificial intelligence methods",
    authors: "Moons KGM et al.",
    year: 2025,
    journal: "BMJ",
    doi: "10.1136/bmj-2024-082505",
    url: "https://www.bmj.com/content/388/bmj-2024-082505",
    evidenceType: "risk_of_bias_framework",
    domain: "model_quality",
    variablesSupported: [],
    modelSupported: ["future_predictive_models"],
    notes: "Marco para riesgo de sesgo y aplicabilidad; no es evidencia externa del producto.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  },
  {
    evidenceId: "nice-esf",
    title: "Evidence standards framework for digital health technologies",
    authors: "National Institute for Health and Care Excellence",
    year: 2022,
    journal: "NICE Guidance ECD7",
    doi: "",
    url: "https://www.nice.org.uk/corporate/ecd7",
    evidenceType: "evidence_standard",
    domain: "digital_health_evidence",
    variablesSupported: [],
    modelSupported: ["evaluation_planning"],
    notes: "Estándar de evidencia para tecnologías digitales; no es validación automática.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  },
  {
    evidenceId: "nice-rwe",
    title: "NICE real-world evidence framework",
    authors: "National Institute for Health and Care Excellence",
    year: 2022,
    journal: "NICE Guidance ECD9",
    doi: "",
    url: "https://www.nice.org.uk/corporate/ecd9",
    evidenceType: "real_world_evidence_framework",
    domain: "real_world_data",
    variablesSupported: [],
    modelSupported: ["observational_analysis"],
    notes: "Marco para calidad y uso de datos del mundo real; no establece causalidad.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  },
  {
    evidenceId: "fda-cds",
    title: "Clinical Decision Support Software",
    authors: "U.S. Food and Drug Administration",
    year: null,
    journal: "FDA Guidance",
    doi: "",
    url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software",
    evidenceType: "regulatory_methodological_reference",
    domain: "clinical_decision_support",
    variablesSupported: [],
    modelSupported: ["support_tools"],
    notes: "Referencia regulatoria/metodológica; no es autorización ni validación del producto.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  }
]);

function listClinicalEvidence() {
  return CLINICAL_EVIDENCE_REGISTRY.map((item) => ({ ...item }));
}

module.exports = { CLINICAL_EVIDENCE_REGISTRY, listClinicalEvidence };
