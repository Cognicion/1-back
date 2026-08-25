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

export function tipoSublistaOrdenada(tipoPadre = "1") {
  const tipo = String(tipoPadre || "1");
  if (tipo === "a") return "i";
  if (tipo === "A") return "I";
  if (tipo === "i" || tipo === "I") return "1";
  return "a";
}
