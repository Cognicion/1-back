export function normalizeClinicalText(value = "") {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeClinicalComparisonText(value = "") {
  return normalizeClinicalText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
