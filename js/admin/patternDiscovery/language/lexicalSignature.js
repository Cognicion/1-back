import { SPANISH_CONNECTORS } from "./patternConnectors.js";
import { PROTECTED_PREPOSITIONS, SPANISH_PREPOSITIONS } from "./patternPrepositions.js";

function normalizeToken(token) {
  return String(token || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizedSet(values) {
  return new Set([...values].map(normalizeToken));
}

export function buildLexicalSignature(normalizedPhrase, { removeConnectors = true, removePrepositions = true } = {}) {
  const connectors = normalizedSet(SPANISH_CONNECTORS);
  const prepositions = normalizedSet(SPANISH_PREPOSITIONS);
  const protectedPrepositions = normalizedSet(PROTECTED_PREPOSITIONS);
  return String(normalizedPhrase || "").split(/\s+/).map((token) => token.trim()).filter(Boolean).filter((token) => {
    const normalizedToken = normalizeToken(token);
    if (protectedPrepositions.has(normalizedToken)) return true;
    if (prepositions.has(normalizedToken)) return !removePrepositions;
    if (removeConnectors && connectors.has(normalizedToken)) return false;
    return true;
  }).join(" ");
}
