export function normalizarTextoFrecuencia(texto = "") {
  return String(texto || "")
    .replace(/\bvezes\b/gi, "veces")
    .replace(/\bveses\b/gi, "veces")
    .replace(/\b1\s+veces\b/gi, "1 vez")
    .replace(/\b1\s+vezes\b/gi, "1 vez")
    .replace(/\b1\s+veses\b/gi, "1 vez")
    .replace(/\bvez\s+al\s+dia\b/gi, "vez al día")
    .replace(/\bveces\s+al\s+dia\b/gi, "veces al día")
    .replace(/\btomas\s+al\s+dia\b/gi, "tomas al día")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarTratamientoFrecuencia(tratamiento = {}) {
  return {
    ...tratamiento,
    frecuencia: normalizarTextoFrecuencia(tratamiento.frecuencia)
  };
}
