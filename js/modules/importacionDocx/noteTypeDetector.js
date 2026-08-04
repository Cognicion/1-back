import { NOTE_TYPE_RULES } from "./docxImportConfig.js";

function normalizar(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function primeraLineaSignificativa(texto = "") {
  return String(texto || "")
    .split(/\n+/)
    .map((linea) => linea.trim())
    .find(Boolean) || "";
}

export function sugerirTipoNota({ textoPlano = "", secciones = {} } = {}) {
  const texto = normalizar(`${textoPlano}\n${Object.keys(secciones).join(" ")}`);
  const titulo = normalizar(primeraLineaSignificativa(textoPlano));
  const resultados = NOTE_TYPE_RULES.map((regla) => {
    const puntosTitulo = regla.terms.reduce(
      (total, term) => total + (titulo.includes(normalizar(term)) ? 10 : 0),
      0
    );
    const puntos = regla.terms.reduce(
      (total, term) => total + (texto.includes(normalizar(term)) ? 1 : 0),
      puntosTitulo
    );
    return { ...regla, puntos };
  }).sort((a, b) => b.puntos - a.puntos);

  const mejor = resultados[0];
  return mejor?.puntos > 0
    ? {
        key: mejor.key,
        label: mejor.label,
        confianza: mejor.puntos,
        candidatos: resultados.filter((item) => item.puntos > 0)
      }
    : { key: "nota_clinica", label: "Nota clinica", confianza: 0, candidatos: [] };
}

export { NOTE_TYPE_RULES };
