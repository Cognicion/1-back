import { analizarTextoClinico } from "../index.js";
import { filterPatterns } from "../patterns/filterPatterns.js";

/** Adapta el análisis central al modelo plano usado por la búsqueda de patrones. */
export function adaptarResultadoBusquedaPatrones(pattern = {}, options = {}) {
  const analysis = analizarTextoClinico(pattern.normalizedPhrase || pattern.phrase || "", options);
  return {
    ...pattern,
    displayPhrase: pattern.displayPhrase || pattern.phrase || analysis.originalText,
    isFunctionWordPattern: analysis.isFunctionWordPattern,
    lexicalSignature: analysis.lexicalSignature,
    filtersApplied: analysis.filtersApplied
  };
}

/** Aplica el filtro de búsqueda de patrones sobre resultados ya analizados. */
export function filtrarResultadosBusquedaPatrones(patterns = [], options = {}) {
  return filterPatterns(patterns, options);
}
