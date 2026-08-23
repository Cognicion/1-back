export const FORMATOS_HOJA = Object.freeze([
  Object.freeze({ id: "A4", etiqueta: "A4", anchoMm: 210, altoMm: 297 }),
  Object.freeze({ id: "CARTA", etiqueta: "Carta", anchoMm: 215.9, altoMm: 279.4 }),
  Object.freeze({ id: "LEGAL", etiqueta: "Legal / Oficio", anchoMm: 215.9, altoMm: 355.6 }),
  Object.freeze({ id: "A3", etiqueta: "A3", anchoMm: 297, altoMm: 420 }),
  Object.freeze({ id: "A5", etiqueta: "A5", anchoMm: 148, altoMm: 210 }),
  Object.freeze({ id: "TABLOIDE", etiqueta: "Tabloide", anchoMm: 279.4, altoMm: 431.8 }),
  Object.freeze({ id: "EJECUTIVO", etiqueta: "Ejecutivo", anchoMm: 184.2, altoMm: 266.7 })
]);

export const DISPOSICION_HOJA_PREDETERMINADA = Object.freeze({
  formato: "A4",
  orientacion: "vertical",
  zoom: 100,
  margenes: Object.freeze({ superior: 20, derecho: 20, inferior: 20, izquierdo: 20 }),
  tamanioFuente: 12
});

const FORMATOS_POR_ID = new Map(FORMATOS_HOJA.map((formato) => [formato.id, formato]));

function numeroEnRango(valor, predeterminado, minimo, maximo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return predeterminado;
  return Math.min(maximo, Math.max(minimo, numero));
}

export function normalizarDisposicionHoja(valor = {}) {
  const predeterminada = DISPOSICION_HOJA_PREDETERMINADA;
  const formato = FORMATOS_POR_ID.has(valor?.formato) ? valor.formato : predeterminada.formato;
  const orientacion = valor?.orientacion === "horizontal" ? "horizontal" : "vertical";
  const margenes = valor?.margenes || {};
  return Object.freeze({
    formato,
    orientacion,
    zoom: numeroEnRango(valor?.zoom, predeterminada.zoom, 25, 800),
    margenes: Object.freeze({
      superior: numeroEnRango(margenes.superior, predeterminada.margenes.superior, 5, 50),
      derecho: numeroEnRango(margenes.derecho, predeterminada.margenes.derecho, 5, 50),
      inferior: numeroEnRango(margenes.inferior, predeterminada.margenes.inferior, 5, 50),
      izquierdo: numeroEnRango(margenes.izquierdo, predeterminada.margenes.izquierdo, 5, 50)
    }),
    tamanioFuente: numeroEnRango(valor?.tamanioFuente, predeterminada.tamanioFuente, 6, 96)
  });
}

export function obtenerMedidasHoja(disposicion = {}) {
  const normalizada = normalizarDisposicionHoja(disposicion);
  const formato = FORMATOS_POR_ID.get(normalizada.formato) || FORMATOS_POR_ID.get("A4");
  const horizontal = normalizada.orientacion === "horizontal";
  return Object.freeze({
    ...formato,
    anchoMm: horizontal ? formato.altoMm : formato.anchoMm,
    altoMm: horizontal ? formato.anchoMm : formato.altoMm
  });
}

export function etiquetaDisposicionHoja(disposicion = {}) {
  const normalizada = normalizarDisposicionHoja(disposicion);
  const medidas = obtenerMedidasHoja(normalizada);
  const orientacion = normalizada.orientacion === "horizontal" ? "horizontal" : "vertical";
  return `${medidas.etiqueta} · ${medidas.anchoMm.toFixed(1)} × ${medidas.altoMm.toFixed(1)} mm · ${orientacion}`;
}
