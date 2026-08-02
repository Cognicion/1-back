import { normalizeText } from "../normalization/normalizeText.js";

/** Tokeniza texto normalizado y excluye tokens de un solo carácter o numéricos. */
export function tokenizeText(text = "") {
  return normalizeText(text).split(/\s+/).filter((token) => token.length > 1 && !/^\d+$/.test(token));
}
