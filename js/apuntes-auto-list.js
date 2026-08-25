const ATAJOS_LISTA = new Map([
  [".", "puntos"],
  ["1.", "numeros"],
  ["1)", "numeros"]
]);

export function detectarAtajoLista(textoAntesDelCursor) {
  const marcador = String(textoAntesDelCursor ?? "").replace(/\u00a0/g, " ");
  const tipo = ATAJOS_LISTA.get(marcador);
  return tipo ? { tipo, marcador } : null;
}
