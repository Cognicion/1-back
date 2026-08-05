export class ClinicalSection {
  constructor({ key = "", value = "", rawText = value, evidence = [], confidence = "UNKNOWN", requiresReview = false } = {}) {
    Object.assign(this, { key, value, rawText, evidence: [...evidence], confidence, requiresReview });
  }
}
