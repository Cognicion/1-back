import { normalizeClinicalComparisonText } from "./textNormalizer.js";
export function normalizeMedicationName(value = "") { return normalizeClinicalComparisonText(value).replace(/\s+/g, " ").trim(); }
export function normalizeMedicationRoute(value = "") {
  const route = normalizeClinicalComparisonText(value);
  if (/\b(?:via\s+)?oral\b|\bvo\b/.test(route)) return "oral";
  if (/intramuscular|\bim\b/.test(route)) return "intramuscular";
  if (/intravenosa|\biv\b/.test(route)) return "intravenosa";
  if (/subcutanea|\bsc\b/.test(route)) return "subcutanea";
  if (/sublingual|inhalad|topica|rectal|transdermica|intranasal|oftalmica|otica/.test(route)) return route.match(/sublingual|inhalad\w*|topica|rectal|transdermica|intranasal|oftalmica|otica/)?.[0] || "";
  return "";
}
