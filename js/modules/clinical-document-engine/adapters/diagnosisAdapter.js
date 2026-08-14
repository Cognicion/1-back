import { detectDiagnosisCandidates, parseDiagnosisCandidates } from "../parsers/diagnosisParser.js?v=20260813-diagnosis-row-prefix-filter-v2";
import { validateDiagnosis } from "../validators/diagnosisValidator.js";
import { EntityFactory } from "../engine/EntityFactory.js";

function asClinicalEntity(candidate = {}) {
  return candidate.entityType && candidate.value !== undefined && candidate.identity
    ? candidate
    : EntityFactory.fromCandidate(candidate);
}

/** Convierte una ClinicalEntity al contrato legacy consumido por patient-transfer. */
export function toLegacyDiagnosisCandidate(candidate = {}) {
  const entity = asClinicalEntity(candidate);
  const source = entity.value || {};
  const value = {
    id: entity.id,
    rawText: entity.evidence?.[0]?.rawText || source.diagnosisName || "",
    diagnosisName: source.diagnosisName || "",
    normalizedDiagnosisName: source.normalizedDiagnosis || entity.normalizedValue || "",
    normalizedName: source.diagnosisName || "",
    normalizedLabel: source.diagnosisName || "",
    code: source.code || null,
    codes: Array.isArray(source.codes) && source.codes.length
      ? [...source.codes]
      : source.code ? [source.code] : [],
    codeEvidence: entity.metadata?.codeEvidence || [],
    system: source.system || "",
    codingSystem: source.system || "",
    status: entity.status || source.status || "Confirmado",
    statusSuggestion: entity.status || source.status || "Confirmado",
    isPrimary: Boolean(source.isPrimary),
    principal: Boolean(source.isPrimary),
    temporality: entity.status === "Antecedente" ? "historical" : "current",
    negated: entity.status === "Descartado",
    sourceSection: entity.metadata?.sourceSection || "diagnosticos",
    sourceHeading: entity.evidence?.[0]?.heading || entity.metadata?.sourceSection || "diagnosticos",
    sourceText: entity.evidence?.[0]?.rawText || source.diagnosisName || "",
    sourceLocation: { documentId: entity.evidence?.[0]?.documentId || "", blockIndex: entity.evidence?.[0]?.block ?? null, startOffset: entity.evidence?.[0]?.offsetStart ?? null, endOffset: entity.evidence?.[0]?.offsetEnd ?? null },
    sourceType: entity.metadata?.sourceType || "clinical_text",
    sourceSpan: { start: entity.evidence?.[0]?.offsetStart ?? null, end: entity.evidence?.[0]?.offsetEnd ?? null, rawText: entity.evidence?.[0]?.rawText || "" },
    evidence: entity.evidence?.[0]?.rawText || "",
    confidence: entity.confidence === "HIGH" ? "high" : entity.confidence === "MEDIUM" ? "medium" : entity.confidence === "LOW" ? "low" : "not-detected",
    requiresReview: Boolean(source.requiresReview || entity.metadata?.validation?.valid === false),
    detectionRule: entity.metadata?.detectionRule || "midc-diagnosis-parser",
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false,
    parser: entity.metadata?.parser || "midc.diagnosisParser",
    parserVersion: source.parserVersion || entity.version?.parserVersion || "1.0"
  };
  const validation = validateDiagnosis(value);
  if (!validation.valid) value.requiresReview = true;
  return value;
}

export function adaptDiagnosisCandidates(args = {}) {
  return detectDiagnosisCandidates(args).map(toLegacyDiagnosisCandidate);
}

export function adaptDiagnosisParser(args = {}) {
  return detectDiagnosisCandidates(args).map((candidate) => EntityFactory.fromCandidate(candidate));
}

export function adaptDiagnosisBlock(args = {}) {
  return parseDiagnosisCandidates(args).map(toLegacyDiagnosisCandidate);
}
