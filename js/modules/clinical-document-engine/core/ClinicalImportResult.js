export class ClinicalImportResult {
  constructor({ document = null, notes = [], candidates = [], warnings = [], confidence = "UNKNOWN", requiresReview = false } = {}) {
    Object.assign(this, { document, notes: [...notes], candidates: [...candidates], warnings: [...warnings], confidence, requiresReview });
  }
}
