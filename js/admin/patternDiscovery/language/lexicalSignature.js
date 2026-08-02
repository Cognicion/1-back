import { analizarTextoClinico } from "../../../core/clinical-analysis-engine/index.js";

/** Adaptador de compatibilidad para llamadas antiguas del módulo de patrones. */
export function buildLexicalSignature(normalizedPhrase, options = {}) {
  return analizarTextoClinico(normalizedPhrase, options).lexicalSignature;
}
