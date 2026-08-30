import { EntityFactory } from "../engine/EntityFactory.js";
import { EntityNormalizer } from "../engine/EntityNormalizer.js";
import { EntityValidationEngine } from "../engine/EntityValidationEngine.js";
import { parseTreatmentPlan } from "../parsers/treatmentPlanParser.js?v=20260830-study-diagnosis-medication-dedup-v1";
import { toLegacyMedicationCandidate } from "./medicationAdapter.js?v=20260830-study-diagnosis-medication-dedup-v1";
import { resolveMedicationCandidatesAgainstCatalog } from "../resolvers/medicationCatalogResolver.js?v=20260819-midc-allergy-context-v1";

const normalizer = new EntityNormalizer();
const validator = new EntityValidationEngine();

export function toLegacyTreatmentPlanInstruction(candidate = {}) {
  const entity = candidate.entityType ? candidate : EntityFactory.fromCandidate(candidate);
  normalizer.normalize(entity);
  const validation = validator.validate(entity);
  const source = entity.value || {};
  return {
    id: entity.id,
    entityType: "treatmentPlanInstruction",
    instructionType: source.instructionType || "otherInstruction",
    text: source.text || source.value || "",
    value: source.value || source.text || "",
    normalizedValue: source.normalizedValue || entity.normalizedValue || "",
    status: entity.status || source.status || "detected",
    priority: source.priority || "",
    order: source.order || null,
    date: source.date || "",
    time: source.time || "",
    confidence: entity.confidence,
    requiresReview: Boolean(entity.requiresReview || !validation.valid),
    include: true,
    selectedForImport: false,
    evidence: entity.evidence?.[0] || {},
    metadata: entity.metadata,
    parserVersion: source.parserVersion || entity.version?.parserVersion || "1.0"
  };
}

export function adaptTreatmentPlanCandidates(candidates = []) {
  return candidates.map((candidate) => toLegacyTreatmentPlanInstruction(candidate));
}

export function adaptTreatmentPlan(args = {}) {
  const result = parseTreatmentPlan(args);
  const resolvedMedicationCandidates = resolveMedicationCandidatesAgainstCatalog(result.medicationCandidates);
  return { ...result, instructions: adaptTreatmentPlanCandidates(result.candidates), medicationCandidates: resolvedMedicationCandidates.map(toLegacyMedicationCandidate) };
}

export class TreatmentPlanAdapter {
  parse(args = {}) { return adaptTreatmentPlan(args); }
  toLegacy(candidates = []) { return adaptTreatmentPlanCandidates(candidates); }
}
