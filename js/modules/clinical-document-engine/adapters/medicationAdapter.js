import { detectMedicationCandidates, parseMedicationCandidates } from "../parsers/medicationParser.js?v=20260819-midc-allergy-context-v1";
import { validateMedication } from "../validators/medicationValidator.js";
import { EntityFactory } from "../engine/EntityFactory.js";
import { resolveMedicationAgainstCatalog } from "../resolvers/medicationCatalogResolver.js?v=20260819-midc-allergy-context-v1";

function asClinicalEntity(candidate = {}) {
  return candidate.entityType && candidate.value !== undefined && candidate.identity
    ? candidate
    : EntityFactory.fromCandidate(candidate);
}

/** Convierte una ClinicalEntity al contrato legacy consumido por patient-transfer. */
export function toLegacyMedicationCandidate(candidate = {}) {
  const entity = asClinicalEntity(candidate);
  const source = entity.value || {};
  const legacy = {
    id: entity.id,
    medicationId: source.catalogMedicationId || source.medicationId || source.medicationName || "",
    medicationName: source.medicationName || "",
    normalizedMedicationName: source.normalizedMedicationName || entity.normalizedValue || "",
    genericName: source.genericName || source.medicationName || "",
    catalogMedicationId: source.catalogMedicationId || null,
    catalogMatchStatus: source.catalogMatchStatus || "none",
    catalogMatchScore: source.catalogMatchScore ?? 0,
    catalogMatchMethod: source.catalogMatchMethod || "none",
    catalogAlternatives: Array.isArray(source.catalogAlternatives) ? source.catalogAlternatives : [],
    catalogPresentationMatch: source.catalogPresentationMatch ?? null,
    requiresCatalogReview: Boolean(source.requiresCatalogReview),
    presentation: source.presentation || "",
    strengthValue: source.strength ?? null,
    strengthUnit: source.strengthUnit || "",
    strengthPerValue: source.strengthPerValue ?? null,
    strengthPerUnit: source.strengthPerUnit || "",
    administrationQuantity: source.administrationQuantity ?? null,
    administrationUnit: source.administrationUnit || "",
    dose: source.strength == null ? "" : String(source.strength),
    doseUnit: source.strengthUnit || "",
    route: source.route || "",
    frequency: source.frequency || "",
    frequencyRaw: source.frequencyRaw || "",
    schedule: Array.isArray(source.schedule) ? source.schedule.map((item) => ({ ...item, administrationUnit: item.administrationUnit || item.unit || "" })) : [],
    scheduleText: (source.schedule || []).map((item) => `${item.time}${item.quantity != null ? ` · ${item.quantity} ${item.unit || ""}` : ""}`).join("; "),
    action: source.action || "Continúa",
    statusSuggestion: entity.status || source.status || source.action || "Continúa",
    temporality: entity.status === "Antecedente" ? "historical" : "current",
    date: source.date || "",
    sourceText: entity.metadata?.rawMedicationText || entity.evidence?.[0]?.rawText || "",
    rawMedicationText: entity.metadata?.rawMedicationText || entity.evidence?.[0]?.rawText || "",
    sourceSection: entity.metadata?.sourceSection || "tratamiento",
    evidence: { ...(entity.evidence?.[0] || {}), noteId: entity.metadata?.noteId || "" },
    confidence: entity.confidence === "HIGH" ? "high" : entity.confidence === "MEDIUM" ? "medium" : entity.confidence === "LOW" ? "low" : "not-detected",
    requiresReview: Boolean(source.requiresReview || entity.metadata?.validation?.valid === false),
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false,
    parser: "midc.medicationParser",
    parserVersion: source.parserVersion || entity.version?.parserVersion || "1.0"
  };
  const validation = validateMedication(legacy);
  if (!validation.valid) legacy.requiresReview = true;
  return legacy;
}

export function adaptMedicationCandidates(args = {}) {
  return detectMedicationCandidates(args).map((candidate) => resolveMedicationAgainstCatalog(candidate)).map(toLegacyMedicationCandidate);
}

export function adaptMedicationParser(args = {}) {
  return detectMedicationCandidates(args).map((candidate) => EntityFactory.fromCandidate(candidate));
}

export function adaptMedicationBlock(args = {}) {
  return parseMedicationCandidates(args).map((candidate) => resolveMedicationAgainstCatalog(candidate)).map(toLegacyMedicationCandidate);
}
