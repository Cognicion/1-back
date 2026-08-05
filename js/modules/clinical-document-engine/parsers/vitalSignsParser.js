import { ClinicalCandidate } from "../core/ClinicalCandidate.js";
import { ClinicalEvidence } from "../core/ClinicalEvidence.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { clinicalImportLogger } from "../utils/logger.js";

const VERSION = "1.0";

function normalizeHeader(value = "") {
  const text = normalizeClinicalComparisonText(value);
  if (["bloodPressure", "temperature", "heartRate", "respiratoryRate", "oxygenSaturation", "capillaryGlucose", "weight", "height", "bmi"].includes(value)) return value;
  if (/presion arterial|\bpa\b|tension arterial|\bta\b/.test(text)) return "bloodPressure";
  if (/temperatura|\btemp\b/.test(text)) return "temperature";
  if (/frecuencia cardiaca|\bfc\b|cardiaca/.test(text)) return "heartRate";
  if (/frecuencia respiratoria|\bfr\b|respiratoria/.test(text)) return "respiratoryRate";
  if (/sato2|sat ?o2|saturacion|spo2/.test(text)) return "oxygenSaturation";
  if (/glucemia|glucosa/.test(text)) return "capillaryGlucose";
  if (/peso/.test(text)) return "weight";
  if (/talla|estatura/.test(text)) return "height";
  if (/\bimc\b|indice de masa/.test(text)) return "bmi";
  return "";
}

function numberFrom(value = "") {
  const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseBloodPressure(value = "") {
  const match = String(value || "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return match ? { systolic: Number(match[1]), diastolic: Number(match[2]) } : null;
}

function parseValue(vitalType, rawValue = "") {
  if (vitalType === "bloodPressure") return parseBloodPressure(rawValue);
  const value = numberFrom(rawValue);
  if (value === null) return null;
  if (vitalType === "height" && /cm\b/i.test(rawValue)) return Number((value / 100).toFixed(2));
  return value;
}

function unitFor(vitalType, rawValue = "") {
  if (vitalType === "bloodPressure") return "mmHg";
  if (vitalType === "temperature") return "°C";
  if (vitalType === "heartRate") return "lpm";
  if (vitalType === "respiratoryRate") return "rpm";
  if (vitalType === "oxygenSaturation") return "%";
  if (vitalType === "capillaryGlucose") return "mg/dL";
  if (vitalType === "weight") return "kg";
  if (vitalType === "height") return "m";
  if (vitalType === "bmi") return "kg/m²";
  return String(rawValue).match(/(mmHg|mg\/dL|kg\/m²|kg|cm|m|%|°C|lpm|rpm)/i)?.[1] || "";
}

function createCandidate({ vitalType, rawValue, block, rowIndex, columnIndex, sourceType, documentId, noteId, date, time }) {
  const value = parseValue(vitalType, rawValue);
  if (value === null) return null;
  const unit = unitFor(vitalType, rawValue);
  const confidence = evaluateConfidence({ table: sourceType === "table", inferred: sourceType === "text", freeText: sourceType !== "table" });
  return new ClinicalCandidate({
    id: `${documentId || "doc"}-vital-${noteId || "note"}-${vitalType}-${block?.source?.blockIndex ?? 0}-${rowIndex}-${columnIndex}`,
    type: "vitalSign",
    value,
    confidence,
    requiresReview: requiresReviewForConfidence(confidence),
    evidence: [new ClinicalEvidence({ documentId, page: block?.source?.pageIndex ?? null, block: block?.source?.blockIndex ?? null, offsetStart: null, offsetEnd: null, heading: "signos vitales", rawText: String(rawValue || ""), confidence })],
    metadata: { noteId, sourceType, sourceSection: "signosVitales", parser: "midc.vitalSignsParser", parserVersion: VERSION, rowIndex, columnIndex }
  });
}

function decorate(candidate, vitalType, rawValue, date, time) {
  const value = candidate.value;
  Object.assign(candidate, {
    candidateType: "vitalSign",
    vitalType,
    value,
    unit: unitFor(vitalType, rawValue),
    date,
    time,
    rawValue: String(rawValue || ""),
    parserVersion: VERSION,
    evidence: candidate.evidence
  });
  return candidate;
}

export function parseVitalSignsTable(table = {}, { documentId = "", noteId = "", date = "", time = "" } = {}) {
  const rows = table.rows || [];
  if (!rows.length) return [];
  const candidates = [];
  const add = (header, rawValue, rowIndex, columnIndex) => {
    const vitalType = normalizeHeader(header);
    if (!vitalType || !String(rawValue || "").trim()) return;
    const candidate = createCandidate({ vitalType, rawValue, block: table, rowIndex, columnIndex, sourceType: "table", documentId, noteId, date, time });
    if (candidate) candidates.push(decorate(candidate, vitalType, rawValue, date, time));
  };
  rows.forEach((row, rowIndex) => {
    for (let index = 0; index < row.length - 1; index += 1) {
      if (normalizeHeader(row[index]) && !normalizeHeader(row[index + 1])) add(row[index], row[index + 1], rowIndex, index + 1);
    }
  });
  if (rows.length >= 2) {
    const headers = rows[0].map(normalizeHeader);
    if (headers.filter(Boolean).length >= 2) rows.slice(1).forEach((row, rowIndex) => headers.forEach((key, columnIndex) => key && add(key, row[columnIndex], rowIndex + 1, columnIndex)));
  }
  return candidates.filter((candidate, index, all) => all.findIndex((other) => other.vitalType === candidate.vitalType) === index);
}

export function parseVitalSignsText(text = "", context = {}) {
  const candidates = [];
  const patterns = [
    ["bloodPressure", /(?:presion arterial|\bpa\b|tension arterial)\s*[:\-]?\s*([^;\n|]+)/i],
    ["temperature", /(?:temperatura|temp)\s*[:\-]?\s*([^;\n|]+)/i],
    ["heartRate", /(?:frecuencia cardiaca|\bfc\b)\s*[:\-]?\s*([^;\n|]+)/i],
    ["respiratoryRate", /(?:frecuencia respiratoria|\bfr\b)\s*[:\-]?\s*([^;\n|]+)/i],
    ["oxygenSaturation", /(?:saturacion|sat ?o2|sato2|spo2)\s*[:\-]?\s*([^;\n|]+)/i],
    ["capillaryGlucose", /(?:glucemia|glucosa)\s*[:\-]?\s*([^;\n|]+)/i],
    ["weight", /peso\s*[:\-]?\s*([^;\n|]+)/i],
    ["height", /(?:talla|estatura)\s*[:\-]?\s*([^;\n|]+)/i],
    ["bmi", /(?:\bimc\b|indice de masa)\s*[:\-]?\s*([^;\n|]+)/i]
  ];
  patterns.forEach(([vitalType, pattern], index) => {
    const match = String(text || "").match(pattern);
    if (!match) return;
    const candidate = createCandidate({ vitalType, rawValue: match[1], block: context.block, rowIndex: null, columnIndex: null, sourceType: "text", documentId: context.documentId, noteId: context.noteId, date: context.date, time: context.time });
    if (candidate) candidates.push(decorate(candidate, vitalType, match[1], context.date || "", context.time || ""));
    void index;
  });
  return candidates;
}

export function parseVitalSigns({ blocks = [], text = "", documentId = "", noteId = "", date = "", time = "" } = {}) {
  clinicalImportLogger.info("vitalParser:start", JSON.stringify({ documentId, noteId, blockCount: blocks.length, textLength: String(text || "").length }));
  const tableCandidates = blocks.filter((block) => block.type === "table").flatMap((block) => parseVitalSignsTable(block, { documentId, noteId, date, time }));
  const candidates = tableCandidates.length ? tableCandidates : parseVitalSignsText(text, { documentId, noteId, date, time });
  candidates.forEach((candidate) => clinicalImportLogger.info("vitalParser:entity", JSON.stringify({ documentId, noteId, vitalType: candidate.vitalType, confidence: candidate.confidence, block: candidate.evidence?.[0]?.block })));
  clinicalImportLogger.info("vitalParser:finished", JSON.stringify({ documentId, noteId, count: candidates.length }));
  return candidates;
}

export function extractVitalSignCandidates(args = {}) { return parseVitalSigns(args); }
