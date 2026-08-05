export function buildClinicalEvidence({ documentId = "", noteId = "", pageIndex = null, blockIndex = null, startOffset = null, endOffset = null, sourceHeading = "", rawEvidence = "" } = {}) {
  return { documentId, noteId, pageIndex, blockIndex, startOffset, endOffset, sourceHeading, rawEvidence: String(rawEvidence || "").slice(0, 500) };
}

export function adaptClinicalParserResult({ value = "", rawText = value, sourceBlocks = [], sourceSection = "", evidence = {}, confidence = "not-detected", requiresReview = false, parserName = "", parserVersion = "1.0" } = {}) {
  return { value, rawText, normalizedText: String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase(), sourceBlocks, sourceSection, evidence, confidence, requiresReview, parserName, parserVersion };
}
