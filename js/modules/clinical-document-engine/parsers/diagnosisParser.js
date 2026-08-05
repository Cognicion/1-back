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

export function splitDiagnosticCodes(text = "") {
  return [...String(text || "").matchAll(/[A-Z]\d{2}(?:\.\d{1,2})?/gi)].map((match) => normalizeDiagnosticCode(match[0])).filter(Boolean);
}

// Algunos DOCX conservan varias entradas dentro de una misma celda de tabla
// sin saltos de línea. Estos encabezados diagnósticos permiten recuperar los
// límites estructurales sin consultar texto de otras secciones.
const DIAGNOSIS_ENTRY_START = /(?:Trastorno\b|Episodio\b|Distimia|Soporte\s+familiar|C(?:o|ó|Ã³|�)nyuge\s+o\s+pareja|Obesidad\b|Tabaco\b|Alcohol\b)/gu;

function splitDiagnosisNameColumn(text = "", expectedCount = 0) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  DIAGNOSIS_ENTRY_START.lastIndex = 0;
  const starts = [...source.matchAll(DIAGNOSIS_ENTRY_START)].map((match) => match.index);
  if (expectedCount > 0 && starts.length === expectedCount) {
    return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length).trim()).filter(Boolean);
  }
  return [source];
}

function normalizeDiagnosis(value = "", codes = []) {
  let result = String(value || "");
  codes.forEach((code) => { result = result.replace(new RegExp(code.replace(".", "\\."), "ig"), " "); });
  result = result.replace(/\bdiagn(?:\u00f3|o)sticos?\b\s*(?:de\s+acuerdo\s+a\s+cie[- ]?10)?\s*[:|\-]?/gi, " ");
  return normalizeDiagnosisValue(result)
    .replace(/\b(?:niega\s+)?antecedente\s+de\b/gi, " ")
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
  const source = String(text || "");
  const bounded = extractBoundedSection({ text: source, startAliases: BOUNDARY_ALIASES.diagnosis, boundaryAliases: END_ALIASES });
  if (bounded.start && bounded.value.trim()) return bounded.value;
  const heading = /(?:^|\r?\n)\s*diagn[^\s:|]*sticos?(?:\s+de\s+acuerdo\s+a\s+cie[- ]?10)?\b[^\n:|]*/i.exec(source);
  if (!heading) return source.trim();
  const start = heading.index + heading[0].length;
  const content = source.slice(start).replace(/^\s*[:|\-]\s*/, "");
  const end = /\b(?:plan\s+terap\w*|tratamiento\s+farmacol\w*|medicamentos|comentario\s+y\/o\s+an\w*|an\w*lisis|pron\w*stico|destino|nota\s+de\s+(?:evoluci\w*n|ingreso|egreso))\b/i.exec(content);
  return (end ? content.slice(0, end.index) : content).trim();
}

const STATUS_TOKEN = /\b(?:SE\s+AGREGA|SE\s+DESCARTA|A\s+DESCARTAR|PROBABLE|ANTECEDENTE|EN\s+REMISI[ÓO]N|REMISI[ÓO]N|CONFIRMADO)\b/gi;
const EXCLUDED_DIAGNOSIS_TEXT = /^(?:riesgo\s+suicida|riesgo\s+de\s+ca[ií]da|conducta\s+autolesiva|vigilancia|dieta|alergias?|medicamentos?|signos\s+vitales?|resultados?\s+de\s+estudios?|comentario(?:\s+cl[ií]nico)?|an[aá]lisis|pron[oó]stico|destino)$/i;

function tokenizeDiagnosisBlock(text = "") {
  const source = isolateBlock(text);
  const matches = [
    ...[...source.matchAll(STATUS_TOKEN)].map((match) => ({ type: "STATUS", value: match[0], index: match.index, end: match.index + match[0].length })),
    ...[...source.matchAll(/[A-Z]\s*\d{2}(?:\.\d{1,2})?/gi)].map((match) => ({ type: "CODE", value: match[0], index: match.index, end: match.index + match[0].length }))
  ].sort((a, b) => a.index - b.index || a.end - b.end);
  const tokens = [];
  let cursor = 0;
  matches.forEach((match) => {
    if (match.index > cursor) tokens.push({ type: "DIAGNOSIS_TEXT", value: source.slice(cursor, match.index) });
    tokens.push({ type: match.type, value: match.value });
    cursor = match.end;
  });
  if (cursor < source.length) tokens.push({ type: "DIAGNOSIS_TEXT", value: source.slice(cursor) });
  const normalized = tokens.filter((token) => token.type !== "DIAGNOSIS_TEXT" || token.value.trim());
  clinicalImportLogger.info("diagnosisParser:tokenized", JSON.stringify({ tokenCount: normalized.length, statusCount: normalized.filter((token) => token.type === "STATUS").length, codeCount: normalized.filter((token) => token.type === "CODE").length }));
  return normalized;
}

function structuralDiagnosisRows(text = "") {
  const source = isolateBlock(text);
  const rows = [];
  source.split(/\r?\n|;|\||(?<=[.!?])\s+/).forEach((rawRow) => {
    let cursor = 0;
    let match;
    STATUS_TOKEN.lastIndex = 0;
    while ((match = STATUS_TOKEN.exec(rawRow))) {
      const before = rawRow.slice(cursor, match.index).trim();
      const afterStatus = rawRow.slice(match.index + match[0].length).trim();
      if (/^antecedente$/i.test(match[0].trim()) && /^de\b/i.test(afterStatus)) {
        rows.push({ text: rawRow.trim(), statusAfter: "" });
        cursor = rawRow.length;
        break;
      }
      if (!before && afterStatus) {
        rows.push({ text: rawRow.trim(), statusAfter: "" });
        cursor = rawRow.length;
        break;
      }
      if (before) rows.push({ text: before, statusAfter: match[0] });
      else rows.push({ text: "", statusOnly: match[0] });
      cursor = match.index + match[0].length;
    }
    const after = rawRow.slice(cursor).trim();
    if (after) rows.push({ text: after, statusAfter: "" });
  });
  return rows;
}

function statusValue(text = "") {
  const value = normalizeClinicalComparisonText(text);
  if (/^se agrega$/.test(value)) return "Se agrega";
  if (/^se descarta$/.test(value)) return "Descartado";
  if (/^a descartar$/.test(value)) return "A descartar";
  if (/^probable$/.test(value)) return "Probable";
  if (/^(?:antecedente)$/.test(value)) return "Antecedente";
  if (/^(?:en remision|remision)$/.test(value)) return "Remisión";
  if (/^confirmado$/.test(value)) return "Confirmado";
  return "";
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
function parseDiagnosisCandidatesLegacy({ text = "", section = "diagnosticos", documentId = "", noteId = "", sourceLocation = {}, explicit = false } = {}) {
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

/** Parser estructural MIDC: tokeniza el bloque y construye una entidad por entrada. */
export function parseDiagnosisCandidates({ text = "", section = "diagnosticos", documentId = "", noteId = "", sourceLocation = {}, explicit = false } = {}) {
  const tokens = tokenizeDiagnosisBlock(text);
  const rows = structuralDiagnosisRows(text);
  const candidates = [];
  const pendingNames = [];
  let state = "WAITING_DIAGNOSIS";
  let discardedCount = 0;
  const isDiagnosticContext = (row) => /(?:diagn[oó]stic|cie[- ]?(?:10|11)|impresi[oó]n|antecedente|probable|a\s+descartar|se\s+(?:agrega|descarta))/i.test(row);
  const finish = (candidate) => {
    if (!candidate) return;
    const validation = validateDiagnosis(candidate);
    if (!validation.valid) candidate.requiresReview = true;
    candidates.push(candidate);
    clinicalImportLogger.info("diagnosisParser:newEntity", JSON.stringify({ documentId, noteId, candidateId: candidate.id }));
  };

  rows.forEach((row, rowIndex) => {
    const rowText = row.text.trim();
    const rowStatus = statusValue(row.statusAfter);
    if (row.statusOnly) {
      const previous = pendingNames.at(-1);
      if (previous) previous.status = statusValue(row.statusOnly) || previous.status;
      else if (candidates.at(-1)) candidates.at(-1).status = statusValue(row.statusOnly) || candidates.at(-1).status;
      else discardedCount += 1;
      clinicalImportLogger.info("diagnosisParser:status", JSON.stringify({ documentId, noteId, rowIndex, status: statusValue(row.statusOnly) }));
      state = "READING_STATUS";
      return;
    }
    if (!rowText) return;
    const codes = splitDiagnosticCodes(rowText);
    const codeOnly = codes.length === 1 && /^[A-Z]\d{2}(?:\.\d{1,2})?$/i.test(rowText.trim());
    const name = codeOnly ? "" : normalizeDiagnosis(rowText, codes);
    if (!name && !codes.length) { discardedCount += 1; return; }
    if (EXCLUDED_DIAGNOSIS_TEXT.test(name) || /^plan\s+terap/i.test(name) || /^(?:diagn[oó]sticos?|cie[- ]?10|cie[- ]?11|sistema)$/i.test(name)) {
      discardedCount += 1;
      state = "WAITING_DIAGNOSIS";
      return;
    }
    if (!explicit && section !== "diagnosticos" && !codes.length && !isDiagnosticContext(rowText)) {
      discardedCount += 1;
      return;
    }
    const location = { ...sourceLocation, rowIndex };
    if (codes.length === 1 && name.length >= 3) {
      const status = rowStatus || diagnosisStatus(rowText);
      const candidate = createDiagnosisCandidate({ name, code: codes[0], rawText: rowText, section, documentId, noteId, sourceLocation: location, status, detectionRule: "state-machine-code-adjacent" });
      finish(candidate);
      clinicalImportLogger.info("diagnosisParser:code", JSON.stringify({ documentId, noteId, rowIndex, assigned: true }));
      state = "READING_CODES";
      return;
    }
    if (codes.length === 1 && !name) {
      const nextRow = rows[rowIndex + 1]?.text || "";
      const nextCodes = splitDiagnosticCodes(nextRow);
      const nextIsCodeOnly = nextCodes.length === 1 && /^[A-Z]\d{2}(?:\.\d{1,2})?$/i.test(nextRow.trim());
      const codeCountInBlock = splitDiagnosticCodes(text).length;
      clinicalImportLogger.info("diagnosisParser:code-context", JSON.stringify({ documentId, noteId, rowIndex, pendingNames: pendingNames.length, nextIsCodeOnly, codeCountInBlock }));
      if (pendingNames.length === 1 && nextIsCodeOnly && codeCountInBlock > pendingNames.length) {
        const pending = pendingNames.shift();
        finish(createDiagnosisCandidate({ name: pending.name, rawText: pending.rawText, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, status: pending.status, requiresReview: true, detectionRule: "state-machine-ambiguous-code-pair" }));
        discardedCount += 1;
        state = "READING_CODES";
        return;
      }
      const pending = pendingNames.shift();
      if (pending) {
        const candidate = createDiagnosisCandidate({ name: pending.name, code: codes[0], rawText: `${pending.rawText} | ${rowText}`, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, status: pending.status, detectionRule: "state-machine-column-pair" });
        finish(candidate);
        clinicalImportLogger.info("diagnosisParser:code", JSON.stringify({ documentId, noteId, rowIndex, assigned: true }));
      } else discardedCount += 1;
      state = "READING_CODES";
      return;
    }
    if (codes.length > 1) {
      if (name.length >= 3) finish(createDiagnosisCandidate({ name, rawText: rowText, section, documentId, noteId, sourceLocation: location, status: rowStatus || diagnosisStatus(rowText), requiresReview: true, detectionRule: "state-machine-unpaired-codes" }));
      else discardedCount += 1;
      state = "READING_CODES";
      return;
    }
    if ((explicit || section === "diagnosticos") && name.length >= 3) {
      pendingNames.push({ name, rawText: rowText, rowIndex, status: rowStatus || diagnosisStatus(rowText) });
      clinicalImportLogger.info("diagnosisParser:status", JSON.stringify({ documentId, noteId, rowIndex, status: rowStatus || "pending" }));
      state = rowStatus ? "READING_STATUS" : "READING_DIAGNOSIS";
    } else discardedCount += 1;
  });

  pendingNames.forEach((pending) => finish(createDiagnosisCandidate({ name: pending.name, rawText: pending.rawText, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, status: pending.status, requiresReview: true, detectionRule: "state-machine-name-without-code" })));
  clinicalImportLogger.info("diagnosisParser:finished", JSON.stringify({ documentId, noteId, tokenCount: tokens.length, detectedCount: candidates.length, pairedCount: candidates.filter((candidate) => candidate.code).length, discardedCount, state: candidates.length ? "FINALIZE_DIAGNOSIS" : "WAITING_DIAGNOSIS" }));
  return candidates;
}

export function parseDiagnosisBlock({ text = "", section = "diagnosticos", documentId = "", noteId = "", sourceLocation = {}, explicit = false } = {}) {
  return parseDiagnosisCandidates({ text, section, documentId, noteId, sourceLocation, explicit });
}

export function detectDiagnosisCandidates({ sections = {}, fullText = "", sourceBlocks = [], documentId = "", noteId = "" } = {}) {
  const detected = [];
  let hasStructuredDiagnosisTable = false;
  const add = (items) => items.forEach((item) => {
    const key = `${item.code || ""}:${item.normalizedDiagnosis || ""}`;
    if (item.diagnosisName && !detected.some((existing) => `${existing.code || ""}:${existing.normalizedDiagnosis || ""}` === key)) detected.push(item);
  });
  sourceBlocks.filter((block) => block.type === "table").forEach((block) => {
    (block.rows || []).forEach((row, rowIndex) => {
      const rowText = row.join(" | ");
      const codeColumn = row.length > 1 ? String(row[1] || "") : "";
      const codes = splitDiagnosticCodes(codeColumn || rowText);
      const names = splitDiagnosisNameColumn(row[0] || "", codes.length);
      const location = { tableIndex: block.source?.tableIndex, blockIndex: block.source?.blockIndex, rowIndex };
      if (codes.length && names.length === codes.length) {
        hasStructuredDiagnosisTable = true;
        names.forEach((name, index) => {
          add(parseDiagnosisCandidates({
            text: `${name} | ${codes[index]}`,
            section: "diagnosticos",
            documentId,
            noteId,
            sourceLocation: { ...location, rowIndex: index },
            explicit: true
          }));
        });
        return;
      }
      if (splitDiagnosticCodes(rowText).length) add(parseDiagnosisCandidates({ text: rowText, section: "diagnosticos", documentId, noteId, sourceLocation: location, explicit: true }));
    });
  });
  const entries = Object.entries(sections).filter(([, value]) => String(value || "").trim()).map(([section, value]) => ({ section, text: value }));
  if (!entries.length && String(fullText || "").trim()) entries.push({ section: "texto_completo", text: fullText });
  entries.forEach(({ section, text }) => {
    if (section === "diagnosticos" && hasStructuredDiagnosisTable) return;
    add(parseDiagnosisCandidates({ text, section, documentId, noteId, explicit: section === "diagnosticos" }));
    if (["diagnosticos", "analisis", "plan", "tratamiento", "medicamentos", "pronostico", "destino", "resultados", "estudios"].includes(section)) return;
    String(text || "").split(/(?<=[.!?])\s+/).forEach((line, lineIndex) => {
      if (!/(?:diagn|diagnosticad|cuenta\s+con|antecedente\s+de|probable|a\s+descartar)/i.test(normalizeClinicalComparisonText(line))) return;
      add(parseDiagnosisCandidates({ text: line, section, documentId, noteId, sourceLocation: { lineIndex }, explicit: true }));
    });
  });
  return detected;
}
