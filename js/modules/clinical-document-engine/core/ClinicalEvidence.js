export class ClinicalEvidence {
  constructor({ documentId = "", page = null, block = null, offsetStart = null, offsetEnd = null, heading = "", rawText = "", confidence = "UNKNOWN" } = {}) {
    Object.assign(this, { documentId, page, block, offsetStart, offsetEnd, heading, rawText, confidence });
  }
}
