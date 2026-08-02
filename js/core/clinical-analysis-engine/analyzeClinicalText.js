import { normalizeText } from "./normalization/normalizeText.js";
import { tokenizeText } from "./tokenization/tokenizeText.js";
import { classifyToken } from "./lexical/classifyToken.js";
import { buildPattern } from "./patterns/buildPattern.js";
import { createAnalysisTrace } from "./debug/createAnalysisTrace.js";
import { SPANISH_CONNECTORS } from "./dictionaries/connectors.js";

/**
 * Analiza texto clínico sin efectos secundarios ni dependencias de interfaz.
 * @param {string} text Texto original.
 * @param {object} options Opciones de filtros léxicos.
 * @returns {object} Resultado estructurado y trazable.
 */
export function analizarTextoClinico(text = "", options = {}) {
  const originalText = String(text || "");
  const normalizedText = normalizeText(originalText);
  const tokens = tokenizeText(normalizedText);
  const tokenCategories = tokens.map((token) => ({ token, category: classifyToken(token) }));
  const pattern = buildPattern({ originalText, normalizedText, tokens }, options);
  const normalizedConnectors = new Set([...SPANISH_CONNECTORS].map((token) => token.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
  const isFunctionWordPattern = tokens.length === 0 || tokens.every((token) => normalizedConnectors.has(token));
  return { originalText, normalizedText, tokens, tokenCategories, isFunctionWordPattern, ...pattern, trace: createAnalysisTrace({ originalText, normalizedText, tokens, tokenCategories, pattern }) };
}
