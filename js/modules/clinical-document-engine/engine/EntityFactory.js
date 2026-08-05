import { ClinicalEntity } from "../entities/ClinicalEntity.js";

export class EntityFactory {
  static fromCandidate(candidate = {}) {
    const entityType = candidate.candidateType || candidate.entityType || candidate.type || "";
    const value = { ...candidate };
    delete value.evidence;
    delete value.metadata;
    delete value.id;
    delete value.type;
    delete value.candidateType;
    return new ClinicalEntity({
      id: candidate.id,
      entityType,
      value,
      normalizedValue: candidate.normalizedDiagnosis || candidate.normalizedMedicationName || candidate.normalizedValue || "",
      status: candidate.status || candidate.statusSuggestion || "",
      confidence: candidate.confidence || "UNKNOWN",
      evidence: candidate.evidence || [],
      metadata: { ...(candidate.metadata || {}), sourceCandidateId: candidate.id || "" },
      parserVersion: candidate.parserVersion || candidate.metadata?.parserVersion || ""
    });
  }

  static fromCandidates(candidates = []) { return candidates.map((candidate) => EntityFactory.fromCandidate(candidate)); }
}
