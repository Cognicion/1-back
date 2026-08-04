import { MEDICAMENTOS, medicamentoPorTexto } from "../../../data/medicamentos.js";

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

function escapeRegex(value = "") { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function medicationMentions(line = "") {
  const found = medicationNames.filter((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(line));
  return [...new Set(found)];
}

function medicationCandidate({ name, line, index, section, documentId, fullText }) {
  const match = new RegExp(`\\b${escapeRegex(name)}\\b([^\n;]*)`, "i").exec(line);
  const detail = match?.[1] || "";
  const dose = detail.match(/\b(\d+(?:[.,]\d+)?|1\/2)\s*(mg|g|mcg|µg|ml|mL|tabletas?|c[aá]psulas?|gotas?)\b/i);
  const route = detail.match(/\b(v[ií]a oral|oral|vo|sublingual|intramuscular|intravenosa|t[oó]pica|inhalada)\b/i)?.[1] || "";
  const frequency = detail.match(/\b(cada\s+\d+\s*horas?|al d[ií]a|por la noche|por la ma[nñ]ana|1-0-1|prn|diario)\b/i)?.[1] || "";
  const catalogItem = medicamentoPorTexto(name);
  return {
    id: `${documentId || "doc"}-tx-${section}-${index}-${normalizeText(name)}`,
    medicationId: catalogItem?.id || catalogItem?.nombre || "",
    medicationName: catalogItem?.nombre || name,
    genericName: catalogItem?.nombre || name,
    dose: dose?.[1]?.replace(",", ".") || "",
    doseUnit: dose?.[2] || "",
    route,
    frequencyRaw: frequency,
    schedule: frequency,
    duration: detail.match(/\bdurante\s+[^,.;]+/i)?.[0] || "",
    statusSuggestion: statusForTreatment(line),
    temporality: statusForTreatment(line) === "Antecedente" ? "historical" : "current",
    sourceText: line,
    sourceSection: section,
    sourceLocation: { documentId, lineIndex: index },
    selectedForImport: false,
    include: false,
    confirmedByDoctor: false
  };
}

export function detectTreatmentCandidates({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog = MEDICAMENTOS, documentId = "" } = {}) {
  void sourceBlocks;
  void medicationCatalog;
  const sources = sourceEntries(sections, fullText, ["tratamiento", "plan", "subjetivo"]);
  const candidates = [];
  const seen = new Set();
  sources.forEach(({ section, text }) => splitLines(text).forEach(({ text: line, index }) => {
    if (/\b(?:niega|sin uso de|no usa|no toma)\b/i.test(line)) return;
    medicationMentions(line).forEach((name) => {
      const candidate = medicationCandidate({ name, line, index, section, documentId, fullText });
      const key = `${normalizeText(candidate.medicationName)}:${normalizeText(candidate.dose)}:${section}:${index}`;
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
    treatments: detectTreatmentCandidates({ sections: document.sections, fullText: document.fullText, sourceBlocks: document.blocks, documentId: document.id })
  };
}
