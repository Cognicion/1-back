import { applyLexicalFilters } from "../lexical/applyLexicalFilters.js";

/** Construye el resultado léxico estructurado de una frase. */
export function buildPattern({ originalText = "", normalizedText = "", tokens = [] } = {}, options = {}) {
  const filteredTokens = applyLexicalFilters(tokens, options);
  return {
    displayPhrase: originalText,
    normalizedPhrase: normalizedText,
    lexicalSignature: filteredTokens.join(" "),
    filtersApplied: { removeConnectors: options.removeConnectors !== false, removePrepositions: options.removePrepositions !== false }
  };
}
