import { detectDiagnosisCandidates, parseDiagnosisCandidates } from "../parsers/diagnosisParser.js";
import { validateDiagnosis } from "../validators/diagnosisValidator.js";

/** Convierte candidatos nativos MIDC al contrato legacy consumido por patient-transfer. */
export function toLegacyDiagnosisCandidate(candidate = {}) {
  const value = {
    id: candidate.id,
    rawText: candidate.evidence?.[0]?.rawText || candidate.diagnosisName || "",
    diagnosisName: candidate.diagnosisName || "",
    normalizedDiagnosisName: candidate.normalizedDiagnosis || "",
    normalizedName: candidate.diagnosisName || "",
    normalizedLabel: candidate.diagnosisName || "",
    code: candidate.code || null,
    system: candidate.system || "",
    codingSystem: candidate.system || "",
    status: candidate.status || "Confirmado",
    statusSuggestion: candidate.status || "Confirmado",
    isPrimary: Boolean(candidate.isPrimary),
    principal: Boolean(candidate.isPrimary),
    temporality: candidate.status === "Antecedente" ? "historical" : "current",
    negated: candidate.status === "Descartado",
    sourceSection: candidate.metadata?.sourceSection || "diagnosticos",
    sourceHeading: candidate.evidence?.[0]?.heading || candidate.metadata?.sourceSection || "diagnosticos",
    sourceText: candidate.evidence?.[0]?.rawText || candidate.diagnosisName || "",
    sourceLocation: { documentId: candidate.evidence?.[0]?.documentId || "", blockIndex: candidate.evidence?.[0]?.block ?? null, startOffset: candidate.evidence?.[0]?.offsetStart ?? null, endOffset: candidate.evidence?.[0]?.offsetEnd ?? null },
    evidence: candidate.evidence?.[0]?.rawText || "",
    confidence: candidate.confidence === "HIGH" ? "high" : candidate.confidence === "MEDIUM" ? "medium" : candidate.confidence === "LOW" ? "low" : "not-detected",
    requiresReview: Boolean(candidate.requiresReview),
    detectionRule: candidate.metadata?.detectionRule || "midc-diagnosis-parser",
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false,
    parser: candidate.metadata?.parser || "midc.diagnosisParser",
    parserVersion: candidate.parserVersion || "1.0"
  };
  const validation = validateDiagnosis(value);
  if (!validation.valid) value.requiresReview = true;
  return value;
}

export function adaptDiagnosisCandidates(args = {}) {
  return detectDiagnosisCandidates(args).map(toLegacyDiagnosisCandidate);
}

export function adaptDiagnosisParser(args = {}) {
  return parseDiagnosisCandidates(args);
}

export function adaptDiagnosisBlock(args = {}) {
  return parseDiagnosisCandidates(args).map(toLegacyDiagnosisCandidate);
}
