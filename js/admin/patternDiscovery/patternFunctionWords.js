import { analizarTextoClinico } from "../../core/clinical-analysis-engine/index.js";
import { SPANISH_CONNECTORS } from "../../core/clinical-analysis-engine/dictionaries/connectors.js";

export const SPANISH_FUNCTION_WORDS = SPANISH_CONNECTORS;

export function isFunctionWordPattern(normalizedPhrase, functionWords = SPANISH_FUNCTION_WORDS) {
  if (functionWords !== SPANISH_FUNCTION_WORDS) {
    const tokens = String(normalizedPhrase || "").split(/\s+/).map((token) => token.trim()).filter(Boolean);
    const normalized = new Set([...functionWords].map((token) => String(token).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
    return tokens.length === 0 || tokens.every((token) => normalized.has(String(token).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
  }
  return analizarTextoClinico(normalizedPhrase).isFunctionWordPattern;
}
