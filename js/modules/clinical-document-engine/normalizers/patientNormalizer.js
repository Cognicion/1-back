import { normalizeClinicalComparisonText } from "./textNormalizer.js";
export function normalizePatientName(value = "") { return normalizeClinicalComparisonText(value).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().toUpperCase(); }
