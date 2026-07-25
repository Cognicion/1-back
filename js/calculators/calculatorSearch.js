export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function searchCalculators(catalog, query) {
  const term = normalizeSearchText(query);
  if (!term) return catalog;
  return catalog.map((item) => {
    const name = normalizeSearchText(item.name);
    const aliases = normalizeSearchText((item.aliases || []).join(" "));
    const indexed = normalizeSearchText([item.description, item.category, ...(item.specialties || []), ...(item.functions || []), ...(item.keywords || [])].join(" "));
    const score = name === term ? 100 : name.startsWith(term) ? 80 : aliases.includes(term) ? 65 : name.includes(term) ? 55 : indexed.includes(term) ? 25 : 0;
    return score ? { item, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "es")).map(({ item }) => item);
}
