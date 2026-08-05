import { parseClinicalSections } from "../../patient-transfer/parsing/clinicalSectionParser.js";
import { BOUNDARY_ALIASES } from "../boundaries/boundaryAliases.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { createParserResult } from "../utils/parserResult.js";

export function adaptMentalExamParser(noteSegment = {}) {
  const parsed = parseClinicalSections(noteSegment.blocks || [], { noteSegment });
  const value = parsed.secciones?.examenMental || "";
  const confidence = value ? evaluateConfidence({ explicitHeading: Boolean(parsed.encabezados?.some((heading) => heading.key === "examenMental")) }) : "UNKNOWN";
  return createParserResult({ parser: "patient-transfer.clinicalSectionParser.mentalExam", version: "1.0", value, confidence, requiresReview: requiresReviewForConfidence(confidence), warnings: value ? [] : ["not-detected"], evidence: [{ noteId: noteSegment.id || "", heading: "examen mental", rawText: value }], metadata: { sourceSection: "examenMental", boundaryAliases: BOUNDARY_ALIASES.mentalExam } });
}
