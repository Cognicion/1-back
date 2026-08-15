const { CLINICAL_EVIDENCE_REGISTRY_VERSION } = require("./config");

const CLINICAL_EVIDENCE_REGISTRY = Object.freeze([
  {
    evidenceId: "tripod-ai",
    title: "TRIPOD+AI statement: updated guidance for reporting clinical prediction models that use regression or machine learning methods",
    titleEs: "Declaración TRIPOD+AI: guía actualizada para reportar modelos de predicción clínica con regresión o aprendizaje automático",
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
    titleEs: "PROBAST+AI: herramienta actualizada para evaluar calidad, riesgo de sesgo y aplicabilidad de modelos predictivos",
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
    titleEs: "Marco de estándares de evidencia para tecnologías de salud digital",
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
    titleEs: "Marco NICE de evidencia del mundo real",
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
    titleEs: "Software de apoyo a decisiones clínicas",
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
  },
  {
    evidenceId: "nist-sematech-statistics-handbook",
    title: "NIST/SEMATECH e-Handbook of Statistical Methods",
    titleEs: "Manual electrónico NIST/SEMATECH de métodos estadísticos",
    authors: "National Institute of Standards and Technology",
    year: null,
    journal: "NIST",
    doi: "10.18434/M32189",
    url: "https://www.nist.gov/programs-projects/nistsematech-engineering-statistics-handbook",
    evidenceType: "statistical_methodology",
    domain: "association_measurement",
    variablesSupported: ["continuous", "ordinal"],
    modelSupported: ["pearson_correlation", "spearman_rank_correlation"],
    notes: "Referencia metodologica para medidas de asociacion; no convierte correlacion en causalidad.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  },
  {
    evidenceId: "benjamini-hochberg-1995",
    title: "Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing",
    titleEs: "Control de la tasa de falsos descubrimientos: un enfoque práctico para comparaciones múltiples",
    authors: "Benjamini Y, Hochberg Y",
    year: 1995,
    journal: "Journal of the Royal Statistical Society: Series B",
    doi: "10.1111/j.2517-6161.1995.tb02031.x",
    url: "https://doi.org/10.1111/j.2517-6161.1995.tb02031.x",
    evidenceType: "statistical_methodology",
    domain: "multiple_testing",
    variablesSupported: [],
    modelSupported: ["false_discovery_rate_control"],
    notes: "Se usa para ajustar valores p al explorar muchos pares; no valida por si solo una asociacion.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  },
  {
    evidenceId: "asa-p-values-2016",
    title: "The ASA Statement on p-Values: Context, Process, and Purpose",
    titleEs: "Declaración de la ASA sobre valores p: contexto, proceso y propósito",
    authors: "Wasserstein RL, Lazar NA",
    year: 2016,
    journal: "The American Statistician",
    doi: "10.1080/00031305.2016.1154108",
    url: "https://www.amstat.org/asa/files/pdfs/p-valuestatement.pdf",
    evidenceType: "statistical_interpretation_guidance",
    domain: "statistical_interpretation",
    variablesSupported: [],
    modelSupported: ["association_interpretation", "multiple_testing_reporting"],
    notes: "Los valores p o q no miden la magnitud ni la importancia clínica y no deben sostener por sí solos una conclusión.",
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION
  }
]);

function listClinicalEvidence() {
  return CLINICAL_EVIDENCE_REGISTRY.map((item) => ({ ...item }));
}

module.exports = { CLINICAL_EVIDENCE_REGISTRY, listClinicalEvidence };
