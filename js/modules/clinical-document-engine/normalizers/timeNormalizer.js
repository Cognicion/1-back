export function normalizeClinicalTime(value = "") {
  const match = String(value || "").trim().toLowerCase().replace(/\s+/g, "").match(/^(\d{1,2})(?::(\d{1,2}))?(?:h|hrs?|horas?)?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2] || 0) > 59) return "";
  return `${String(match[1]).padStart(2, "0")}:${String(match[2] || 0).padStart(2, "0")}`;
}
