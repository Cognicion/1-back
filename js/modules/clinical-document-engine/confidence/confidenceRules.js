export const CONFIDENCE = Object.freeze({ HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW", UNKNOWN: "UNKNOWN" });

export function confidenceFromEvidence({ explicitHeading = false, table = false, inferred = false, freeText = false } = {}) {
  if (table || explicitHeading) return CONFIDENCE.HIGH;
  if (inferred) return CONFIDENCE.MEDIUM;
  if (freeText) return CONFIDENCE.LOW;
  return CONFIDENCE.UNKNOWN;
}
