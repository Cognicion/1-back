import { MEDICAMENTOS_MAESTROS, medicamentoPorTexto } from "../../../data/medicamentos.js";
import { CRITERIOS_DIAGNOSTICOS_EXTENDIDOS } from "../../../data/diagnosticosClinicosExtendidos.js";

function normalizeText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitClinicalLines(text = "") {
  return String(text || "")
    .split(/\r?\n|(?:^|\s)[•●▪]\s*|;\s+|(?<=[.!?])\s+/)
    .map((text, index) => ({ text: text.replace(/^\s*(?:\d+|[a-z])[.)-]\s*/i, "").trim(), index }))
    .filter(({ text }) => text.length >= 3);
}

function splitMedicationLines(text = "") {
  return String(text || "")
    .split(/\r?\n|(?:^|\s)[•●▪]\s*/)
    .map((text, index) => ({ text: text.replace(/^\s*(?:\d+|[a-z])[.)-]\s*/i, "").trim(), index }))
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
  if (/\b(?:se suspendio|suspendido|suspender|suspende|se suspende)\b/.test(value)) return "Suspende";
  if (/\b(?:recibio|previamente|previo|antecedente|en \d{4}|durante \d+ meses|manejo a base de)\b/.test(value)) return "Antecedente";
  if (/\b(?:se inicio|inicio|inicia|iniciar)\b/.test(value)) return "Inicia";
  if (/\b(?:aumento|aumenta|aumentar|incrementar)\b/.test(value)) return "Aumenta";
  if (/\b(?:disminuyo|disminuye|disminuir|reducir)\b/.test(value)) return "Disminuye";
  if (/\b(?:cambia presentacion|cambia|cambio de presentacion)\b/.test(value)) return "Otro";
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
  if (fullText.trim()) entries.push({ section: "texto_completo", text: fullText, fallback: true });
  return entries;
}

function diagnosisName(line = "", code = "") {
  const explicit = line.match(/(?:cuenta\s+con\s+diagn[oó]stico\s+de|diagnosticad[oa](?:\s+con)?|diagn[oó]stico\s+de|antecedente\s+de|probable|a\s+descartar)\s+([^.;\n]+)/i)?.[1];
  const value = explicit || line.replace(code, "").replace(/\b(?:cie-?10|cie-?11|dsm-?5|diagn[oó]sticos?|impresi[oó]n diagn[oó]stica)\b\s*:?/gi, "");
  return value.replace(/\b(?:diagnosticad[oa]\s+en\s+\d{4}|en\s+\d{4})\b.*$/i, "").replace(/^\s*[-:–/|]+/, "").replace(/[\s/|]+$/g, "").replace(/\s+/g, " ").trim();
}

function diagnosticItems(line = "", explicitSection = false) {
  const codeMatches = [...line.matchAll(/\b(?:[A-Z]\d{2}(?:\.\d{1,2})?|\d[A-Z][0-9A-Z]{2,})\b/gi)];
  if (codeMatches.length > 1) {
    return codeMatches.map((match, index) => line.slice(match.index, codeMatches[index + 1]?.index ?? line.length).replace(/^\s*[\/|,;-]+/, "").trim()).filter(Boolean);
  }
  if (!explicitSection || /\bepisodio\s+actual\b/i.test(line)) return [line];
  return line.split(/\s+[\/|]\s+|\s*,\s*(?!episodio\b)|\s+\by\b\s+/i).map((item) => item.trim()).filter((item) => item.length >= 4);
}

function occurrenceCount(fullText = "", name = "") {
  const needle = normalizeText(name);
  if (!needle || needle.length < 5) return 1;
  const haystack = normalizeText(fullText);
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return Math.max(1, count);
}

const DIAGNOSIS_BY_CODE = new Map(
  CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.map((item) => [String(item.codigo || "").toUpperCase(), item])
);

function stripDiagnosisStatus(value = "") {
  const match = String(value || "").trim().match(/\s+(SE\s+AGREGA|SE\s+DESCARTA|A\s+DESCARTAR|PROBABLE|EN\s+REMISI[ÓO]N)\s*$/i);
  if (!match) return { name: String(value || "").trim(), status: "Confirmado" };
  const statusText = normalizeText(match[1]);
  const status = statusText === "se descarta" ? "Descartado"
    : statusText === "a descartar" ? "A descartar"
      : statusText === "probable" ? "Probable"
        : statusText === "en remision" ? "Remisión"
          : "Confirmado";
  return { name: String(value || "").slice(0, match.index).trim(), status };
}

function splitConcatenatedDiagnosisNames(value = "", codes = []) {
  const raw = String(value || "").trim();
  if (!raw || codes.length <= 1) return raw ? [raw] : [];
  const normalized = normalizeText(raw);
  const starts = codes.map((code) => {
    const catalogName = DIAGNOSIS_BY_CODE.get(String(code).toUpperCase())?.nombre || "";
    return catalogName ? normalized.indexOf(normalizeText(catalogName)) : -1;
  });
  if (starts.filter((value) => value >= 0).length === codes.length) {
    return starts.map((start, index) => raw.slice(start, starts[index + 1] ?? raw.length).trim());
  }
  const camelChunks = raw.split(/(?<=[\p{Ll}])(?=[\p{Lu}])/u).map((item) => item.trim()).filter(Boolean);
  return camelChunks.length === codes.length ? camelChunks : [raw];
}

/** Extrae filas Diagnóstico/CIE manteniendo la relación posicional de ambas columnas. */
export function parseDiagnosisTable(table = {}, { documentId = "", sourceNoteId = "" } = {}) {
  const rows = table.rows || [];
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeText);
  const diagnosisColumn = headers.findIndex((header) => /diagnostico/.test(header));
  const codeColumn = headers.findIndex((header) => /cie\s*-?\s*10|codigo/.test(header));
  if (diagnosisColumn < 0 || codeColumn < 0) return [];

  const candidates = [];
  rows.slice(1).forEach((row, rowIndex) => {
    const codes = [...String(row[codeColumn] || "").matchAll(/\b[A-Z]\d{2}(?:\.\d{1,2})?\b/gi)].map((match) => match[0].toUpperCase());
    let names = String(row[diagnosisColumn] || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (names.length !== codes.length) names = splitConcatenatedDiagnosisNames(row[diagnosisColumn], codes);
    codes.forEach((code, index) => {
      const rawText = names[index] || DIAGNOSIS_BY_CODE.get(code)?.nombre || code;
      const parsed = stripDiagnosisStatus(rawText);
      candidates.push({
        id: `${sourceNoteId || documentId || "doc"}-dx-table-${table.source?.tableIndex ?? table.source?.blockIndex ?? 0}-${rowIndex}-${index}`,
        rawText,
        normalizedName: parsed.name,
        normalizedLabel: parsed.name,
        code,
        codingSystem: "CIE-10",
        statusSuggestion: parsed.status,
        temporality: "current",
        negated: parsed.status === "Descartado",
        sourceNoteId: sourceNoteId || documentId,
        sourceNoteIds: [sourceNoteId || documentId],
        sourceSection: "diagnosticos",
        sourceOccurrences: 1,
        sourceFragments: [rawText],
        diagnosticGroupId: `${sourceNoteId || documentId}-diagnosis-table-${table.source?.tableIndex ?? rowIndex}`,
        sourceLocation: { ...(table.source || {}), rowIndex: rowIndex + 1 },
        sourceBlockIndex: table.source?.blockIndex ?? null,
        detectionRule: "diagnosis-table-row",
        selectedForImport: false,
        include: false,
        confirmedByDoctor: false
      });
    });
  });
  return candidates;
}

export function detectDiagnosisCandidates({ sections = {}, fullText = "", sourceBlocks = [], documentId = "", sourceNoteId = "" } = {}) {
  const sources = sourceEntries(sections, fullText, ["diagnosticos", "analisis", "subjetivo", "plan"]);
  const candidates = sourceBlocks.filter((block) => block.type === "table").flatMap((table) => parseDiagnosisTable(table, { documentId, sourceNoteId }));
  if (candidates.length) return candidates;
  const byKey = new Map(candidates.map((candidate) => [`${candidate.codingSystem}:${normalizeText(candidate.code)}`, candidate]));

  sources.forEach(({ section, text, fallback }) => splitClinicalLines(text).forEach(({ text: sourceLine, index }) => {
    diagnosticItems(sourceLine, section === "diagnosticos").forEach((line, itemIndex) => {
      const code = line.match(/\b(?:[A-Z]\d{2}(?:\.\d{1,2})?|\d[A-Z][0-9A-Z]{2,})\b/i)?.[0] || "";
      const explicitPhrase = /(?:diagn[oó]stico\s+de|diagnosticad[oa]|cuenta\s+con\s+diagn[oó]stico|antecedente\s+de|probable|a\s+descartar)/i.test(line);
      if (!(code || explicitPhrase || section === "diagnosticos")) return;
      const normalizedName = diagnosisName(line, code) || code;
      if (!normalizedName || normalizedName.length < 3) return;
      const statusSuggestion = statusForDiagnosis(sourceLine);
      const negated = /\b(?:niega|sin antecedente|se descart[oó]|se descarta)\b/i.test(sourceLine);
      const system = codingSystem(code, sourceLine);
      const key = code ? `${system}:${normalizeText(code)}` : `${normalizeText(normalizedName)}:${statusSuggestion}:${sourceNoteId || documentId}`;
      const occurrences = occurrenceCount(fullText || text, normalizedName);
      const existing = byKey.get(key);
      if (existing) {
        existing.sourceOccurrences = Math.max(existing.sourceOccurrences, occurrences);
        existing.sourceFragments = [...new Set([...existing.sourceFragments, sourceLine])];
        return;
      }
      const candidate = {
        id: `${sourceNoteId || documentId || "doc"}-dx-${section}-${index}-${itemIndex}`,
        rawText: line,
        normalizedName,
        normalizedLabel: normalizedName,
        code: code || null,
        codingSystem: system,
        statusSuggestion,
        temporality: statusSuggestion === "Antecedente" ? "historical" : "current",
        negated,
        sourceNoteId: sourceNoteId || documentId,
        sourceNoteIds: [sourceNoteId || documentId],
        sourceSection: section,
        sourceOccurrences: occurrences,
        sourceFragments: [sourceLine],
        diagnosticGroupId: `${sourceNoteId || documentId}-diagnosis-${section}-${index}`,
        sourceLocation: { documentId, lineIndex: index },
        sourceBlockIndex: sourceBlocks[index]?.source?.blockIndex ?? null,
        detectionRule: occurrences >= 2 && fallback ? "repeated-diagnostic-concept" : code ? "codigo-clinico" : "frase-diagnostica-explicita",
        selectedForImport: false,
        include: false,
        confirmedByDoctor: false
      };
      byKey.set(key, candidate);
      candidates.push(candidate);
    });
  }));

  const repeatedConcepts = [...String(fullText || "").matchAll(/\b(?:trastorno\s+(?:de\s+)?(?:depresivo|bipolar|psic[oó]tico|de\s+ansiedad|por\s+consumo\s+de\s+[a-záéíóúñ]+)|episodio\s+depresivo|s[ií]ndrome\s+catat[oó]nico)\b/gi)];
  const conceptsByName = new Map();
  repeatedConcepts.forEach((match) => {
    const key = normalizeText(match[0]);
    const entry = conceptsByName.get(key) || { name: match[0].trim(), count: 0, offsets: [] };
    entry.count += 1;
    entry.offsets.push(match.index);
    conceptsByName.set(key, entry);
  });
  conceptsByName.forEach((entry, key) => {
    if (entry.count < 2 || [...byKey.keys()].some((candidateKey) => candidateKey.includes(key))) return;
    candidates.push({
      id: `${sourceNoteId || documentId || "doc"}-dx-repeated-${key.replace(/[^a-z0-9]+/g, "-")}`,
      rawText: entry.name,
      normalizedName: entry.name,
      normalizedLabel: entry.name,
      code: null,
      codingSystem: "",
      statusSuggestion: "En seguimiento",
      temporality: "unknown",
      negated: false,
      sourceNoteId: sourceNoteId || documentId,
      sourceNoteIds: [sourceNoteId || documentId],
      sourceSection: "texto_completo",
      sourceOccurrences: entry.count,
      sourceFragments: entry.offsets,
      diagnosticGroupId: `${sourceNoteId || documentId}-diagnosis-repeated`,
      sourceLocation: { documentId, offsets: entry.offsets },
      sourceBlockIndex: null,
      detectionRule: "repeated-diagnostic-concept",
      selectedForImport: false,
      include: false,
      confirmedByDoctor: false
    });
  });
  return candidates;
}

const medicationNames = [...new Set(MEDICAMENTOS_MAESTROS.map((item) => String(item.nombre || "").trim()).filter(Boolean))];
function escapeRegex(value = "") { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function medicationMentions(line = "") {
  return [...new Set(medicationNames.filter((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(line)))];
}

function manualMedicationName(line = "") {
  const clean = String(line).replace(/^\s*(?:\d+|[a-z])[.)-]\s*/i, "").trim();
  if (/^(?:tomar|administrar|adminitrar|aplicar|continuar|vigilar|dosis|cada|por\s+la|\d+\s+veces|[¼½¾])\b/i.test(clean)) return "";
  const match = clean.match(/^(.+?)(?=\s+(?:tabletas?|cápsulas?|capsulas?|jarabe|soluci[oó]n|polvo|sobres?|ampolletas?|\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ml|mL)\b|INICIA\b|SUSPENDER\b|AUMENTA\b|DISMINUYE\b|CAMBIA\b|CONTINÚA\b))/i);
  return match?.[1]?.trim() || "";
}

function quantityValue(value = "") {
  if (value === "¼" || value === "1/4") return 0.25;
  if (value === "½" || value === "1/2") return 0.5;
  if (value === "¾" || value === "3/4") return 0.75;
  return Number(String(value).replace(",", "."));
}

function normalizeScheduleTime(value = "") {
  const [hour, minute = "00"] = String(value).split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function medicationCandidate({ name, line, index, section, documentId, sourceNoteId }) {
  const match = new RegExp(`\\b${escapeRegex(name)}\\b([^\\n;]*)`, "i").exec(line);
  const detail = match?.[1] || line;
  const dose = detail.match(/\b(\d+(?:[.,]\d+)?|1\/2|½)\s*(mg|g|mcg|µg|ml|mL|tabletas?|c[aá]psulas?|gotas?)\b/i);
  const route = detail.match(/\b(v[ií]a oral|oral|vo|sublingual|intramuscular|intravenosa|t[oó]pica|inhalada)\b/i)?.[1] || "";
  const frequency = detail.match(/\b(\d+\s+veces\s+al\s+d[ií]a|cada\s+\d+\s*horas?|al d[ií]a|por la noche|por la ma[nñ]ana|1-0-1|prn|diario)\b/i)?.[1] || "";
  const presentation = detail.match(/\b(tabletas?|c[aá]psulas?|jarabe|soluci[oó]n(?:\s+oral)?|polvo|sobres?|ampolletas?|gotas?)\b/i)?.[1] || "";
  const scheduleDetails = [...String(line).matchAll(/(?:tomar\s+)?(¼|½|¾|1\/4|1\/2|3\/4|\d+(?:[.,]\d+)?)\s*(?:de\s+)?(tabletas?|c[aá]psulas?|ml|mL|gotas?)\s+(?:a\s+las\s+)?(\d{1,2}(?::\d{2})?)\s*h?/gi)].map((item) => ({
    time: normalizeScheduleTime(item[3]),
    quantity: quantityValue(item[1]),
    unit: item[2]
  }));
  const catalogItem = medicamentoPorTexto(name);
  const statusSuggestion = statusForTreatment(line);
  return {
    id: `${sourceNoteId || documentId || "doc"}-tx-${section}-${index}-${normalizeText(name)}`,
    medicationId: catalogItem?.id || catalogItem?.nombre || "",
    medicationName: catalogItem?.nombre || name,
    genericName: catalogItem?.genericName || catalogItem?.nombre || name,
    presentation,
    strength: dose?.[1] ? quantityValue(dose[1]) : "",
    strengthUnit: dose?.[2] || "",
    dose: dose?.[1] ? String(quantityValue(dose[1])) : "",
    doseUnit: dose?.[2] || "",
    route,
    frequencyRaw: frequency,
    schedule: scheduleDetails.length ? scheduleDetails.map((item) => `${item.quantity} ${item.unit} ${item.time}`).join("; ") : frequency,
    scheduleDetails,
    duration: detail.match(/\bdurante\s+[^,.;]+/i)?.[0] || "",
    statusSuggestion,
    temporality: statusSuggestion === "Antecedente" ? "historical" : "current",
    sourceText: line,
    sourceNoteId: sourceNoteId || documentId,
    sourceNoteIds: [sourceNoteId || documentId],
    sourceSection: section,
    sourceOccurrences: 1,
    sourceFragments: [line],
    treatmentGroupId: `${sourceNoteId || documentId}-medication-${section}-${index}`,
    sourceLocation: { documentId, lineIndex: index },
    detectionRule: dose ? "medication-with-dose" : catalogItem ? "medication-catalog-mention" : "explicit-medication-list-item",
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false
  };
}

export function parseMedicationList(text = "", context = {}) {
  return splitMedicationLines(text).flatMap(({ text: line, index }) => {
    const mentions = medicationMentions(line);
    const manual = mentions.length ? "" : manualMedicationName(line);
    return [...mentions, ...(manual ? [manual] : [])].map((name) => medicationCandidate({
      name,
      line,
      index,
      section: "medicamentos",
      documentId: context.documentId,
      sourceNoteId: context.sourceNoteId
    }));
  });
}

export function detectTreatmentCandidates({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog = MEDICAMENTOS_MAESTROS, documentId = "", sourceNoteId = "" } = {}) {
  void sourceBlocks;
  void medicationCatalog;
  const hasExplicitMedicationList = Boolean(String(sections.medicamentos || "").trim());
  const sources = hasExplicitMedicationList
    ? [{ section: "medicamentos", text: sections.medicamentos }]
    : sourceEntries(sections, fullText, ["tratamiento", "plan", "subjetivo", "analisis"]);
  const candidates = [];
  const byKey = new Map();
  sources.forEach(({ section, text, fallback }) => (section === "medicamentos" ? splitMedicationLines(text) : splitClinicalLines(text)).forEach(({ text: line, index }) => {
    if (/\b(?:niega|sin uso de|no usa|no toma)\b/i.test(line)) return;
    const names = medicationMentions(line);
    const manual = section === "medicamentos" && !names.length ? manualMedicationName(line) : "";
    [...names, ...(manual ? [manual] : [])].forEach((name) => {
      const candidate = medicationCandidate({ name, line, index, section, documentId, sourceNoteId });
      const count = occurrenceCount(fullText || text, candidate.medicationName);
      const explicitSection = section === "medicamentos" || section === "tratamiento" || section === "plan";
      if (!explicitSection && !candidate.dose && count < 2 && fallback) return;
      const key = `${normalizeText(candidate.medicationId || candidate.medicationName)}:${normalizeText(candidate.dose)}:${normalizeText(candidate.frequencyRaw)}:${sourceNoteId || documentId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.sourceOccurrences = Math.max(existing.sourceOccurrences, count);
        existing.sourceFragments = [...new Set([...existing.sourceFragments, line])];
        return;
      }
      candidate.sourceOccurrences = count;
      if (count >= 2 && !candidate.dose && !explicitSection) candidate.detectionRule = "repeated-medication";
      byKey.set(key, candidate);
      candidates.push(candidate);
    });
  }));
  return candidates;
}

export function extractClinicalCandidates(document = {}) {
  return {
    diagnoses: detectDiagnosisCandidates({ sections: document.sections, fullText: document.fullText, sourceBlocks: document.blocks, documentId: document.id, sourceNoteId: document.sourceNoteId }),
    treatments: detectTreatmentCandidates({ sections: document.sections, fullText: document.fullText, sourceBlocks: document.blocks, documentId: document.id, sourceNoteId: document.sourceNoteId })
  };
}
