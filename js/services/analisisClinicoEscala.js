import { analizarTextoClinico } from "../core/clinical-analysis-engine/analyzeClinicalText.js";

function textoSeguro(valor = "") {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

export function analizarResultadoEscala({ escala, puntaje, puntajeMaximo, interpretacion, dominios = {}, respuestas = [], observaciones = "" } = {}) {
  const resumenRespuestas = respuestas
    .filter((respuesta) => respuesta && respuesta.valor !== null && respuesta.valor !== undefined)
    .map((respuesta) => `${textoSeguro(respuesta.item)}: ${respuesta.valor}`)
    .join(". ");
  const texto = [`Escala ${textoSeguro(escala?.nombre)}.`, `Puntaje ${puntaje}${puntajeMaximo ? ` de ${puntajeMaximo}` : ""}.`, `Interpretacion: ${textoSeguro(interpretacion)}.`, resumenRespuestas, textoSeguro(observaciones)]
    .filter(Boolean).join(" ");
  const analisis = analizarTextoClinico(texto, { detectPatterns: true, detectEvents: true, detectNegations: true, detectTemporality: true });
  return {
    version: "escala-clinica-v1",
    fuente: "resultado_escala",
    escalaId: escala?.id || "",
    escalaNombre: escala?.nombre || "",
    puntaje,
    puntajeMaximo: puntajeMaximo ?? "",
    interpretacion: textoSeguro(interpretacion),
    dominios,
    patrones: analisis.lexicalSignature ? [{ tipo: "firma_lexica", valor: analisis.lexicalSignature }] : [],
    conceptos: analisis.concepts || analisis.conceptos || [],
    eventos: analisis.events || analisis.eventos || [],
    textoAnalizado: texto,
    generadoEn: new Date().toISOString()
  };
}
