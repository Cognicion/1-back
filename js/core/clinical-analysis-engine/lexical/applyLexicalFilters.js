import { SPANISH_CONNECTORS } from "../dictionaries/connectors.js";
import { PROTECTED_PREPOSITIONS, SPANISH_PREPOSITIONS } from "../dictionaries/prepositions.js";

/** Normaliza un token únicamente para aplicar filtros. */
function normalizeToken(token) {
  return String(token || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Construye una firma léxica sin modificar la frase de presentación. */
export function applyLexicalFilters(tokens = [], { removeConnectors = true, removePrepositions = true } = {}) {
  return tokens.filter((token) => {
    const normalized = normalizeToken(token);
    if (PROTECTED_PREPOSITIONS.has(normalized)) return true;
    if (SPANISH_PREPOSITIONS.has(normalized)) return !removePrepositions;
    if (removeConnectors && SPANISH_CONNECTORS.has(normalized)) return false;
    return true;
  });
}
