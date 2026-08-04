import { MEDICAMENTOS, medicamentoPorTexto } from "../../../data/medicamentos.js";

function normalizeText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitClinicalLines(text = "") {
  return String(text || "")
    .split(/\r?\n|(?:^|\s)[•●▪]\s*|;\s+|(?<=[.!?])\s+/)
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
  if (!explicitSection) return [line];
  if (/\bepisodio\s+actual\b/i.test(line)) return [line];
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

export function detectDiagnosisCandidates({ sections = {}, fullText = "", sourceBlocks = [], documentId = "", sourceNoteId = "" } = {}) {
  const sources = sourceEntries(sections, fullText, ["diagnosticos", "analisis", "subjetivo", "plan"]);
  const candidates = [];
  const byKey = new Map();
  sources.forEach(({ section, text, fallback }) => splitClinicalLines(text).forEach(({ text: sourceLine, index }) => {
    diagnosticItems(sourceLine, section === "diagnosticos").forEach((line, itemIndex) => {
      const code = line.match(/\b(?:[A-Z]\d{2}(?:\.\d{1,2})?|\d[A-Z][0-9A-Z]{2,})\b/i)?.[0] || "";
      const explicitPhrase = /(?:diagn[oó]stico\s+de|diagnosticad[oa]|cuenta\s+con\s+diagn[oó]stico|antecedente\s+de|probable|a\s+descartar)/i.test(line);
      const explicit = Boolean(code || explicitPhrase || section === "diagnosticos");
      if (!explicit) return;
      const normalizedName = diagnosisName(line, code) || code;
      if (!normalizedName || normalizedName.length < 3) return;
      const statusSuggestion = statusForDiagnosis(sourceLine);
      const negated = /\b(?:niega|sin antecedente|se descart[oó]|se descarta)\b/i.test(sourceLine);
      const key = code ? `${codingSystem(code, sourceLine)}:${normalizeText(code)}` : `${normalizeText(normalizedName)}:${statusSuggestion}:${sourceNoteId || documentId}`;
      const occurrences = occurrenceCount(fullText || text, normalizedName);
      const existing = byKey.get(key);
      if (existing) {
        existing.sourceOccurrences = Math.max(existing.sourceOccurrences, occurrences);
        existing.sourceFragments.push(sourceLine);
        if (!existing.sourceNoteIds.includes(sourceNoteId || documentId)) existing.sourceNoteIds.push(sourceNoteId || documentId);
        return;
      }
      const candidate = {
        id: `${sourceNoteId || documentId || "doc"}-dx-${section}-${index}-${itemIndex}`,
        rawText: line,
        normalizedName,
        normalizedLabel: normalizedName,
        code: code || null,
        codingSystem: codingSystem(code, sourceLine),
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
    const name = match[0].trim();
    const key = normalizeText(name);
    const entry = conceptsByName.get(key) || { name, count: 0, offsets: [] };
    entry.count += 1;
    entry.offsets.push(match.index);
    conceptsByName.set(key, entry);
  });
  conceptsByName.forEach((entry, key) => {
    if (entry.count < 2) return;
    if ([...byKey.keys()].some((candidateKey) => candidateKey.includes(key))) return;
    const candidate = {
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
    };
    byKey.set(key, candidate);
    candidates.push(candidate);
  });
  return candidates;
}

const medicationNames = [...new Set(MEDICAMENTOS.map((item) => String(item.nombre || "").trim()).filter(Boolean))];
function escapeRegex(value = "") { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function medicationMentions(line = "") {
  return [...new Set(medicationNames.filter((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(line)))];
}

function medicationCandidate({ name, line, index, section, documentId, sourceNoteId }) {
  const match = new RegExp(`\\b${escapeRegex(name)}\\b([^\n;]*)`, "i").exec(line);
  const detail = match?.[1] || "";
  const dose = detail.match(/\b(\d+(?:[.,]\d+)?|1\/2)\s*(mg|g|mcg|µg|ml|mL|tabletas?|c[aá]psulas?|gotas?)\b/i);
  const route = detail.match(/\b(v[ií]a oral|oral|vo|sublingual|intramuscular|intravenosa|t[oó]pica|inhalada)\b/i)?.[1] || "";
  const frequency = detail.match(/\b(cada\s+\d+\s*horas?|al d[ií]a|por la noche|por la ma[nñ]ana|1-0-1|prn|diario)\b/i)?.[1] || "";
  const catalogItem = medicamentoPorTexto(name);
  const statusSuggestion = statusForTreatment(line);
  return {
    id: `${sourceNoteId || documentId || "doc"}-tx-${section}-${index}-${normalizeText(name)}`,
    medicationId: catalogItem?.id || catalogItem?.nombre || "",
    medicationName: catalogItem?.nombre || name,
    genericName: catalogItem?.nombre || name,
    dose: dose?.[1]?.replace(",", ".") || "",
    doseUnit: dose?.[2] || "",
    route,
    frequencyRaw: frequency,
    schedule: frequency,
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
    detectionRule: dose ? "medication-with-dose" : "medication-catalog-mention",
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false
  };
}

export function detectTreatmentCandidates({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog = MEDICAMENTOS, documentId = "", sourceNoteId = "" } = {}) {
  void sourceBlocks;
  void medicationCatalog;
  const sources = sourceEntries(sections, fullText, ["medicamentos", "tratamiento", "plan", "subjetivo", "analisis"]);
  const candidates = [];
  const byKey = new Map();
  sources.forEach(({ section, text, fallback }) => splitClinicalLines(text).forEach(({ text: line, index }) => {
    if (/\b(?:niega|sin uso de|no usa|no toma)\b/i.test(line)) return;
    medicationMentions(line).forEach((name) => {
      const candidate = medicationCandidate({ name, line, index, section, documentId, sourceNoteId });
      const count = occurrenceCount(fullText || text, candidate.medicationName);
      const explicitSection = section === "medicamentos" || section === "tratamiento" || section === "plan";
      if (!explicitSection && !candidate.dose && count < 2 && fallback) return;
      const key = `${normalizeText(candidate.medicationId || candidate.medicationName)}:${normalizeText(candidate.dose)}:${normalizeText(candidate.frequencyRaw)}:${fallback ? "repeated" : candidate.statusSuggestion}:${sourceNoteId || documentId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.sourceOccurrences = Math.max(existing.sourceOccurrences, count);
        existing.sourceFragments.push(line);
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
