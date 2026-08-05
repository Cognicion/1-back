export function normalizeClinicalDate(value = "") {
  const text = String(value || "").trim().replace(/[.\-]/g, "/");
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${year}`;
}
