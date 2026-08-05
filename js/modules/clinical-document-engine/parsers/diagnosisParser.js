import { BOUNDARY_ALIASES } from "../boundaries/boundaryAliases.js";
import { extractBoundedSection } from "../boundaries/boundaryEngine.js";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";
import { ClinicalEvidence } from "../core/ClinicalEvidence.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { normalizeDiagnosticCode, normalizeDiagnosis as normalizeDiagnosisValue } from "../normalizers/diagnosisNormalizer.js";
import { validateDiagnosis } from "../validators/diagnosisValidator.js";
import { clinicalImportLogger } from "../utils/logger.js";

const PARSER = "midc.diagnosisParser";
const VERSION = "1.0";
const STATUS_ONLY = /^(?:se agrega|se descarta|antecedente|remision|en remision|probable|a descartar|confirmado)$/i;
const END_ALIASES = [...BOUNDARY_ALIASES.plan, ...BOUNDARY_ALIASES.medication, ...BOUNDARY_ALIASES.analysis, ...BOUNDARY_ALIASES.prognosis, ...BOUNDARY_ALIASES.destination, ...BOUNDARY_ALIASES.note];

function diagnosisStatus(text = "") {
  const value = normalizeClinicalComparisonText(text);
  if (/\bse agrega\b/.test(value)) return "Se agrega";
  if (/\b(?:se descarta|se descarto|niega antecedente)\b/.test(value)) return "Descartado";
  if (/\ba descartar\b/.test(value)) return "A descartar";
  if (/\bprobable\b/.test(value)) return "Probable";
  if (/\b(?:en remision|remision)\b/.test(value)) return "Remisión";
  if (/\bantecedente\b|\bdiagnosticad[oa].*\ben\s+\d{4}\b/.test(value)) return "Antecedente";
  return "Confirmado";
}

function splitDiagnosticCodes(text = "") {
  return [...String(text || "").matchAll(/[A-Z]\d{2}(?:\.\d{1,2})?/gi)].map((match) => normalizeDiagnosticCode(match[0])).filter(Boolean);
}

function normalizeDiagnosis(value = "", codes = []) {
  let result = String(value || "");
  codes.forEach((code) => { result = result.replace(new RegExp(code.replace(".", "\\."), "ig"), " "); });
  return normalizeDiagnosisValue(result)
    .replace(/\b(?:cie[- ]?10|cie[- ]?11|icd[- ]?10|diagn[oó]sticos?|impresi[oó]n diagn[oó]stica)\b\s*[:|\-]?/gi, " ")
    .replace(/\b(?:se agrega|se descarta|a descartar|probable|confirmado|antecedente|en remisi[oó]n|remisi[oó]n)\b/gi, " ")
    .replace(/^\s*[-:|–—.]+|[-:|–—.]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSystem(code = "", context = "") {
  if (/\b(?:dsm[- ]?5)\b/i.test(context)) return "DSM-5";
  if (/\bcie[- ]?11\b/i.test(context) || /^\d[A-Z]\d{2,3}$/i.test(code)) return "CIE-11";
  if (/\b(?:cie[- ]?10|icd[- ]?10)\b/i.test(context) || /^[A-Z]\d{2}(?:\.\d{1,2})?$/.test(code)) return "CIE-10";
  return "";
}

function rowsFromBlock(text = "") {
  return String(text || "").split(/\r?\n|(?<=;)\s*/).map((row) => row.replace(/^\s*(?:\d+|[a-z])[.)-]\s*/i, "").trim()).filter(Boolean);
}

function isolateBlock(text = "") {
  const bounded = extractBoundedSection({ text, startAliases: BOUNDARY_ALIASES.diagnosis, boundaryAliases: END_ALIASES });
  return bounded.start ? bounded.value : String(text || "").trim();
}

function createDiagnosisCandidate({ name, code = "", status, rawText, section, documentId, noteId, sourceLocation = {}, requiresReview = false, detectionRule }) {
  const system = detectSystem(code, rawText);
  const confidence = evaluateConfidence({ table: sourceLocation.tableIndex != null, explicitHeading: section === "diagnosticos" && Boolean(code), freeText: !code });
  const candidate = new ClinicalCandidate({
    id: `${documentId || "doc"}-dx-${noteId || "note"}-${sourceLocation.rowIndex ?? sourceLocation.lineIndex ?? 0}-${code || normalizeClinicalComparisonText(name).slice(0, 24)}`,
    type: "diagnosis",
    value: null,
    confidence,
    requiresReview: Boolean(requiresReview || requiresReviewForConfidence(confidence)),
    warnings: code ? [] : ["missing-code"],
    evidence: [new ClinicalEvidence({ documentId, block: sourceLocation.blockIndex ?? null, offsetStart: sourceLocation.startOffset ?? null, offsetEnd: sourceLocation.endOffset ?? null, heading: section, rawText, confidence })],
    metadata: { noteId, sourceSection: section, detectionRule, parserVersion: VERSION }
  });
  Object.assign(candidate, {
    candidateType: "diagnosis",
    diagnosisName: name,
    normalizedDiagnosis: normalizeClinicalComparisonText(name),
    code: code || null,
    system,
    status,
    isPrimary: false,
    parserVersion: VERSION,
    requiresReview: candidate.requiresReview,
    evidence: candidate.evidence
  });
  return candidate;
}

/** Parser nativo MIDC. Devuelve exclusivamente ClinicalCandidate de tipo diagnosis. */
export function parseDiagnosisCandidates({ text = "", section = "diagnosticos", documentId = "", noteId = "", sourceLocation = {}, explicit = false } = {}) {
  const rows = rowsFromBlock(isolateBlock(text));
  const candidates = [];
  const pendingNames = [];
  let discardedCount = 0;
  clinicalImportLogger.info("diagnosis:block", JSON.stringify({ documentId, noteId, section, rowCount: rows.length, explicit }));

  rows.forEach((row, rowIndex) => {
    const codes = splitDiagnosticCodes(row);
    const name = normalizeDiagnosis(row, codes);
    if (STATUS_ONLY.test(normalizeClinicalComparisonText(row))) {
      const previous = pendingNames.at(-1) || candidates.at(-1);
      if (previous) {
        previous.status = diagnosisStatus(row);
        previous.metadata.statusSource = row;
      } else discardedCount += 1;
      return;
    }
    if (!name && !codes.length) { discardedCount += 1; return; }
    if (/^(?:diagn[oó]sticos?|cie[- ]?10|cie[- ]?11|sistema)(?:\s*\|\s*(?:cie[- ]?10|cie[- ]?11))?$/i.test(name)) { discardedCount += 1; return; }
    if (codes.length > 1) {
      if (name.length >= 3) candidates.push(createDiagnosisCandidate({ name, rawText: row, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex }, status: diagnosisStatus(row), requiresReview: true, detectionRule: "multiple-unpaired-codes" }));
      else discardedCount += 1;
      return;
    }
    if (codes.length === 1 && name.length >= 3) {
      candidates.push(createDiagnosisCandidate({ name, code: codes[0], rawText: row, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex }, status: diagnosisStatus(row), detectionRule: "code-adjacent" }));
      return;
    }
    if (codes.length === 1 && !name) {
      const pending = pendingNames.shift();
      if (pending) candidates.push(createDiagnosisCandidate({ name: pending.name, code: codes[0], rawText: `${pending.rawText} | ${row}`, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, status: pending.status, detectionRule: "column-pair" }));
      else discardedCount += 1;
      return;
    }
    if (explicit && name.length >= 3) pendingNames.push({ name, rawText: row, rowIndex, status: diagnosisStatus(row) });
    else discardedCount += 1;
  });

  pendingNames.forEach((pending) => candidates.push(createDiagnosisCandidate({ name: pending.name, rawText: pending.rawText, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, status: pending.status, requiresReview: true, detectionRule: "name-without-code" })));
  candidates.forEach((candidate) => {
    const validation = validateDiagnosis(candidate);
    if (!validation.valid) candidate.requiresReview = true;
    clinicalImportLogger.info("diagnosis:entry", JSON.stringify({ documentId, noteId, candidateId: candidate.id, code: Boolean(candidate.code), confidence: candidate.confidence }));
  });
  clinicalImportLogger.info("diagnosis:finished", JSON.stringify({ documentId, noteId, detectedCount: candidates.length, pairedCount: candidates.filter((candidate) => candidate.code).length, discardedCount }));
  return candidates;
}

export function parseDiagnosisBlock({ text = "", section = "diagnosticos", documentId = "", noteId = "", sourceLocation = {}, explicit = false } = {}) {
  return parseDiagnosisCandidates({ text, section, documentId, noteId, sourceLocation, explicit });
}

export function detectDiagnosisCandidates({ sections = {}, fullText = "", sourceBlocks = [], documentId = "", noteId = "" } = {}) {
  const detected = [];
  const add = (items) => items.forEach((item) => {
    const key = `${item.code || ""}:${item.normalizedDiagnosis || ""}`;
    if (item.diagnosisName && !detected.some((existing) => `${existing.code || ""}:${existing.normalizedDiagnosis || ""}` === key)) detected.push(item);
  });
  sourceBlocks.filter((block) => block.type === "table").forEach((block) => {
    (block.rows || []).forEach((row, rowIndex) => {
      const rowText = row.join(" | ");
      if (splitDiagnosticCodes(rowText).length) add(parseDiagnosisCandidates({ text: rowText, section: "diagnosticos", documentId, noteId, sourceLocation: { tableIndex: block.source?.tableIndex, blockIndex: block.source?.blockIndex, rowIndex }, explicit: true }));
    });
  });
  const entries = Object.entries(sections).filter(([, value]) => String(value || "").trim()).map(([section, value]) => ({ section, text: value }));
  if (!entries.length && String(fullText || "").trim()) entries.push({ section: "texto_completo", text: fullText });
  entries.forEach(({ section, text }) => {
    add(parseDiagnosisCandidates({ text, section, documentId, noteId, explicit: section === "diagnosticos" }));
    if (section === "diagnosticos") return;
    String(text || "").split(/(?<=[.!?])\s+/).forEach((line, lineIndex) => {
      if (!/(?:diagn|diagnosticad|cuenta\s+con|antecedente\s+de|probable|a\s+descartar)/i.test(normalizeClinicalComparisonText(line))) return;
      add(parseDiagnosisCandidates({ text: line, section, documentId, noteId, sourceLocation: { lineIndex }, explicit: true }));
    });
  });
  return detected;
}
