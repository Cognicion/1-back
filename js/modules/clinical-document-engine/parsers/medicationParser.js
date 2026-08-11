import { MEDICAMENTOS, MEDICAMENTOS_MAESTROS } from "../../../data/medicamentos.js";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";
import { ClinicalEvidence } from "../core/ClinicalEvidence.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { normalizeMedicationName, normalizeMedicationPresentation, normalizeMedicationRoute, normalizeMedicationFrequency, parseClinicalQuantity, parseMedicationStrength, parseMedicationSchedules, splitMedicationItems } from "../normalizers/medicationNormalizer.js";
import { clinicalImportLogger } from "../utils/logger.js";

const VERSION = "1.0";
const PARSER = "midc.medicationParser";
const MANUAL_NAMES = ["Sertralina", "Pregabalina", "Espironolactona", "Colchicina", "Yasmin", "Lactobacilos", "Lamotrigina"];

function catalogNames(catalog = MEDICAMENTOS) {
  return [...new Set([...catalog, ...MEDICAMENTOS_MAESTROS].flatMap((item) => [item.nombre, item.nombreGenerico]).concat(MANUAL_NAMES).filter(Boolean))].sort((a, b) => String(b).length - String(a).length);
}

function findMedicationName(item = "", catalog = MEDICAMENTOS) {
  const names = catalogNames(catalog);
  const match = names.find((name) => new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(item));
  if (match) return match;
  const manual = String(item).match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ-]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ-]+){0,2})(?=\s+(?:tabletas?|cápsulas?|capsulas?|jarabe|polvo|\d|tomar|administrar|vía|via)|$)/i);
  const value = manual?.[1]?.trim() || "";
  if (/^antecedente\s+de$/i.test(value)) return "";
  if (/^(?:tomar|administrar|aplicar|via|oral|se|se inicio|se inició|inicia|inicio|suspende|suspendio|suspendió|se suspendio|se suspendió|suspender|aumenta|disminuye|cambia|recibio|recibió|previamente|previo|antecedente)$/i.test(value)) return "";
  return value;
}

function actionFromText(text = "") {
  const value = normalizeClinicalComparisonText(text);
  if (/cambia\s+presentacion/.test(value)) return "Cambia presentación";
  if (/\b(?:suspende|suspendio|suspendió|suspender|suspendido)\b/.test(value)) return "Suspende";
  if (/\b(?:inicia|inicio|iniciar)\b/.test(value)) return "Inicia";
  if (/\b(?:aumenta|aumentar|aumento)\b/.test(value)) return "Aumenta";
  if (/\b(?:disminuye|disminuir|disminuyo|reduce)\b/.test(value)) return "Disminuye";
  if (/\b(?:antecedente|recibio|previamente|previo|manejo\s+a\s+base|en\s+\d{4})\b/.test(value)) return "Antecedente";
  return "Continúa";
}

export function medicationCandidateCompleteness(candidate = {}) {
  const fields = [
    candidate.medicationName,
    candidate.presentation,
    candidate.strength,
    candidate.strengthUnit,
    candidate.administrationQuantity,
    candidate.administrationUnit,
    candidate.route,
    candidate.frequency,
    Array.isArray(candidate.schedule) && candidate.schedule.length ? candidate.schedule : null
  ];
  return fields.filter((value) => value !== null && value !== undefined && value !== "").length;
}

function administrationFromText(text = "", schedule = []) {
  const match = normalizeClinicalComparisonText(text).match(/(?:tomar|administrar|aplicar)\s+(\d+(?:[.,]\d+)?|una|un|uno|dos|tres|½|¼|¾|\d+\/\d+)\s*(?:de\s+)?(tabletas?|capsulas?|comprimidos?|ml|mililitros|cucharadas?|cucharaditas?|gotas?)/i);
  if (match) return { quantity: parseClinicalQuantity(match[1]), unit: match[2].toLowerCase() };
  const first = schedule.find((item) => item.quantity != null);
  return { quantity: first?.quantity ?? null, unit: first?.unit || "" };
}

function createCandidate({ item, itemIndex, section, documentId, noteId, date, catalog }) {
  const medicationName = findMedicationName(item, catalog);
  if (!medicationName) return null;
  const nameIndex = normalizeClinicalComparisonText(item).indexOf(normalizeClinicalComparisonText(medicationName));
  const detail = nameIndex >= 0 ? item.slice(nameIndex) : item;
  const strength = parseMedicationStrength(detail);
  const schedule = parseMedicationSchedules(detail);
  const frequency = normalizeMedicationFrequency(detail.replace(/\b(1|una)\s+veces\b/i, "$1 vez"));
  const administration = administrationFromText(detail, schedule);
  const presentation = normalizeMedicationPresentation(detail);
  const route = normalizeMedicationRoute(detail);
  const action = actionFromText(item);
  const confidence = evaluateConfidence({
    explicitHeading: Boolean(section) && Boolean(strength.strength) && Boolean(route) && Boolean(frequency.key),
    inferred: Boolean(strength.strength),
    freeText: true
  });
  const candidate = new ClinicalCandidate({
    id: `${documentId || "doc"}-tx-${noteId || "note"}-${itemIndex}-${normalizeClinicalComparisonText(medicationName)}`,
    type: "medication",
    value: null,
    confidence,
    requiresReview: requiresReviewForConfidence(confidence),
    warnings: [],
    evidence: [new ClinicalEvidence({ documentId, block: null, heading: section, rawText: item, confidence })],
    metadata: { noteId, sourceSection: section, parser: PARSER, parserVersion: VERSION, frequencyRaw: frequency.text, sourceSpan: { start: null, end: null, itemIndex } }
  });
  Object.assign(candidate, {
    candidateType: "medication",
    medicationName,
    normalizedMedicationName: normalizeMedicationName(medicationName),
    presentation,
    strength: strength.strength,
    strengthUnit: strength.strengthUnit,
    strengthPerValue: strength.strengthPerValue,
    strengthPerUnit: strength.strengthPerUnit,
    route,
    frequency: frequency.key,
    frequencyRaw: frequency.text,
    administrationQuantity: administration.quantity,
    administrationUnit: administration.unit,
    schedule,
    action,
    status: action,
    date,
    parserVersion: VERSION,
    evidence: candidate.evidence,
    metadata: { ...candidate.metadata, rawMedicationText: item, sourceSpan: { ...candidate.metadata.sourceSpan, rawText: item } }
  });
  return candidate;
}

/** Parser nativo MIDC de medicamentos; una entidad estructurada por inciso. */
export function parseMedicationCandidates({ text = "", section = "tratamiento", documentId = "", noteId = "", date = "", medicationCatalog = MEDICAMENTOS } = {}) {
  clinicalImportLogger.info("medicationParser:start", JSON.stringify({ documentId, noteId, section, sourceLength: String(text || "").length }));
  const items = splitMedicationItems(text, medicationCatalog);
  clinicalImportLogger.info("medicationParser:input-count", JSON.stringify({ documentId, noteId, count: items.length }));
  const candidates = items.filter((item) => !/\b(?:niega|sin\s+uso\s+de|no\s+usa|no\s+toma)\b/i.test(item)).map((item, itemIndex) => {
    const candidate = createCandidate({ item, itemIndex, section, documentId, noteId, date, catalog: medicationCatalog });
    if (candidate && new RegExp(`\\b(?:niega|sin\\s+uso\\s+de|no\\s+usa|no\\s+toma)\\b[^.]{0,80}\\b${candidate.medicationName.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(text)) return null;
    if (candidate) {
      const namePosition = normalizeClinicalComparisonText(text).indexOf(normalizeClinicalComparisonText(candidate.medicationName));
      const context = namePosition >= 0 ? normalizeClinicalComparisonText(text).slice(Math.max(0, namePosition - 70), namePosition + item.length) : item;
      const contextualAction = actionFromText(context);
      if (contextualAction !== "Continúa") { candidate.action = contextualAction; candidate.status = contextualAction; }
    }
    return candidate;
  }).filter(Boolean);
  catalogNames(medicationCatalog).forEach((name) => {
    if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(text)) return;
    const normalizedName = normalizeClinicalComparisonText(name);
    if (candidates.some((candidate) => {
      const existing = normalizeClinicalComparisonText(candidate.medicationName);
      const sameResolvedEntity = existing === normalizedName || existing.split(/\s+/).includes(normalizedName) || existing.startsWith(`${normalizedName} `);
      return sameResolvedEntity && medicationCandidateCompleteness(candidate) >= 1;
    })) return;
    if (new RegExp(`\\b(?:niega|sin\\s+uso\\s+de|no\\s+usa|no\\s+toma)\\b[^.]{0,80}\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(text)) return;
    const fallback = createCandidate({ item: name, itemIndex: candidates.length, section, documentId, noteId, date, catalog: medicationCatalog });
    if (fallback) {
      const position = normalizeClinicalComparisonText(text).indexOf(normalizeClinicalComparisonText(name));
      const context = position >= 0 ? normalizeClinicalComparisonText(text).slice(Math.max(0, position - 70), position + name.length) : name;
      fallback.action = actionFromText(context);
      fallback.status = fallback.action;
      candidates.push(fallback);
    }
  });
  const comparableText = normalizeClinicalComparisonText(text);
  candidates.sort((left, right) => {
    const leftPosition = comparableText.indexOf(normalizeClinicalComparisonText(left.medicationName));
    const rightPosition = comparableText.indexOf(normalizeClinicalComparisonText(right.medicationName));
    return leftPosition - rightPosition;
  });
  candidates.forEach((candidate) => clinicalImportLogger.info("medicationParser:item", JSON.stringify({ documentId, noteId, candidateId: candidate.id, medicationName: candidate.medicationName, confidence: candidate.confidence, schedulesCount: candidate.schedule.length })));
  clinicalImportLogger.info("medicationParser:output-count", JSON.stringify({ documentId, noteId, count: candidates.length }));
  clinicalImportLogger.info("medicationParser:finished", JSON.stringify({ documentId, noteId, itemCount: items.length, candidateCount: candidates.length }));
  return candidates;
}

export function detectMedicationCandidates({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog = MEDICAMENTOS, documentId = "", noteId = "", date = "" } = {}) {
  const sources = Object.entries(sections).filter(([section, value]) => /tratamiento|medicamentos|plan|subjetivo/.test(section) && String(value || "").trim());
  if (!sources.length && String(fullText || "").trim()) sources.push(["texto_completo", fullText]);
  const result = [];
  sources.forEach(([section, text]) => parseMedicationCandidates({ text, section, documentId, noteId, date, medicationCatalog }).forEach((candidate) => {
    if (!result.some((existing) => existing.normalizedMedicationName === candidate.normalizedMedicationName && existing.action === candidate.action && existing.sourceSection === candidate.sourceSection && existing.date === date)) result.push(candidate);
  }));
  void sourceBlocks;
  return result;
}
