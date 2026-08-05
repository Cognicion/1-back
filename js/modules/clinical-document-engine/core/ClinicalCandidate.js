export class ClinicalCandidate {
  constructor({ id = "", type = "", value = null, confidence = "UNKNOWN", requiresReview = false, warnings = [], evidence = [], metadata = {} } = {}) {
    Object.assign(this, { id, type, value, confidence, requiresReview, warnings: [...warnings], evidence: [...evidence], metadata: { ...metadata } });
  }
}
