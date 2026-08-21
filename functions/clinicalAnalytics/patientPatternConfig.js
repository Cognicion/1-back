const PATIENT_PATTERN_PROFILE_SCHEMA_VERSION = "1.0.0";
const PATIENT_PATTERN_ENGINE_VERSION = "1.0.0";
const PATIENT_PATTERN_SEMANTIC_EXTRACTOR_VERSION = "1.0.0";
const BSS_SCORING_SCHEMA_VERSION = "bss-19-items-0-2-v1";
const PATIENT_PATTERN_PROMPT_VERSION = "not_applicable_rule_based_v1";

const PATIENT_PATTERN_PROFILE_COLLECTION = "clinicalPatternProfiles";
const PATIENT_PATTERN_PROFILE_DOCUMENT = "current";

const PATTERN_ANALYSIS_STATES = Object.freeze([
  "not_analyzed",
  "analyzing",
  "current",
  "outdated",
  "error"
]);

const PATTERN_STATUSES = Object.freeze([
  "present",
  "absent",
  "historical",
  "possible",
  "contradictory",
  "insufficient_data"
]);

const PATTERN_CATALOG = Object.freeze({
  suicidal_ideation: Object.freeze({
    key: "suicidal_ideation",
    label: "Ideación suicida",
    category: "suicidality",
    variableIds: Object.freeze(["suicidal_ideation"]),
    quantitativeFeature: "suicidalIdeation"
  }),
  treatment_abandonment: Object.freeze({
    key: "treatment_abandonment",
    label: "Suspensión o abandono de tratamiento documentado",
    category: "treatment",
    variableIds: Object.freeze(["treatment_suspension"]),
    quantitativeFeature: "treatmentAbandonment"
  }),
  substance_use: Object.freeze({
    key: "substance_use",
    label: "Uso de sustancias",
    category: "substance_use",
    variableIds: Object.freeze(["substance_use"]),
    quantitativeFeature: "substanceUse"
  }),
  inadequate_family_support: Object.freeze({
    key: "inadequate_family_support",
    label: "Soporte familiar inadecuado",
    category: "family",
    variableIds: Object.freeze(["inadequate_family_support"]),
    quantitativeFeature: "inadequateFamilySupport"
  }),
  chronic_medical_condition: Object.freeze({
    key: "chronic_medical_condition",
    label: "Enfermedad médica crónica",
    category: "medical",
    variableIds: Object.freeze(["chronic_medical_condition"]),
    quantitativeFeature: "chronicMedicalCondition"
  })
});

const AFFECTED_PATTERNS_BY_COLLECTION = Object.freeze({
  notasMedicas: Object.freeze(Object.keys(PATTERN_CATALOG)),
  notas: Object.freeze(Object.keys(PATTERN_CATALOG)),
  notasClinicas: Object.freeze(Object.keys(PATTERN_CATALOG)),
  notasRapidas: Object.freeze(Object.keys(PATTERN_CATALOG)),
  historiaClinica: Object.freeze(Object.keys(PATTERN_CATALOG)),
  documentosImportados: Object.freeze(Object.keys(PATTERN_CATALOG)),
  notasFlotantes: Object.freeze(Object.keys(PATTERN_CATALOG)),
  interconsultas: Object.freeze(Object.keys(PATTERN_CATALOG)),
  tratamientos: Object.freeze(["treatment_abandonment"]),
  indicaciones: Object.freeze(["treatment_abandonment"]),
  recetas: Object.freeze(["treatment_abandonment"]),
  prescripcionesPediatricas: Object.freeze(["treatment_abandonment"]),
  escalasAplicadas: Object.freeze(["suicidal_ideation"]),
  resultadosEscalas: Object.freeze(["suicidal_ideation"]),
  eventos: Object.freeze(Object.keys(PATTERN_CATALOG))
});

const BSS_CONFIG = Object.freeze({
  instrumentId: "bss",
  name: "Escala de Ideación Suicida de Beck",
  abbreviation: "BSS",
  itemCount: 19,
  itemMinimum: 0,
  itemMaximum: 2,
  maximumScore: 38
});

module.exports = {
  AFFECTED_PATTERNS_BY_COLLECTION,
  BSS_CONFIG,
  BSS_SCORING_SCHEMA_VERSION,
  PATIENT_PATTERN_ENGINE_VERSION,
  PATIENT_PATTERN_PROFILE_COLLECTION,
  PATIENT_PATTERN_PROFILE_DOCUMENT,
  PATIENT_PATTERN_PROFILE_SCHEMA_VERSION,
  PATIENT_PATTERN_PROMPT_VERSION,
  PATIENT_PATTERN_SEMANTIC_EXTRACTOR_VERSION,
  PATTERN_ANALYSIS_STATES,
  PATTERN_CATALOG,
  PATTERN_STATUSES
};
