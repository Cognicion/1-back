/** Preposiciones editables usadas por el análisis léxico. */
export const SPANISH_PREPOSITIONS = new Set([
  "a", "ante", "bajo", "cabe", "con", "contra", "de", "desde", "durante", "en", "entre", "hacia", "hasta", "mediante", "para", "por", "según", "sin", "so", "sobre", "tras", "versus", "vía"
]);

/** Preposiciones que nunca deben eliminarse por protección clínica. */
export const PROTECTED_PREPOSITIONS = new Set(["sin"]);
