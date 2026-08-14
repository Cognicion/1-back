import { MEDICAMENTOS_MAESTROS, medicamentoPorTexto } from "../../../data/catalogoFarmacologicoUnificado.js?v=20260811-pharmacology-files-consolidated-v1";
import { adaptDiagnosisBlock, adaptDiagnosisCandidates } from "../../clinical-document-engine/adapters/diagnosisAdapter.js?v=20260813-diagnosis-treatment-filter-v1";
import { adaptMedicationBlock, adaptMedicationCandidates } from "../../clinical-document-engine/adapters/medicationAdapter.js";

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
  if (/\bse agrega\b/.test(value)) return "Se agrega";
  if (/\b(?:se descarto|se descarta|niega antecedente|sin antecedente)\b/.test(value)) return "Descartado";
  if (/\ba descartar\b/.test(value)) return "A descartar";
  if (/\bprobable\b/.test(value)) return "Probable";
  if (/\ben remision\b/.test(value)) return "Remisi\u00f3n";
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

export function splitDiagnosticCodes(text = "") {
  return [...String(text || "").matchAll(/[A-Z]\d{2}(?:\.\d{1,2})?/gi)]
    .map((match) => match[0].toUpperCase().replace(/\s+/g, ""));
}

function cleanDiagnosisName(value = "", codes = []) {
  let result = String(value || "");
  codes.forEach((code) => { result = result.replace(new RegExp(code.replace(".", "\\."), "ig"), " "); });
  return result
    .replace(/\b(?:cie[- ]?10|cie[- ]?11|icd[- ]?10|diagn[oó]sticos?|impresi[oó]n diagn[oó]stica)\b\s*[:|\-]?/gi, " ")
    .replace(/\b(?:se agrega|se descarta|a descartar|probable|en remisi[oó]n)\b/gi, " ")
    .replace(/^\s*[-:|–—.]+|[-:|–—.]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function diagnosisCandidate({ name, code = "", rawText, section, documentId, sourceLocation = {}, requiresReview = false, detectionRule = "diagnosis-block", statusOverride = "" }) {
  const status = statusOverride || statusForDiagnosis(rawText || name);
  const system = codingSystem(code, rawText || "");
  return {
    id: `${documentId || "doc"}-dx-${section}-${sourceLocation.lineIndex ?? sourceLocation.rowIndex ?? 0}-${code || normalizeText(name).slice(0, 24)}`,
    rawText: rawText || name,
    diagnosisName: name,
    normalizedDiagnosisName: normalizeText(name),
    normalizedName: name,
    normalizedLabel: name,
    code: code || null,
    system,
    codingSystem: system,
    status,
    statusSuggestion: status,
    isPrimary: false,
    principal: false,
    temporality: status === "Antecedente" ? "historical" : "current",
    negated: /\b(?:niega|sin antecedente|se descarto|se descarta)\b/i.test(rawText || ""),
    sourceSection: section,
    sourceHeading: section,
    sourceText: rawText || name,
    sourceLocation: { documentId, ...sourceLocation },
    evidence: rawText || name,
    confidence: code ? (requiresReview ? "medium" : "high") : "medium",
    requiresReview: Boolean(requiresReview || !code),
    detectionRule,
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false
  };
}

function parseDiagnosisBlockLegacyHistorical({ text = "", section = "diagnosticos", documentId = "", sourceLocation = {}, explicit = false } = {}) {
  const rows = String(text || "").split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  const results = [];
  const rowCodes = rows.map((row) => splitDiagnosticCodes(row));
  const plainRows = rows.filter((row, index) => !rowCodes[index].length && cleanDiagnosisName(row).length >= 3);
  const codeOnlyRows = rows.filter((row, index) => rowCodes[index].length === 1 && !cleanDiagnosisName(row, rowCodes[index]).length);
  if (explicit && plainRows.length && codeOnlyRows.length && plainRows.length === codeOnlyRows.length) {
    const firstCodeRow = rowCodes.findIndex((codes) => codes.length);
    const lastPlainRow = rows.reduce((last, row, index) => (!rowCodes[index].length && cleanDiagnosisName(row).length >= 3 ? index : last), -1);
    if (firstCodeRow > lastPlainRow) {
      plainRows.forEach((row, index) => results.push(diagnosisCandidate({
        name: cleanDiagnosisName(row),
        rawText: `${row} | ${codeOnlyRows[index]}`,
        code: splitDiagnosticCodes(codeOnlyRows[index])[0],
        section,
        documentId,
        sourceLocation: { ...sourceLocation, rowIndex: index },
        detectionRule: "diagnosis-columns-paired"
      })));
      return results;
    }
  }
  rows.forEach((row, rowIndex) => {
    const codes = splitDiagnosticCodes(row);
    const name = cleanDiagnosisName(row, codes);
    const looksLikeHeader = /^(?:diagn[oó]sticos?|cie[- ]?10|cie[- ]?11|sistema)$/i.test(name);
    if (looksLikeHeader) return;
    if (codes.length === 1) {
      if (name.length >= 3) results.push(diagnosisCandidate({ name, code: codes[0], rawText: row, section, documentId, sourceLocation: { ...sourceLocation, rowIndex }, detectionRule: "diagnosis-code-pair" }));
      else results.push(diagnosisCandidate({ name: "", code: codes[0], rawText: row, section, documentId, sourceLocation: { ...sourceLocation, rowIndex }, requiresReview: true, detectionRule: "unpaired-diagnosis-code" }));
      return;
    }
    if (codes.length > 1) {
      console.info("[patient-transfer] diagnosis:unpaired", JSON.stringify({ documentId, namesCount: name ? 1 : 0, codesCount: codes.length, rowIndex }));
      if (name.length >= 3) results.push(diagnosisCandidate({ name, rawText: row, section, documentId, sourceLocation: { ...sourceLocation, rowIndex }, requiresReview: true, detectionRule: "multiple-unpaired-diagnosis-codes" }));
      return;
    }
    if (explicit && name.length >= 3 && !/^(?:plan|tratamiento|medicamentos|indicaciones)$/i.test(name)) {
      results.push(diagnosisCandidate({ name, rawText: row, section, documentId, sourceLocation: { ...sourceLocation, rowIndex }, requiresReview: true, detectionRule: "diagnosis-without-code" }));
    }
  });
  return results;
}

const DIAGNOSIS_START_PATTERN = /\bdiagn[oó]sticos?(?:\s+de\s+acuerdo\s+a\s+cie[- ]?10)?\b|\bimpresi[oó]n\s+diagn[oó]stica\b/i;
const DIAGNOSIS_END_PATTERN = /\b(?:plan\s+terap[eé]utico|tratamiento\s+farmacol[oó]gico|medicamentos|comentario\s+y\/o\s+an[aá]lisis|an[aá]lisis|pron[oó]stico|destino|nota\s+de\s+(?:evoluci[oó]n|ingreso))\b/i;
const STATUS_ONLY_PATTERN = /^(?:se\s+agrega|se\s+descarta|probable|confirmado|antecedente|remisi[oó]n|en\s+remisi[oó]n|a\s+descartar)$/i;

function isolateDiagnosisBlock(text = "") {
  const source = String(text || "");
  const start = source.search(DIAGNOSIS_START_PATTERN);
  if (start < 0) return source.trim();
  const marker = source.slice(start).match(DIAGNOSIS_START_PATTERN)?.[0] || "";
  let contentStart = start + marker.length;
  const lineEnd = source.indexOf("\n", contentStart);
  const colon = source.indexOf(":", contentStart);
  if (colon >= 0 && (lineEnd < 0 || colon < lineEnd)) contentStart = colon + 1;
  const content = source.slice(contentStart);
  const end = content.search(DIAGNOSIS_END_PATTERN);
  return (end >= 0 ? content.slice(0, end) : content).trim();
}

function diagnosisRows(text = "") {
  return isolateDiagnosisBlock(text)
    .split(/\r?\n|(?<=;)\s*/)
    .map((row) => row.replace(/^\s*(?:\d+|[a-z])[.)-]\s*/i, "").trim())
    .filter(Boolean);
}

function parseDiagnosisBlockLegacy({ text = "", section = "diagnosticos", documentId = "", sourceLocation = {}, explicit = false } = {}) {
  const rows = diagnosisRows(text);
  const results = [];
  const pendingNames = [];
  let discardedCount = 0;
  console.info("[patient-transfer] diagnosis:block", JSON.stringify({ documentId, section, rowCount: rows.length, explicit }));

  rows.forEach((row, rowIndex) => {
    const codes = splitDiagnosticCodes(row);
    const name = cleanDiagnosisName(row, codes).replace(/\s+/g, " ").trim();
    if (STATUS_ONLY_PATTERN.test(row.trim())) {
      const previous = pendingNames.at(-1) || results.at(-1);
      if (previous) {
        const status = statusForDiagnosis(row);
        previous.status = status;
        previous.statusSuggestion = status;
        previous.temporality = status === "Antecedente" ? "historical" : "current";
        console.info("[patient-transfer] diagnosis:entry-status", JSON.stringify({ documentId, rowIndex, status }));
      }
      return;
    }
    if (!name && !codes.length) { discardedCount += 1; return; }
    if (/^(?:diagn[oó]sticos?|cie[- ]?10|cie[- ]?11|sistema)(?:\s*\|\s*(?:cie[- ]?10|cie[- ]?11))?$/i.test(name)) { discardedCount += 1; return; }
    const hasDiagnosticContext = /(?:diagn[oó]stic|cie[- ]?(?:10|11)|antecedente\s+de|probable|a\s+descartar|se\s+(?:agrega|descarta))/i.test(row);
    if (!explicit && !hasDiagnosticContext) { discardedCount += 1; return; }
    const status = statusForDiagnosis(row);
    if (codes.length === 1 && name.length >= 3) {
      const candidate = diagnosisCandidate({ name, code: codes[0], rawText: row, section, documentId, sourceLocation: { ...sourceLocation, rowIndex }, statusOverride: status, detectionRule: "diagnosis-entry-near-code" });
      results.push(candidate);
      console.info("[patient-transfer] diagnosis:entry", JSON.stringify({ documentId, rowIndex, hasCode: true, status: candidate.status }));
      return;
    }
    if (codes.length === 1 && !name) {
      const pending = pendingNames.shift();
      if (pending) {
        const candidate = diagnosisCandidate({ name: pending.name, code: codes[0], rawText: `${pending.rawText} | ${row}`, section, documentId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, statusOverride: pending.status, detectionRule: "diagnosis-columns-paired" });
        results.push(candidate);
        console.info("[patient-transfer] diagnosis:paired", JSON.stringify({ documentId, rowIndex, hasCode: true }));
      } else discardedCount += 1;
      return;
    }
    if (codes.length > 1) {
      if (name.length >= 3) results.push(diagnosisCandidate({ name, rawText: row, section, documentId, sourceLocation: { ...sourceLocation, rowIndex }, requiresReview: true, detectionRule: "multiple-unpaired-diagnosis-codes", statusOverride: status }));
      else discardedCount += 1;
      console.info("[patient-transfer] diagnosis:unpaired", JSON.stringify({ documentId, rowIndex, codesCount: codes.length, hasName: Boolean(name) }));
      return;
    }
    if (explicit && name.length >= 3 && !/^(?:plan|tratamiento|medicamentos|indicaciones)$/i.test(name)) pendingNames.push({ name, rawText: row, rowIndex, status });
    else discardedCount += 1;
  });

  if (pendingNames.length && explicit) pendingNames.forEach((pending) => {
    const candidate = diagnosisCandidate({ name: pending.name, rawText: pending.rawText, section, documentId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, requiresReview: true, statusOverride: pending.status, detectionRule: "diagnosis-without-code" });
    results.push(candidate);
    console.info("[patient-transfer] diagnosis:entry", JSON.stringify({ documentId, rowIndex: pending.rowIndex, hasCode: false, status: candidate.status }));
  });
  console.info("[patient-transfer] diagnosis:finished", JSON.stringify({ documentId, detectedCount: results.length, pairedCount: results.filter((item) => item.code).length, discardedCount }));
  return results;
}

export function parseDiagnosisBlock(args = {}) {
  return adaptDiagnosisBlock(args);
}

function detectDiagnosisCandidatesLegacy({ sections = {}, fullText = "", sourceBlocks = [], documentId = "" } = {}) {
  const candidates = [];
  const seen = new Set();
  const addCandidates = (items) => items.forEach((candidate) => {
    const key = `${normalizeText(candidate.code || "")}:${candidate.normalizedDiagnosisName}`;
    if (!candidate.diagnosisName || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  });
  sourceBlocks.filter((block) => block.type === "table").forEach((block) => {
    (block.rows || []).forEach((row, rowIndex) => {
      const rowText = row.join(" | ");
      if (splitDiagnosticCodes(rowText).length && /diagn[oó]stico|cie[- ]?10|cie[- ]?11/i.test(rowText) || splitDiagnosticCodes(rowText).length === 1) {
        addCandidates(parseDiagnosisBlock({ text: rowText, section: "diagnosticos", documentId, sourceLocation: { tableIndex: block.source?.tableIndex, blockIndex: block.source?.blockIndex, rowIndex }, explicit: true }));
      }
    });
  });
  sourceEntries(sections, fullText, ["diagnosticos", "analisis", "subjetivo"]).forEach(({ section, text }) => {
    const explicit = section === "diagnosticos";
    addCandidates(parseDiagnosisBlock({ text, section, documentId, explicit }));
    splitLines(text).forEach(({ text: line, index }) => {
      if (!/(?:diagn[oó]stico\s+de|diagnosticad[oa]|cuenta\s+con\s+diagn[oó]stico|antecedente\s+de|probable|a\s+descartar)/i.test(line)) return;
      addCandidates(parseDiagnosisBlock({ text: line, section, documentId, sourceLocation: { lineIndex: index }, explicit: true }));
    });
  });
  console.info("[patient-transfer] diagnosis:paired", JSON.stringify({ noteId: documentId, candidatesCount: candidates.length, pairedCount: candidates.filter((item) => item.code).length, unpairedCount: candidates.filter((item) => !item.code || item.requiresReview).length }));
  return candidates;
}

export function detectDiagnosisCandidates(args = {}) {
  return adaptDiagnosisCandidates(args);
}

const medicationNames = [...new Set(MEDICAMENTOS_MAESTROS.map((item) => String(item.nombre || "").trim()).filter(Boolean))];
const PRESENTATIONS = ["tabletas", "tableta", "comprimidos", "comprimido", "capsulas", "capsula", "jarabe", "solucion", "suspension", "gotas", "polvo", "ampolla", "vial", "parche", "spray", "inhalador", "crema", "unguento", "supositorio"];
// Productos que aparecen en documentos clínicos pero no forman parte del
// catálogo farmacológico estructurado. Se conservan como candidatos manuales.
const MANUAL_MEDICATION_NAMES = ["Yasmin", "Lactobacilos"];

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
    // "cada 8 horas" is an interval, not an explicit administration time.
    if (/\bcada\s*$/i.test(before)) continue;
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

export function splitMedicationItems(text = "", medicationCatalog = MEDICAMENTOS_MAESTROS) {
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

function medicationMentions(line = "", catalog = MEDICAMENTOS_MAESTROS) {
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

function detectTreatmentCandidatesLegacy({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog = MEDICAMENTOS_MAESTROS, documentId = "", date = "" } = {}) {
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

export function detectTreatmentCandidates(args = {}) {
  return adaptMedicationCandidates(args);
}

export function extractClinicalCandidates(document = {}, { includeTreatments = true } = {}) {
  return {
    diagnoses: detectDiagnosisCandidates({ sections: document.sections, fullText: document.fullText, sourceBlocks: document.blocks, documentId: document.id, noteId: document.sourceNoteId || document.noteId || "" }),
    treatments: includeTreatments ? detectTreatmentCandidates({ sections: document.sections, fullText: document.fullText, sourceBlocks: document.blocks, documentId: document.id, date: document.date || document.metadata?.documentDate || "" }) : []
  };
}
