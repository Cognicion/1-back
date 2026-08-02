import { SPANISH_CONNECTORS } from "./language/patternConnectors.js";

export const SPANISH_FUNCTION_WORDS = SPANISH_CONNECTORS;

export function isFunctionWordPattern(normalizedPhrase, functionWords = SPANISH_FUNCTION_WORDS) {
  const tokens = String(normalizedPhrase || "").split(/\s+/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) return true;
  const normalizedFunctionWords = new Set([...functionWords].map((token) => String(token).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
  return tokens.every((token) => normalizedFunctionWords.has(String(token).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
}
