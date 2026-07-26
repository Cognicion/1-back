import { crearHuellaConceptual } from "./eventosDetectadosUtils.js";

export function deduplicarEventosDetectados(sugerencias = [], pacienteId = "") {
  const mapa = new Map();
  for (const sugerencia of sugerencias) {
    const hashConceptual = sugerencia.hashConceptual || crearHuellaConceptual({ pacienteId, ...sugerencia });
    const existente = mapa.get(hashConceptual);
    if (!existente) {
      mapa.set(hashConceptual, { ...sugerencia, hashConceptual });
      continue;
    }
    const referencias = [
      ...(existente.referenciasOrigen || []),
      { tipo: sugerencia.origenTipo, subtipo: sugerencia.origenSubtipo, id: sugerencia.origenId, fecha: sugerencia.origenFechaISO }
    ].filter((item, index, arr) => item.id && arr.findIndex((otro) => `${otro.tipo}:${otro.id}` === `${item.tipo}:${item.id}`) === index);
    mapa.set(hashConceptual, {
      ...existente,
      confianza: Math.max(Number(existente.confianza) || 0, Number(sugerencia.confianza) || 0),
      referenciasOrigen: referencias
    });
  }
  return [...mapa.values()];
}
