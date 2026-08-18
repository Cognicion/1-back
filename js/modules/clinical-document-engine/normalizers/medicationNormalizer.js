import { normalizeClinicalComparisonText } from "./textNormalizer.js";
export function normalizeMedicationName(value = "") { return normalizeClinicalComparisonText(value).replace(/\s+/g, " ").trim(); }
export const MEDICATION_PRESENTATIONS = Object.freeze(["tabletas", "tableta", "comprimidos", "comprimido", "cápsulas", "capsulas", "cápsula", "capsula", "jarabe", "solución", "solucion", "suspensión", "suspension", "polvo", "ámpulas", "ampulas", "ámpula", "ampula", "ampollas", "ampolla", "vial", "gotas", "crema", "ungüento", "unguento", "spray", "parche", "supositorio"]);
export function normalizeMedicationPresentation(value = "") {
  const text = normalizeClinicalComparisonText(value);
  const match = MEDICATION_PRESENTATIONS.find((item) => new RegExp(`\\b${normalizeClinicalComparisonText(item).replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(text));
  return match ? normalizeClinicalComparisonText(match) : "";
}
export function normalizeMedicationRoute(value = "") {
  const route = normalizeClinicalComparisonText(value);
  if (/\b(?:via\s+)?oral\b|\bvo\b/.test(route)) return "oral";
  if (/intramuscular|\bim\b/.test(route)) return "intramuscular";
  if (/intravenosa|\biv\b/.test(route)) return "intravenosa";
  if (/subcutanea|\bsc\b/.test(route)) return "subcutanea";
  if (/sublingual|inhalad|topica|rectal|transdermica|intranasal|oftalmica|otica/.test(route)) return route.match(/sublingual|inhalad\w*|topica|rectal|transdermica|intranasal|oftalmica|otica/)?.[0] || "";
  return "";
}

export function parseClinicalQuantity(value = "") {
  const source = String(value || "").trim().toLowerCase().replace(",", ".");
  const words = { una: 1, un: 1, uno: 1, dos: 2, tres: 3 };
  const fractions = { "½": 0.5, "¼": 0.25, "¾": 0.75, "1/2": 0.5, "1/4": 0.25, "3/4": 0.75 };
  if (words[source] != null) return words[source];
  if (fractions[source] != null) return fractions[source];
  const ascii = source.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (ascii && Number(ascii[2])) return Number(ascii[1]) / Number(ascii[2]);
  const mixed = source.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed && Number(mixed[3])) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const number = Number(source);
  return Number.isFinite(number) ? number : null;
}

function canonicalMedicationUnit(value = "") {
  const unit = normalizeClinicalComparisonText(value).replace(/\s+/g, " ").trim();
  if (/^(?:mg|miligramos?)$/.test(unit)) return "mg";
  if (/^(?:g|gramos?)$/.test(unit)) return "g";
  if (/^(?:mcg|ug|µg|microgramos?)$/.test(unit)) return "mcg";
  if (/^(?:ml|mililitros?)$/.test(unit)) return "ml";
  if (/^(?:ui|unidades? internacionales?)$/.test(unit)) return "ui";
  return unit;
}

export function parseMedicationStrength(value = "") {
  const unit = String.raw`(?:miligramos?|microgramos?|mililitros?|gramos?|unidades?\s+internacionales?|mg|mcg|µg|ug|ml|ui|g|%)`;
  const match = String(value || "").match(new RegExp(`(\\d+(?:[.,]\\d+)?|½|¼|¾|\\d+\\s*\\/\\s*\\d+)\\s*(${unit})(?:\\s*\\/\\s*(\\d+(?:[.,]\\d+)?)\\s*(${unit}))?`, "i"));
  if (!match) return { strength: null, strengthUnit: "", strengthPerValue: null, strengthPerUnit: "", rawStrength: "" };
  return { strength: parseClinicalQuantity(match[1]), strengthUnit: canonicalMedicationUnit(match[2]), strengthPerValue: match[3] ? parseClinicalQuantity(match[3]) : null, strengthPerUnit: match[4] ? canonicalMedicationUnit(match[4]) : "", rawStrength: match[0] };
}

export function normalizeMedicationFrequency(value = "") {
  const text = normalizeClinicalComparisonText(value).trim();
  const match = text.match(/\b(?:1|una)\s+vez\s+al\s+dia\b|\b(?:2|dos)\s+veces\s+al\s+dia\b|\b(?:3|tres)\s+veces\s+al\s+dia\b|\bcada\s+\d+\s+horas?\b|\bpor\s+la\s+(?:manana|noche)\b|\bal\s+acostarse\b|\bprn\b|\ben\s+caso\s+necesario\b|\bdosis\s+unica\b/i);
  if (!match) return { key: "", text: "" };
  const raw = match[0];
  const key = raw.startsWith("1") || raw.startsWith("una") ? "onceDaily" : raw.startsWith("2") || raw.startsWith("dos") ? "twiceDaily" : raw.startsWith("cada 8") ? "every8Hours" : raw.startsWith("cada 12") ? "every12Hours" : raw.startsWith("cada 24") ? "every24Hours" : raw.includes("prn") || raw.includes("necesario") ? "asNeeded" : raw.replace(/\s+/g, "_");
  return { key, text: raw };
}

export function parseMedicationSchedules(value = "") {
  const text = normalizeClinicalComparisonText(value);
  const pattern = /\b(\d{1,4})(?::(\d{1,2}))?\s*(h|hrs?|horas?)\b|\b(\d{1,2}):(\d{1,2})\s*h?\b/gi;
  const schedules = [];
  let match;
  while ((match = pattern.exec(text))) {
    const hour = Number(match[1] ?? match[4]);
    const minute = Number(match[2] ?? match[5] ?? 0);
    if (hour > 23 || minute > 59) continue;
    const before = text.slice(Math.max(0, match.index - 45), match.index);
    if (/\bcada\s*$/i.test(before)) continue;
    const quantityPattern = String.raw`(?:\d+(?:[.,]\d+)?|una|un|uno|dos|tres|½|¼|¾|\d+\s*\/\s*\d+)`;
    const quantities = [...before.matchAll(new RegExp(`(${quantityPattern})\\s*(?:de\\s+)?(tabletas?|capsulas?|comprimidos?|ampulas?|ampollas?|atomizaciones?|ml|mililitros|cucharadas?|cucharaditas?|gotas?)`, "gi"))];
    const quantityWithUnit = quantities.at(-1);
    const quantityWithoutUnit = quantityWithUnit
      ? null
      : before.match(new RegExp(`(?:tomar|administrar|aplicar)\\s+(${quantityPattern})\\s*(?:a\\s+las?|a\\s+la)?\\s*$`, "i"));
    const rawQuantity = quantityWithUnit?.[1] || quantityWithoutUnit?.[1] || "";
    const unit = quantityWithUnit?.[2]?.toLowerCase() || (quantityWithoutUnit ? normalizeMedicationPresentation(text) : "");
    schedules.push({ time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, quantity: rawQuantity ? parseClinicalQuantity(rawQuantity) : null, unit });
  }
  return schedules.filter((item, index, all) => all.findIndex((other) => other.time === item.time && other.quantity === item.quantity) === index);
}

function hasMedicationNameBoundaries(value = "", start = 0, length = 0) {
  const wordCharacter = /[\p{L}\p{N}]/u;
  const previous = start > 0 ? value[start - 1] : "";
  const next = value[start + length] || "";
  return (!previous || !wordCharacter.test(previous)) && (!next || !wordCharacter.test(next));
}

export function splitMedicationItems(text = "", medicationCatalog = []) {
  const source = String(text || "");
  const names = [...new Set(medicationCatalog.flatMap((item) => [
    item.nombre,
    item.genericName,
    item.nombreGenerico,
    ...(item.sinonimos || item.synonyms || []),
    ...(item.marcas || item.brandNames || [])
  ]).concat(["Sertralina", "Pregabalina", "Espironolactona", "Colchicina", "Yasmin", "Lactobacilos", "Lamotrigina"]).filter(Boolean))].sort((a, b) => String(b).length - String(a).length);
  const starts = [];
  const markers = /(?:^|\s)(?:[a-z]|\d+)[.)](?:-|\s)*(?=[A-Za-zÁÉÍÓÚáéíóúÑñ])/g;
  let match;
  while ((match = markers.exec(source))) starts.push(match.index + (match[0].startsWith(" ") ? 1 : 0));
  names.forEach((name) => {
    const comparableSource = normalizeClinicalComparisonText(source);
    const comparableName = normalizeClinicalComparisonText(name);
    let foundIndex = 0;
    while ((foundIndex = comparableSource.indexOf(comparableName, foundIndex)) >= 0) {
      if (!hasMedicationNameBoundaries(comparableSource, foundIndex, comparableName.length)) {
        foundIndex += comparableName.length;
        continue;
      }
      const prefixStart = Math.max(source.lastIndexOf("\n", foundIndex), source.lastIndexOf(";", foundIndex), source.lastIndexOf(".", foundIndex)) + 1;
      const prefix = source.slice(prefixStart, foundIndex);
      if (/\b(?:antecedente|recibio|recibió|previamente|previo|manejo\s+a\s+base|niega|sin\s+uso\s+de|no\s+usa|no\s+toma|se\s+inicio|inicia|inicio|suspende|suspendio|suspendió|suspender|aumenta|disminuye|cambia)\b/i.test(prefix)) starts.push(prefixStart);
      starts.push(foundIndex);
      foundIndex += comparableName.length;
    }
  });
  ["Sertralina", "Pregabalina", "Espironolactona", "Colchicina", "Yasmin", "Lactobacilos", "Lamotrigina"].forEach((name) => {
    const foundIndex = normalizeClinicalComparisonText(source).indexOf(normalizeClinicalComparisonText(name));
    if (foundIndex >= 0) starts.push(foundIndex);
  });
  const uniqueStarts = [...new Set(starts)].sort((a, b) => a - b);
  const chunks = uniqueStarts.length ? uniqueStarts.map((start, index) => source.slice(start, uniqueStarts[index + 1] ?? source.length).replace(/^\s*[a-z\d]+[.)-]\s*/i, "").trim()).filter(Boolean) : [source.trim()];
  return chunks.filter(Boolean);
}
