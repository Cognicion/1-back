/** Filtra resultados de patrones sin modificar el índice ni consultar datos externos. */
export function filterPatterns(patterns = [], { threshold = 3, includeConnectors = false } = {}) {
  const minimum = Number.isInteger(threshold) ? threshold : 3;
  return patterns.filter((pattern) => Number(pattern.frequency ?? pattern.occurrenceCount ?? 0) >= minimum && (includeConnectors || pattern.isFunctionWordPattern !== true));
}
