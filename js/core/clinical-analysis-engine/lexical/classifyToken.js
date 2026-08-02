import { SPANISH_CONNECTORS } from "../dictionaries/connectors.js";
import { SPANISH_PREPOSITIONS } from "../dictionaries/prepositions.js";

/** Normaliza un token únicamente para comparar contra diccionarios. */
function normalizeToken(token) {
  return String(token || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Clasifica un token usando únicamente los diccionarios léxicos disponibles. */
export function classifyToken(token) {
  const normalized = normalizeToken(token);
  if (SPANISH_PREPOSITIONS.has(normalized)) return "preposition";
  if (SPANISH_CONNECTORS.has(normalized)) return "connector";
  return "informative";
}
