/** Normaliza texto para comparación léxica sin alterar el texto original. */
export function normalizeText(text = "") {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
