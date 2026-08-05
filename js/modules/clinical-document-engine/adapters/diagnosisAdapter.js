import { detectDiagnosisCandidates } from "../../patient-transfer/parsing/clinicalCandidateParser.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";

export function adaptDiagnosisParser({ sections = {}, fullText = "", sourceBlocks = [], documentId = "", noteId = "" } = {}) {
  return detectDiagnosisCandidates({ sections, fullText, sourceBlocks, documentId }).map((candidate) => {
    const confidence = evaluateConfidence({ table: candidate.detectionRule === "diagnosis-entry-near-code", explicitHeading: candidate.sourceSection === "diagnosticos", freeText: candidate.sourceSection !== "diagnosticos" });
    return new ClinicalCandidate({ id: candidate.id || `${noteId}-diagnosis`, type: "diagnosis", value: candidate, confidence, requiresReview: candidate.requiresReview || requiresReviewForConfidence(confidence), warnings: candidate.code ? [] : ["missing-code"], evidence: [candidate.sourceText || candidate.rawText], metadata: { noteId, sourceSection: candidate.sourceSection } });
  });
}
