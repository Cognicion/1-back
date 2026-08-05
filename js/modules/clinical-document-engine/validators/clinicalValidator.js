import { CONFIDENCE } from "../confidence/confidenceRules.js";
export function validateClinicalResult(result = {}) {
  const errors = [];
  if (typeof result.parser !== "string" || !result.parser) errors.push("parser");
  if (typeof result.version !== "string" || !result.version) errors.push("version");
  if (!["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(result.confidence)) errors.push("confidence");
  if (!Array.isArray(result.warnings)) errors.push("warnings");
  if (!Array.isArray(result.evidence)) errors.push("evidence");
  if (typeof result.requiresReview !== "boolean") errors.push("requiresReview");
  return { valid: errors.length === 0, errors };
}
export { CONFIDENCE };
