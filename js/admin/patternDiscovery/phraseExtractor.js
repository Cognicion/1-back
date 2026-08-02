import { tokenizar } from "./textTokenizer.js";

export function extraerNgramas(texto, min = 1, max = 20) {
  const tokens = tokenizar(texto);
  const salida = [];
  for (let tamano = min; tamano <= Math.min(max, tokens.length); tamano++) {
    for (let indice = 0; indice <= tokens.length - tamano; indice++) {
      salida.push({ tipo: tamano === 1 ? "word" : tamano === 2 ? "bigram" : tamano === 3 ? "trigram" : "phrase", n: tamano, clave: tokens.slice(indice, indice + tamano).join(" ") });
    }
  }
  return salida;
}
