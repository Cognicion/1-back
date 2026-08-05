import { parseSubjectiveSection } from "../../patient-transfer/parsing/subjectiveSectionParser.js";
import { BOUNDARY_ALIASES } from "../boundaries/boundaryAliases.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { createParserResult } from "../utils/parserResult.js";

export function adaptSubjectiveParser(noteSegment = {}) {
  const parsed = parseSubjectiveSection({ noteSegment });
  const confidence = parsed.text ? evaluateConfidence({ explicitHeading: Boolean(parsed.matchedHeading), inferred: parsed.detectionMethod !== "explicit-heading" }) : "UNKNOWN";
  return createParserResult({ parser: "patient-transfer.subjectiveSectionParser", version: "1.0", value: parsed.text || "", confidence, requiresReview: requiresReviewForConfidence(confidence), warnings: parsed.text ? [] : ["not-detected"], evidence: [{ noteId: noteSegment.id || "", startBlock: parsed.startBlockIndex, endBlock: parsed.endBlockIndex, heading: parsed.matchedHeading, rawText: parsed.text || "" }], metadata: { sourceSection: "subjetivo", boundaryAliases: BOUNDARY_ALIASES.subjective } });
}
