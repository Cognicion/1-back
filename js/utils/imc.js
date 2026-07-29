function convertirNumero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const numero = Number(String(valor ?? "").replace(",", ".").trim());
  return Number.isFinite(numero) ? numero : null;
}

/** Calcula IMC usando peso en kg y talla en metros. */
export function calcularIMC(pesoKg, tallaMetros) {
  const peso = convertirNumero(pesoKg);
  const talla = convertirNumero(tallaMetros);
  if (!peso || !talla || peso <= 0 || talla <= 0) return null;
  const resultado = peso / (talla * talla);
  return Number.isFinite(resultado) && resultado > 0
    ? Number(resultado.toFixed(2))
    : null;
}
