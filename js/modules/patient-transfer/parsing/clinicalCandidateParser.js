import { MEDICAMENTOS, MEDICAMENTOS_MAESTROS, medicamentoPorTexto } from "../../../data/medicamentos.js";

function normalizeText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitLines(text = "") {
  return String(text || "").split(/\n|(?:^|\s)[\-•]\s+|;\s+|(?<=[.!?])\s+/)
    .map((text, index) => ({ text: text.replace(/^\s*\d+[.)]\s*/, "").trim(), index }))
    .filter(({ text }) => text.length >= 3);
}

function statusForDiagnosis(text = "") {
  const value = normalizeText(text);
  if (/\b(?:se descarto|se descarta|niega antecedente|sin antecedente)\b/.test(value)) return "Descartado";
  if (/\ba descartar\b/.test(value)) return "A descartar";
  if (/\bprobable\b/.test(value)) return "Probable";
  if (/\ben remision\b/.test(value)) return "Remisión";
  if (/\b(?:antecedente|diagnosticad[oa].*\ben\s+\d{4}\b)\b/.test(value)) return "Antecedente";
  return "Confirmado";
}

function statusForTreatment(text = "") {
  const value = normalizeText(text);
  if (/\b(?:se suspendio|suspendido|suspender|se suspende)\b/.test(value)) return "Suspende";
  if (/\b(?:recibio|previamente|previo|antecedente|en \d{4}|durante \d+ meses|manejo a base de)\b/.test(value)) return "Antecedente";
  if (/\b(?:se inicio|inicio|iniciar)\b/.test(value)) return "Inicia";
  if (/\b(?:aumento|aumentar|incrementar)\b/.test(value)) return "Aumenta";
  if (/\b(?:disminuyo|disminuir|reducir)\b/.test(value)) return "Disminuye";
  return "Continúa";
}

function codingSystem(code = "", context = "") {
  if (/\bdsm-?5\b/i.test(context)) return "DSM-5";
  if (/\bcie-?11\b/i.test(context) || /^\d[A-Z][0-9A-Z]{2,}$/i.test(code)) return "CIE-11";
  if (/\bcie-?10\b/i.test(context) || /^[A-Z]\d{2}(?:\.\d{1,2})?$/i.test(code)) return "CIE-10";
  return "";
}

function sourceEntries(sections = {}, fullText = "", keys = []) {
  const entries = keys.map((key) => ({ section: key, text: sections[key] || "" })).filter((item) => item.text.trim());
  if (!entries.length && fullText.trim()) entries.push({ section: "texto_completo", text: fullText });
  return entries;
}

function diagnosisName(line = "", code = "") {
  const explicit = line.match(/(?:cuenta\s+con\s+diagn[oó]stico\s+de|diagnosticad[oa](?:\s+con)?|diagn[oó]stico\s+de|antecedente\s+de|probable|a\s+descartar)\s+([^.;\n]+)/i)?.[1];
  const value = explicit || line.replace(code, "").replace(/\b(?:cie-?10|cie-?11|dsm-?5|diagn[oó]sticos?|impresi[oó]n diagn[oó]stica)\b\s*:?/gi, "");
  return value.replace(/\b(?:diagnosticad[oa]\s+en\s+\d{4}|en\s+\d{4})\b.*$/i, "").replace(/^\s*[-:–]+/, "").replace(/\s+/g, " ").trim();
}

export function detectDiagnosisCandidates({ sections = {}, fullText = "", sourceBlocks = [], documentId = "" } = {}) {
  const sources = sourceEntries(sections, fullText, ["diagnosticos", "analisis", "subjetivo"]);
  const candidates = [];
  const seen = new Set();
  sources.forEach(({ section, text }) => splitLines(text).forEach(({ text: line, index }) => {
    const code = line.match(/\b(?:[A-Z]\d{2}(?:\.\d{1,2})?|\d[A-Z][0-9A-Z]{2,})\b/i)?.[0] || "";
    const explicit = Boolean(code || /(?:diagn[oó]stico\s+de|diagnosticad[oa]|cuenta\s+con\s+diagn[oó]stico|antecedente\s+de|probable|a\s+descartar)/i.test(line));
    if (!explicit && section !== "diagnosticos") return;
    const normalizedName = diagnosisName(line, code);
    if (!normalizedName || normalizedName.length < 3) return;
    const negated = /\b(?:niega|sin antecedente|se descarto|se descarta)\b/i.test(line);
    const key = `${normalizeText(code)}:${normalizeText(normalizedName)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id: `${documentId || "doc"}-dx-${section}-${index}`,
      rawText: line,
      normalizedName,
      normalizedLabel: normalizedName,
      code: code || null,
      codingSystem: codingSystem(code, line),
      statusSuggestion: statusForDiagnosis(line),
      temporality: statusForDiagnosis(line) === "Antecedente" ? "historical" : "current",
      negated,
      sourceSection: section,
      sourceLocation: { documentId, lineIndex: index },
      sourceBlockIndex: sourceBlocks[index]?.source?.blockIndex ?? null,
      startOffset: fullText ? fullText.indexOf(line) : -1,
      endOffset: fullText ? fullText.indexOf(line) + line.length : -1,
      detectionRule: code ? "codigo-clinico" : "frase-diagnostica-explicita",
      selectedForImport: false,
      include: false,
      confirmedByDoctor: false
    });
  }));
  return candidates;
}

const medicationNames = [...new Set(MEDICAMENTOS.map((item) => String(item.nombre || "").trim()).filter(Boolean))];
const PRESENTATIONS = ["tabletas", "tableta", "comprimidos", "comprimido", "capsulas", "capsula", "jarabe", "solucion", "suspension", "gotas", "polvo", "ampolla", "vial", "parche", "spray", "inhalador", "crema", "unguento", "supositorio"];
// Productos que aparecen en documentos clínicos pero no forman parte del
// catálogo farmacológico estructurado. Se conservan como candidatos manuales.
const MANUAL_MEDICATION_NAMES = ["Yasmin", "Lactobacilos", "Lamotrigina"];

function escapeRegex(value = "") { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function parseClinicalQuantity(value = "") {
  const source = String(value || "").trim().toLowerCase().replace(",", ".");
  const words = { una: 1, un: 1, uno: 1, dos: 2, tres: 3 };
  if (words[source] != null) return words[source];
  const fractions = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
  if (fractions[source] != null) return fractions[source];
  const mixed = source.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (mixed) return Number(mixed[1]) + fractions[mixed[2]];
  const ascii = source.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (ascii && Number(ascii[2])) return Number(ascii[1]) / Number(ascii[2]);
  const mixedAscii = source.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedAscii && Number(mixedAscii[3])) return Number(mixedAscii[1]) + Number(mixedAscii[2]) / Number(mixedAscii[3]);
  const number = Number(source);
  return Number.isFinite(number) ? number : null;
}

export function parseMedicationStrength(text = "") {
  const match = String(text || "").match(/(\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*(mg|g|mcg|µg|ug|ml|ui|%)(?:\s*\/\s*(\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*(mg|g|mcg|µg|ug|ml|ui))?/i);
  if (!match) return { strengthValue: null, strengthUnit: "", strengthPerValue: null, strengthPerUnit: "", rawStrength: "" };
  return {
    strengthValue: parseClinicalQuantity(match[1]),
    strengthUnit: match[2].toLowerCase().replace("ug", "mcg").replace("µg", "mcg"),
    strengthPerValue: match[3] ? parseClinicalQuantity(match[3]) : null,
    strengthPerUnit: match[4]?.toLowerCase().replace("ug", "mcg").replace("µg", "mcg") || "",
    rawStrength: match[0]
  };
}

function presentationFromText(text = "") {
  const value = normalizeText(text);
  return PRESENTATIONS.find((item) => new RegExp(`\\b${escapeRegex(item)}\\b`, "i").test(value)) || "";
}

function normalizeTime(value = "") {
  const clean = String(value || "").toLowerCase().replace(/\s+/g, "").replace(/(?:h|hr|hrs|hora|horas)$/i, "");
  if (!/^\d{1,4}(?::\d{1,2})?$/.test(clean)) return "";
  const [rawHour, rawMinute = "0"] = clean.includes(":") ? clean.split(":") : [clean, "0"];
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseMedicationSchedules(text = "") {
  const source = normalizeText(text);
  const timePattern = /\b(\d{1,4}:\d{1,2}\s*h?|\d{1,4}\s*(?:h|hrs?|horas?))\b/gi;
  const schedules = [];
  let match;
  while ((match = timePattern.exec(source))) {
    const time = normalizeTime(match[1]);
    if (!time) continue;
    const before = source.slice(Math.max(0, match.index - 50), match.index);
    const quantityMatches = [...before.matchAll(/(\d+(?:[.,]\d+)?|una|un|uno|dos|tres|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*(?:de\s+)?(tabletas?|capsulas?|comprimidos?|ml|mililitros|cucharadas?|cucharaditas?|vasos?|gotas?)/gi)];
    const nonContainerQuantities = quantityMatches.filter((item) => !/^vaso/i.test(item[2]));
    let quantityMatch = (nonContainerQuantities.length ? nonContainerQuantities : quantityMatches).at(-1);
    if (!quantityMatch) {
      const after = source.slice(match.index + match[0].length, match.index + match[0].length + 45);
      quantityMatch = after.match(/^[\s·:,-]*(\d+(?:[.,]\d+)?|una|un|uno|dos|tres|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*(?:de\s+)?(tabletas?|capsulas?|comprimidos?|ml|mililitros|cucharadas?|cucharaditas?|vasos?|gotas?)/i);
    }
    schedules.push({
      time,
      quantity: quantityMatch ? parseClinicalQuantity(quantityMatch[1]) : null,
      administrationUnit: quantityMatch ? normalizeText(quantityMatch[2]) : "",
      rawText: source.slice(Math.max(0, match.index - 35), Math.min(source.length, match.index + match[0].length + 5)).trim()
    });
  }
  return schedules.filter((item, index, all) => all.findIndex((other) => other.time === item.time && other.quantity === item.quantity) === index);
}

function routeFromText(text = "") {
  const value = normalizeText(text);
  const routes = [[/via\s+oral|\boral\b|\bvo\b/, "oral"], [/sublingual/, "sublingual"], [/intramuscular|\bim\b/, "intramuscular"], [/intravenosa|\biv\b/, "intravenosa"], [/subcutanea|\bsc\b/, "subcutanea"], [/inhalada|inhalado/, "inhalada"], [/topica/, "topica"], [/rectal/, "rectal"], [/transdermica/, "transdermica"], [/intranasal/, "intranasal"], [/oftalmica/, "oftalmica"], [/otica/, "otica"]];
  return routes.find(([pattern]) => pattern.test(value))?.[1] || "";
}

function frequencyFromText(text = "") {
  const value = normalizeText(text);
  return value.match(/\b(?:\d+|una|dos|tres)\s+veces?\s+al\s+dia|\b(?:\d+|una|dos|tres)\s+vez\s+al\s+dia|\bcada\s+\d+\s*horas?|\bpor\s+la\s+(?:manana|noche)|\bal\s+acostarse|\bprn\b|\ben\s+caso\s+necesario|\bdosis\s+unica|\b1-0-1\b|\bdiario\b/i)?.[0] || "";
}

function actionFromText(text = "") {
  const value = normalizeText(text);
  if (/cambia\s+presentacion/.test(value)) return "Cambia presentación";
  if (/suspend/.test(value)) return "Suspende";
  if (/\b(?:inicia|inicio|iniciar)\b/.test(value)) return "Inicia";
  if (/\b(?:aumenta|aumento|aumentar)\b/.test(value)) return "Aumenta";
  if (/\b(?:disminuye|disminuyo|disminuir|reduce|redujo)\b/.test(value)) return "Disminuye";
  if (/\b(?:antecedente|recibio|previamente|previo|en\s+\d{4}|manejo\s+a\s+base)\b/.test(value)) return "Antecedente";
  return "Continúa";
}

export function splitMedicationItems(text = "", medicationCatalog = MEDICAMENTOS) {
  const catalog = [...medicationCatalog, ...MEDICAMENTOS_MAESTROS];
  const names = [...new Set([...catalog.flatMap((item) => [item.nombre, item.nombreGenerico]), ...MANUAL_MEDICATION_NAMES].map((name) => String(name || "").trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const markers = /(?:^|\s)([a-z]|\d+)[.)](?:-|\s)*(?=[A-Za-zÁÉÍÓÚáéíóúÑñ])/g;
  const marked = [];
  let match;
  while ((match = markers.exec(String(text || "")))) marked.push(match.index + (match[0].startsWith(" ") ? 1 : 0));
  const source = String(text || "");
  const nameStarts = [];
  names.forEach((name) => {
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, "gi");
    let nameMatch;
    while ((nameMatch = pattern.exec(source))) nameStarts.push(nameMatch.index);
  });
  const manualStartPattern = /(?:^|[\n\r.;]|\b\d{1,4}(?::\d{1,2})?\s*h(?:oras?)?)\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ-]{2,}(?:\s+(?:forte|simibacilos))?)(?=\s*(?:\(|,|\d|tabletas?|capsulas?|jarabe|polvo|tomar|via|administrar))/g;
  const excludedStarts = new Set(["tomar", "administrar", "aplicar", "via", "iniciar", "inicio", "inicia", "se inicio", "continua", "suspender"]);
  while ((match = manualStartPattern.exec(source))) {
    const candidate = match[1].trim();
    if (!excludedStarts.has(normalizeText(candidate))) nameStarts.push(match.index + match[0].lastIndexOf(candidate));
  }
  const starts = [...new Set([...marked, ...nameStarts])].sort((a, b) => a - b);
  const chunks = starts.length ? starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length).replace(/^\s*[a-z\d]+[.)]\s*/i, "").trim()).filter(Boolean) : [source.trim()];
  const output = [];
  chunks.forEach((chunk) => {
    if (chunk) output.push(chunk.replace(/^[,;\s]+/, "").trim());
  });
  const result = output.length ? output : chunks;
  console.info("[patient-transfer] medication:item-split", JSON.stringify({ itemCount: result.length, itemLengths: result.map((item) => item.length) }));
  return result;
}

function medicationMentions(line = "", catalog = MEDICAMENTOS) {
  const names = [...new Set([...catalog, ...MEDICAMENTOS_MAESTROS].flatMap((item) => [item.nombre, item.nombreGenerico]).concat(MANUAL_MEDICATION_NAMES).map((name) => String(name || "").trim()).filter(Boolean))];
  return names.filter((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(line));
}

function inferManualMedicationName(item = "") {
  if (!/(?:tabletas?|capsulas?|jarabe|polvo|solucion|suspension|gotas?|\d+\s*(?:mg|g|ml|mcg|µg)|via\s+oral|tomar|administrar)/i.test(item)) return "";
  const match = String(item).match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ-]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ-]+){0,3})(?=\s*(?:\(|,|\s+(?:tabletas?|capsulas?|jarabe|polvo|solucion|suspension|gotas?|\d))|\s*$)/i);
  const value = match?.[1]?.trim() || "";
  if (/^(?:tomar|administrar|aplicar|via|oral|se|inicia|continua|suspender|suspendido)$/i.test(value)) return "";
  return value;
}

function medicationCandidate({ name, line, contextText = line, index, section, documentId, fullText, date = "" }) {
  const catalogItem = medicamentoPorTexto(name);
  const lowerLine = String(line || "").toLowerCase();
  const nameStart = lowerLine.indexOf(String(name || "").toLowerCase());
  const detail = nameStart >= 0 ? String(line).slice(nameStart) : String(line || "");
  const strength = parseMedicationStrength(detail);
  const frequency = frequencyFromText(detail);
  const schedule = parseMedicationSchedules(detail);
  const action = actionFromText(contextText);
  const statusSuggestion = action === "Continúa" ? statusForTreatment(line) : action;
  const administration = normalizeText(detail).match(/(?:tomar|administrar|aplicar)\s+(\d+(?:[.,]\d+)?|una|un|uno|dos|tres|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*(?:de\s+)?(tabletas?|capsulas?|comprimidos?|ml|cucharadas?|cucharaditas?|vasos?|gotas?)/i);
  const itemName = String(catalogItem?.nombre || name || "").replace(/\s+/g, " ").trim();
  const candidate = {
    id: `${documentId || "doc"}-tx-${section}-${index}-${normalizeText(itemName)}-${normalizeText(action)}`,
    medicationId: catalogItem?.id || catalogItem?.nombre || "",
    medicationName: itemName,
    normalizedMedicationName: normalizeText(itemName),
    genericName: catalogItem?.nombre || itemName,
    presentation: presentationFromText(detail),
    strengthValue: strength.strengthValue,
    strengthUnit: strength.strengthUnit,
    strengthPerValue: strength.strengthPerValue,
    strengthPerUnit: strength.strengthPerUnit,
    administrationQuantity: administration ? parseClinicalQuantity(administration[1]) : (schedule[0]?.quantity ?? null),
    administrationUnit: administration ? normalizeText(administration[2]) : (schedule[0]?.administrationUnit || ""),
    dose: strength.strengthValue == null ? "" : String(strength.strengthValue),
    doseUnit: strength.strengthUnit || "",
    route: routeFromText(detail),
    frequencyRaw: frequency,
    schedule,
    scheduleText: schedule.map((item) => `${item.time}${item.quantity != null ? ` · ${item.quantity} ${item.administrationUnit}` : ""}`).join("; "),
    duration: detail.match(/\bdurante\s+[^,.;]+/i)?.[0] || "",
    action,
    statusSuggestion,
    temporality: statusSuggestion === "Antecedente" ? "historical" : "current",
    date,
    sourceText: line,
    rawMedicationText: line,
    sourceSection: section,
    evidence: { strength: strength.rawStrength, route: routeFromText(detail), frequency, scheduleCount: schedule.length },
    confidence: strength.rawStrength || schedule.length || frequency ? "high" : "medium",
    sourceLocation: { documentId, lineIndex: index },
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false
  };
  console.info("[patient-transfer] medication:strength", JSON.stringify({ noteId: documentId, medicationName: candidate.medicationName, strength: candidate.strengthValue, strengthUnit: candidate.strengthUnit, perValue: candidate.strengthPerValue, perUnit: candidate.strengthPerUnit }));
  console.info("[patient-transfer] medication:route", JSON.stringify({ noteId: documentId, medicationName: candidate.medicationName, route: candidate.route }));
  console.info("[patient-transfer] medication:frequency", JSON.stringify({ noteId: documentId, medicationName: candidate.medicationName, frequency: candidate.frequencyRaw }));
  console.info("[patient-transfer] medication:schedule", JSON.stringify({ noteId: documentId, medicationName: candidate.medicationName, schedulesCount: candidate.schedule.length }));
  console.info("[patient-transfer] medication:candidate", JSON.stringify({ noteId: documentId, medicationName: candidate.medicationName, sourceLength: line.length, strength: candidate.strengthValue, route: candidate.route, frequency: candidate.frequencyRaw, schedulesCount: candidate.schedule.length, action: candidate.action }));
  return candidate;
}

export function detectTreatmentCandidates({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog = MEDICAMENTOS, documentId = "", date = "" } = {}) {
  void sourceBlocks;
  const sources = sourceEntries(sections, fullText, ["tratamiento", "medicamentos", "plan", "subjetivo"]);
  const candidates = [];
  const seen = new Set();
  sources.forEach(({ section, text }) => String(text).split(/\n/).map((value, index) => ({ text: value.trim(), index })).filter(({ text: value }) => value.length >= 3).forEach(({ text: sourceLine, index: lineIndex }) => {
    const processedNames = new Set();
    splitMedicationItems(sourceLine, medicationCatalog).forEach((item, itemIndex) => {
      if (/\b(?:niega|sin uso de|no usa|no toma)\b/i.test(item)) return;
      const itemStart = sourceLine.toLowerCase().indexOf(String(item).toLowerCase());
      const prefix = itemStart >= 0 ? sourceLine.slice(Math.max(0, itemStart - 60), itemStart) : "";
      if (/\b(?:niega|sin uso de|no usa|no toma)\b/i.test(prefix)) return;
      const names = medicationMentions(item, medicationCatalog);
      const resolvedNames = names.length ? names : [inferManualMedicationName(item)].filter(Boolean);
      resolvedNames.forEach((name) => {
        processedNames.add(normalizeText(name));
        const candidate = medicationCandidate({ name, line: item, contextText: `${prefix}${item}`, index: lineIndex * 100 + itemIndex, section, documentId, fullText, date });
        const key = [candidate.normalizedMedicationName, candidate.action, candidate.date, candidate.sourceSection, candidate.strengthValue, candidate.frequencyRaw, candidate.scheduleText].join(":");
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(candidate);
      });
    });
    // Las listas narrativas pueden tener varios nombres sin presentación ni
    // incisos. Completar únicamente los nombres que no quedaron cubiertos por
    // los fragmentos, conservando el nombre como texto fuente aislado.
    medicationMentions(sourceLine, medicationCatalog).forEach((name, fallbackIndex) => {
      if (processedNames.has(normalizeText(name))) return;
      const nameStart = sourceLine.toLowerCase().indexOf(String(name).toLowerCase());
      const namePrefix = nameStart >= 0 ? sourceLine.slice(Math.max(0, nameStart - 60), nameStart) : "";
      if (/\b(?:niega|sin uso de|no usa|no toma)\b/i.test(namePrefix)) return;
      const candidate = medicationCandidate({
        name,
        line: name,
        contextText: sourceLine.slice(0, sourceLine.indexOf(".") >= 0 ? sourceLine.indexOf(".") + 1 : sourceLine.length),
        index: lineIndex * 100 + 50 + fallbackIndex,
        section,
        documentId,
        fullText,
        date
      });
      const key = [candidate.normalizedMedicationName, candidate.action, candidate.date, candidate.sourceSection, candidate.strengthValue, candidate.frequencyRaw, candidate.scheduleText].join(":");
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(candidate);
    });
  }));
  return candidates;
}

export function extractClinicalCandidates(document = {}) {
  return {
    diagnoses: detectDiagnosisCandidates({ sections: document.sections, fullText: document.fullText, sourceBlocks: document.blocks, documentId: document.id }),
    treatments: detectTreatmentCandidates({ sections: document.sections, fullText: document.fullText, sourceBlocks: document.blocks, documentId: document.id, date: document.date || document.metadata?.documentDate || "" })
  };
}
