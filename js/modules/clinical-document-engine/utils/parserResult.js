export function createParserResult({ parser = "", version = "1.0", value = null, confidence = "UNKNOWN", requiresReview = false, warnings = [], evidence = [], metadata = {} } = {}) {
  return { parser, version, value, confidence, requiresReview, warnings: [...warnings], evidence: [...evidence], metadata: { ...metadata } };
}
