export const SPANISH_FUNCTION_WORDS = new Set([
  "a", "al", "algo", "ante", "bajo", "con", "contra", "de", "del", "desde", "durante", "e", "el", "ella", "ellas", "ellos", "en", "entre", "ese", "esa", "esos", "esas", "este", "esta", "estos", "estas", "hacia", "hasta", "la", "las", "más", "menos", "ni", "o", "para", "pero", "por", "que", "se", "según", "sin", "sobre", "su", "sus", "tras", "un", "una", "unos", "unas", "y"
]);

function normalizeWord(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function isFunctionWordPattern(normalizedPhrase, functionWords = SPANISH_FUNCTION_WORDS) {
  const tokens = String(normalizedPhrase || "").split(/\s+/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) return true;
  const normalizedFunctionWords = new Set([...functionWords].map(normalizeWord));
  return tokens.every((token) => normalizedFunctionWords.has(normalizeWord(token)));
}
