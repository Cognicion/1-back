import { detectMedicationCandidates, parseMedicationCandidates } from "../parsers/medicationParser.js";
import { validateMedication } from "../validators/medicationValidator.js";

/** Convierte el candidato nativo al contrato consumido por patient-transfer. */
export function toLegacyMedicationCandidate(candidate = {}) {
  const legacy = {
    id: candidate.id,
    medicationId: candidate.medicationId || candidate.medicationName || "",
    medicationName: candidate.medicationName || "",
    normalizedMedicationName: candidate.normalizedMedicationName || "",
    genericName: candidate.genericName || candidate.medicationName || "",
    presentation: candidate.presentation || "",
    strengthValue: candidate.strength ?? null,
    strengthUnit: candidate.strengthUnit || "",
    strengthPerValue: candidate.strengthPerValue ?? null,
    strengthPerUnit: candidate.strengthPerUnit || "",
    administrationQuantity: candidate.administrationQuantity ?? null,
    administrationUnit: candidate.administrationUnit || "",
    dose: candidate.strength == null ? "" : String(candidate.strength),
    doseUnit: candidate.strengthUnit || "",
    route: candidate.route || "",
    frequency: candidate.frequency || "",
    frequencyRaw: candidate.frequencyRaw || "",
    schedule: Array.isArray(candidate.schedule) ? candidate.schedule.map((item) => ({ ...item, administrationUnit: item.administrationUnit || item.unit || "" })) : [],
    scheduleText: (candidate.schedule || []).map((item) => `${item.time}${item.quantity != null ? ` · ${item.quantity} ${item.unit || ""}` : ""}`).join("; "),
    action: candidate.action || "Continúa",
    statusSuggestion: candidate.status || candidate.action || "Continúa",
    temporality: candidate.status === "Antecedente" ? "historical" : "current",
    date: candidate.date || "",
    sourceText: candidate.metadata?.rawMedicationText || candidate.evidence?.[0]?.rawText || "",
    rawMedicationText: candidate.metadata?.rawMedicationText || candidate.evidence?.[0]?.rawText || "",
    sourceSection: candidate.metadata?.sourceSection || "tratamiento",
    evidence: candidate.evidence?.[0] || {},
    confidence: candidate.confidence === "HIGH" ? "high" : candidate.confidence === "MEDIUM" ? "medium" : candidate.confidence === "LOW" ? "low" : "not-detected",
    requiresReview: Boolean(candidate.requiresReview),
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false,
    parser: "midc.medicationParser",
    parserVersion: candidate.parserVersion || "1.0"
  };
  const validation = validateMedication(legacy);
  if (!validation.valid) legacy.requiresReview = true;
  return legacy;
}

export function adaptMedicationCandidates(args = {}) {
  return detectMedicationCandidates(args).map(toLegacyMedicationCandidate);
}

export function adaptMedicationParser(args = {}) {
  return detectMedicationCandidates(args);
}

export function adaptMedicationBlock(args = {}) {
  return parseMedicationCandidates(args).map(toLegacyMedicationCandidate);
}
