import { CONFIDENCE, confidenceFromEvidence } from "./confidenceRules.js";
export { CONFIDENCE };
export function evaluateConfidence(evidence = {}) { return confidenceFromEvidence(evidence); }
export function requiresReviewForConfidence(value = CONFIDENCE.UNKNOWN) { return value === CONFIDENCE.LOW || value === CONFIDENCE.UNKNOWN; }
