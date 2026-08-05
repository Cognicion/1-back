import { detectTreatmentCandidates } from "../../patient-transfer/parsing/clinicalCandidateParser.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";

export function adaptMedicationParser({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog, documentId = "", noteId = "", date = "" } = {}) {
  return detectTreatmentCandidates({ sections, fullText, sourceBlocks, medicationCatalog, documentId, date }).map((candidate) => {
    const confidence = evaluateConfidence({ table: candidate.detectionRule === "medication-list", explicitHeading: Boolean(candidate.sourceSection), freeText: !candidate.dose && !candidate.strengthValue });
    return new ClinicalCandidate({ id: candidate.id || `${noteId}-medication`, type: "medication", value: candidate, confidence, requiresReview: requiresReviewForConfidence(confidence), warnings: candidate.dose || candidate.strengthValue ? [] : ["missing-dose"], evidence: [candidate.sourceText || candidate.rawText], metadata: { noteId, sourceSection: candidate.sourceSection } });
  });
}
