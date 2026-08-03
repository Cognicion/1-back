import { NOTE_TYPE_RULES } from "./docxImportConfig.js";

function normalizar(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function sugerirTipoNota({ textoPlano = "", secciones = {} } = {}) {
  const texto = normalizar(`${textoPlano}\n${Object.keys(secciones).join(" ")}`);
  const resultados = NOTE_TYPE_RULES.map((regla) => {
    const puntos = regla.terms.reduce((total, term) => total + (texto.includes(normalizar(term)) ? 1 : 0), 0);
    return { ...regla, puntos };
  }).sort((a, b) => b.puntos - a.puntos);

  const mejor = resultados[0];
  return mejor?.puntos > 0
    ? { key: mejor.key, label: mejor.label, confianza: mejor.puntos, candidatos: resultados.filter((item) => item.puntos > 0) }
    : { key: "nota_clinica", label: "Nota clinica", confianza: 0, candidatos: [] };
}

export { NOTE_TYPE_RULES };
