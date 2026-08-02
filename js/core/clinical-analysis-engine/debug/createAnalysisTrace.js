/** Crea una traza serializable de las etapas del análisis. */
export function createAnalysisTrace({ originalText, normalizedText, tokens, tokenCategories, pattern } = {}) {
  return { originalText, normalizedText, tokens, tokenCategories, pattern };
}
