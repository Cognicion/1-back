import { BOUNDARY_ALIASES } from "../boundaries/boundaryAliases.js";
import { extractBoundedSection } from "../boundaries/boundaryEngine.js";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";
import { ClinicalEvidence } from "../core/ClinicalEvidence.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { normalizeDiagnosticCode, normalizeDiagnosis as normalizeDiagnosisValue } from "../normalizers/diagnosisNormalizer.js";
import { validateDiagnosis } from "../validators/diagnosisValidator.js";
import { clinicalImportLogger } from "../utils/logger.js";
import { CATALOGO_DIAGNOSTICOS as DIAGNOSTICOS_BIBLIOTECA } from "../../../data/catalogoDiagnosticos.js?v=20260818-clinical-extraction-v1";

const PARSER = "midc.diagnosisParser";
const VERSION = "1.0";
const STATUS_ONLY = /^(?:se agrega|se descarta|antecedente|remision|en remision|probable|a descartar|confirmado)$/i;
const END_ALIASES = [...BOUNDARY_ALIASES.plan, ...BOUNDARY_ALIASES.medication, ...BOUNDARY_ALIASES.analysis, ...BOUNDARY_ALIASES.prognosis, ...BOUNDARY_ALIASES.destination, ...BOUNDARY_ALIASES.note];
const NARRATIVE_DIAGNOSIS_START = /(?:cuenta\s+con\s+diagn[oó]stico\s+de|antecedente\s+de|con\s+diagn[oó]stico\s+previo\s+de|diagn[oó]stico\s+previo\s+de|diagnosticad[oa]\s+con|se\s+diagnostic[oó]|diagn[oó]stico\s+de|probable|a\s+descartar)\s+/i;
const NARRATIVE_DIAGNOSIS_END = /\s+(?:otorgado\s+en|diagnosticad[oa]\s+en|desde|en\s+seguimiento|tratad[oa]\s+con|con\s+tratamiento|con\s+esquema|[úu]ltimo\s+esquema|actualmente\s+recibe|manejad[oa]\s+con|hospitalizad[oa]\s+en|por\s+parte\s+de|bajo\s+tratamiento|egres(?:o|ada|ado)|posteriormente|remitid[oa]|referid[oa]|evolucion[oó]|present[oó]\s+mejor[ií]a|en\s+\d{4})\b/i;

const normalizeCatalogName = (value = "") => normalizeClinicalComparisonText(value).replace(/\s+/g, " ").trim();
const DIAGNOSIS_CATALOG_INDEX = new Map();
DIAGNOSTICOS_BIBLIOTECA.filter((entry) => entry?.nombre).forEach((entry) => {
  const terms = [entry.nombre, ...(Array.isArray(entry.aliases) ? entry.aliases : [])];
  terms.filter(Boolean).forEach((term) => {
    const normalized = normalizeCatalogName(term);
    if (normalized.length >= 2 && !DIAGNOSIS_CATALOG_INDEX.has(normalized)) DIAGNOSIS_CATALOG_INDEX.set(normalized, String(term).trim());
  });
});
const DIAGNOSIS_CATALOG_TERMS = [...DIAGNOSIS_CATALOG_INDEX.keys()].sort((a, b) => b.length - a.length);

function resolveCatalogDiagnosisName(value = "") {
  return DIAGNOSIS_CATALOG_INDEX.get(normalizeCatalogName(value)) || String(value || "").trim();
}

// Resuelve primero la entidad, no el resto de la oración. Solo acepta un
// término del catálogo al inicio del candidato y conserva el match más largo.
function resolveCatalogPrefix(value = "") {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  const normalized = normalizeCatalogName(source);
  const match = DIAGNOSIS_CATALOG_TERMS.find((term) => {
    if (!normalized.startsWith(term)) return false;
    const next = normalized[term.length] || "";
    return !next || /[\s,;:.()[\]-]/.test(next);
  });
  if (!match) return "";
  const raw = source.slice(0, match.length).trim().replace(/[,:;.!?]+\s*$/, "").trim();
  return DIAGNOSIS_CATALOG_INDEX.get(match) || raw;
}

function normalizeNarrativeDiagnosisName(value = "") {
  const text = resolveCatalogDiagnosisName(value);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function extractNarrativeDiagnosisEntity(text = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const start = source.match(NARRATIVE_DIAGNOSIS_START);
  if (!start) return "";
  const tail = source.slice(start.index + start[0].length);
  const catalogEntity = resolveCatalogPrefix(tail);
  const end = tail.search(NARRATIVE_DIAGNOSIS_END);
  const entity = (catalogEntity || (end >= 0 ? tail.slice(0, end) : tail)).replace(/[,:;.!?]+\s*$/, "").trim();
  return entity.length >= 2 && entity.length <= 120 ? entity : "";
}

function diagnosisStatus(text = "") {
  const value = normalizeClinicalComparisonText(text);
  if (/\bse agrega\b/.test(value)) return "Se agrega";
  if (/\b(?:se descarta|se descarto|niega antecedente)\b/.test(value)) return "Descartado";
  if (/\ba descartar\b/.test(value)) return "A descartar";
  if (/\bprobable\b/.test(value)) return "Probable";
  if (/\b(?:en remision|remision)\b/.test(value)) return "Remisión";
  if (/\bantecedente\b|\bdiagn[oó]stico\s+previo\b|\bdiagnosticad[oa].*\ben\s+\d{4}\b|\botorgado\s+en\b.*\b\d{4}\b/.test(value)) return "Antecedente";
  return "Confirmado";
}

export function splitDiagnosticCodes(text = "") {
  return [...String(text || "").matchAll(/[A-Z]\d{2,3}(?:\.\d{1,2})?/gi)].map((match) => normalizeDiagnosticCode(match[0])).filter(Boolean);
}

// Algunos DOCX conservan varias entradas dentro de una misma celda de tabla.
// Primero se respetan sus párrafos/saltos reales y solo después se usa una
// recuperación estructural conservadora para celdas que Word entregó planas.
const DIAGNOSIS_ENTRY_START = /(?:(?:[Pp][Rr][Oo][Bb][Aa][Bb][Ll][Ee]|[Aa]\s+[Dd][Ee][Ss][Cc][Aa][Rr][Tt][Aa][Rr]|[Aa][Nn][Tt][Ee][Cc][Ee][Dd][Ee][Nn][Tt][Ee]|[Cc][Oo][Nn][Ff][Ii][Rr][Mm][Aa][Dd][Oo]|[Ss][Ee]\s+[Aa][Gg][Rr][Ee][Gg][Aa]|[Ss][Ee]\s+[Dd][Ee][Ss][Cc][Aa][Rr][Tt][Aa])\s+)?(?:Trast(?:orn|om)o\b|Episodio\b|Distimia|Esquizofrenia\b|Lesi[oó]n\b|Historia\s+personal\b|Soporte\s+familiar\b|C[oó]nyuge\s+o\s+pareja\b|Obesidad\b|Tabaco\b|Alcohol\b|Intoxicaci[oó]n\b|Discapacidad\b|Retraso\b|S[ií]ndrome\b|Problemas?\s+relacionad[oa]s?\b|Dependencia\b|Abuso\b|Consumo\b|Ideaci[oó]n\b|Intento\b|Reacci[oó]n\b)/gu;
const TRAILING_DIFFERENTIAL_SEPARATOR = /\s+(?:vs\.?|versus)\s*$/i;

function cleanDiagnosisTableLine(value = "") {
  return String(value || "")
    .replace(/^\s*(?:(?:\d+|[a-z])[.)-]|[-•▪◦])\s*/i, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function mergeDiagnosisStatusLines(lines = []) {
  return lines.reduce((entries, line) => {
    if (STATUS_ONLY.test(line) && entries.length) {
      entries[entries.length - 1] = `${entries.at(-1)} ${line}`.trim();
    } else if (line) {
      entries.push(line);
    }
    return entries;
  }, []);
}

function splitDiagnosisNameColumn(text = "", codesOrCount = 0) {
  const expectedCount = Array.isArray(codesOrCount) ? codesOrCount.length : Number(codesOrCount) || 0;
  const raw = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u000b\u2028\u2029]/g, "\n")
    .trim();
  if (!raw) return [];

  const explicitLines = mergeDiagnosisStatusLines(raw
    .split(/\n+/)
    .map(cleanDiagnosisTableLine)
    .filter(Boolean));
  if (expectedCount > 0 && explicitLines.length === expectedCount) return explicitLines;

  const source = explicitLines.join(" ").replace(/\s+/g, " ").trim();
  DIAGNOSIS_ENTRY_START.lastIndex = 0;
  const matchedStarts = [...source.matchAll(DIAGNOSIS_ENTRY_START)].map((match) => match.index);
  const starts = [...new Set([
    ...(matchedStarts[0] === 0 ? [] : [0]),
    ...matchedStarts
  ])].sort((a, b) => a - b);
  DIAGNOSIS_ENTRY_START.lastIndex = 0;
  if (starts.length > 1) {
    const entries = starts
      .map((start, index) => source.slice(start, starts[index + 1] ?? source.length).trim())
      .filter(Boolean);
    const mergedDifferentials = [];
    entries.forEach((entry) => {
      if (TRAILING_DIFFERENTIAL_SEPARATOR.test(mergedDifferentials.at(-1) || "")) {
        mergedDifferentials[mergedDifferentials.length - 1] = `${mergedDifferentials.at(-1)} ${entry}`.trim();
      } else {
        mergedDifferentials.push(entry);
      }
    });
    return mergedDifferentials;
  }
  return [source];
}

function normalizeDiagnosis(value = "", codes = []) {
  let result = String(value || "");
  codes.forEach((code) => { result = result.replace(new RegExp(code.replace(".", "\\."), "ig"), " "); });
  result = result.replace(/\bdiagn(?:\u00f3|o)sticos?\b\s*(?:de\s+acuerdo\s+a\s+cie[- ]?10)?\s*[:|\-]?/gi, " ");
  return normalizeDiagnosisValue(result)
    .replace(/\btrastomo\b/gi, "Trastorno")
    .replace(/\bautointligid([ao])\b/gi, "autoinfligid$1")
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
  if (/\b(?:cie[- ]?10|icd[- ]?10)\b/i.test(context) || /^[A-Z]\d{2,3}(?:\.\d{1,2})?$/.test(code)) return "CIE-10";
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

function isNarrativeClinicalText(text = "") {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (/^(?:se trata de|paciente\b|hombre\b|mujer\b|masculino\b|femenin[ao]\b|cuenta con\b)/i.test(value)) return true;
  if (/^[A-ZÁÉÍÓÚÑ][^.!?]{0,80},\s/.test(value)) return true;
  return value.length >= 80 && /\b(?:refiere|cuenta con|inici[oó]|presenta|acude|comenta|menciona)\b/i.test(value);
}

function startsWithDiagnosticName(text = "") {
  return /^(?:trastorno\b|episodio\b|distimia\b|soporte\s+familiar\b|c(?:o|ó|Ã³|�)nyuge\s+o\s+pareja\b|obesidad\b|tabaco\b|alcohol\b)/i.test(String(text || "").trim());
}

function isNarrativeIdentityOpening(text = "") {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (/\b(?:diagnostico|antecedente|diagnosticad[oa])\b/i.test(normalizeClinicalComparisonText(value))) return false;
  return /^(?:se trata de|paciente\b|hombre\b|mujer\b|masculino\b|femenin[ao]\b)/i.test(value)
    || /^[A-ZÁÉÍÓÚÑ][^.!?]{0,80},\s/.test(value);
}

function isExplicitNarrativeDiagnosis(text = "") {
  const value = normalizeClinicalComparisonText(text);
  return /\b(?:diagnostico|antecedente\s+de|diagnosticad[oa]\s+en|diagnosticad[oa]\s+con)\b/i.test(value) && !isNarrativeIdentityOpening(text);
}

const TREATMENT_ONLY_START = /^(?:(?:actualmente\s+)?(?:bajo|en)\s+tratamiento\b|medicaci[oó]n\b|medicamentos?\b|farmacoterapia\b|(?:esquema|tratamiento)\s+(?:farmacol[oó]gico|psiqui[aá]trico)\b|(?:[uú]ltimo|actual|previo)\s+esquema\s+farmacol[oó]gico\b)/i;
const TREATMENT_CONTEXT = /\b(?:tratamiento|medicaci[oó]n|medicamentos?|farmacoterapia|esquema\s+farmacol[oó]gico|recibe|toma|administrar|dosis)\b/i;
const MEDICATION_DOSE = /\b\d+(?:[.,]\d+)?\s*(?:mcg|ug|mg|g|ml|ui)(?:\s*\/\s*(?:d[ií]a|h|hora|ml|\d+(?:[.,]\d+)?\s*ml))?\b/i;
const STRUCTURAL_ROW_PREFIX = /^\s*(?:(?:[\-\u2013\u2014\u2022\u00b7\u25aa\u25e6\uf0b7*]+|\(?\d{1,3}\)?[.)-]+|[a-z][.)-]+|[ivxlcdm]+[.)-]+)\s*)+/i;
const NON_DIAGNOSIS_ENTITY_START = /^(?:actualmente|bajo\s+tratamiento|en\s+tratamiento|tratamiento|medicaci[oó]n|medicamentos?|farmacoterapia|esquema|seguimiento|control|manejo|consulta|hospitalizaci[oó]n|internamiento|ingreso|egreso|cirug[ií]a|valoraci[oó]n|atenci[oó]n|mejor[ií]a|estabilidad|evoluci[oó]n|respuesta|adherencia|riesgo|sintomatolog[ií]a|cuadro|condici[oó]n|consumo|uso)\b/i;
const DIAGNOSTIC_ENTITY_START = /^(?:trastorno|episodio|s[ií]ndrome|enfermedad|esquizofrenia|psicosis|depresi[oó]n|ansiedad|distimia|discapacidad|dependencia|intoxicaci[oó]n|lesi[oó]n|obesidad|diabetes|hipertensi[oó]n|soporte\s+familiar|c[oó]nyuge|historia\s+personal)\b/i;

const DIFFERENTIAL_DIAGNOSIS_SEPARATOR = /\s+(?:vs\.?|versus)\s+/gi;

function diagnosisRowForClassification(text = "") {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(STRUCTURAL_ROW_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleNarrativeDiagnosisEntity(value = "", context = "") {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  const normalized = normalizeClinicalComparisonText(source);
  const normalizedContext = normalizeClinicalComparisonText(context);
  const strongDiagnosticCue = /\b(?:cuenta\s+con\s+diagnostico\s+de|con\s+diagnostico\s+previo\s+de|diagnostico\s+previo\s+de|diagnostico\s+de|diagnosticad[oa]\s+con|se\s+diagnostico|probable|a\s+descartar)\b/i.test(normalizedContext);
  if (!source || source.length > 120 || NON_DIAGNOSIS_ENTITY_START.test(normalized)) return false;
  if (/^(?:mujer|hombre|paciente|masculino|femenino)\b/i.test(normalized)) return false;
  if (TREATMENT_CONTEXT.test(normalized) && MEDICATION_DOSE.test(normalized)) return false;
  if (DIAGNOSTIC_ENTITY_START.test(normalized)) return true;
  if (/^[A-ZÁÉÍÓÚÑ]{2,12}(?:\s+[\p{L}-]+){0,3}$/u.test(source)) return true;
  if (!strongDiagnosticCue) return false;
  if (resolveCatalogPrefix(source)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length <= 8
    && !/\b(?:refiere|presenta|acude|comenta|menciona|recibe|tratad[oa]|diagnosticad[oa]|otorgad[oa]|seguimiento|evoluci[oó]n)\b/i.test(normalized)
    && !/[.;:]\s+\S/.test(source);
}

function isTreatmentOnlyClinicalText(text = "") {
  const source = normalizeClinicalComparisonText(text).replace(/\s+/g, " ").trim();
  if (!source) return false;
  if (TREATMENT_ONLY_START.test(source)) return true;
  if (!TREATMENT_CONTEXT.test(source) || !MEDICATION_DOSE.test(source)) return false;
  const narrativeEntity = extractNarrativeDiagnosisEntity(source);
  return !((narrativeEntity && isPlausibleNarrativeDiagnosisEntity(narrativeEntity, source)) || resolveCatalogPrefix(source) || startsWithDiagnosticName(source));
}

function isPlausibleDifferentialBranch(value = "") {
  const codes = splitDiagnosticCodes(value);
  const name = normalizeDiagnosis(value, codes);
  if (name.length < 3) return false;
  if (codes.length || resolveCatalogPrefix(name)) return true;
  const normalized = normalizeClinicalComparisonText(name);
  if (DIAGNOSTIC_ENTITY_START.test(normalized)) return true;
  return /^[A-ZÁÉÍÓÚÑ]{2,12}(?:\s+[\p{L}-]+){0,3}$/u.test(name);
}

function splitDifferentialDiagnosisRow(row = {}) {
  const source = String(row.text || "").replace(/\s+/g, " ").trim();
  DIFFERENTIAL_DIAGNOSIS_SEPARATOR.lastIndex = 0;
  if (!DIFFERENTIAL_DIAGNOSIS_SEPARATOR.test(source)) return [row];
  DIFFERENTIAL_DIAGNOSIS_SEPARATOR.lastIndex = 0;
  const alternatives = source.split(DIFFERENTIAL_DIAGNOSIS_SEPARATOR).map((value) => value.trim()).filter(Boolean);
  DIFFERENTIAL_DIAGNOSIS_SEPARATOR.lastIndex = 0;
  if (alternatives.length < 2 || !alternatives.every(isPlausibleDifferentialBranch)) return [row];
  return alternatives.map((text, differentialIndex) => ({
    ...row,
    text,
    rawText: row.rawText || source,
    forcedStatus: "Probable",
    differentialIndex
  }));
}

function logNarrativeBoundary({ documentId, noteId, text, reason }) {
  const normalized = diagnosisRowForClassification(text);
  clinicalImportLogger.info("diagnosisParser:narrativeBoundary", JSON.stringify({
    documentId,
    noteId,
    textLength: normalized.length,
    startsWithDemographicNarrative: /^(?:mujer|hombre|paciente|masculino|femenino)\b/i.test(normalized),
    hasDiagnosticCue: /\b(?:diagn[oó]stico|antecedente\s+de|diagnosticad[oa]|probable|a\s+descartar)\b/i.test(normalized),
    reason
  }));
}

function tokenizeDiagnosisBlock(text = "") {
  const source = isolateBlock(text);
  const matches = [
    ...[...source.matchAll(STATUS_TOKEN)].map((match) => ({ type: "STATUS", value: match[0], index: match.index, end: match.index + match[0].length })),
    ...[...source.matchAll(/[A-Z]\s*\d{2,3}(?:\.\d{1,2})?/gi)].map((match) => ({ type: "CODE", value: match[0], index: match.index, end: match.index + match[0].length }))
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
  source.split(/\r?\n|;|\||(?<!vs\.)(?<=[.!?])\s+/i).forEach((rawRow) => {
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
  return rows.flatMap(splitDifferentialDiagnosisRow);
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

function createDiagnosisCandidate({ name, code = "", codes = [], status, rawText, section, documentId, noteId, sourceLocation = {}, requiresReview = false, detectionRule }) {
  const canonicalName = name;
  const normalizedCodes = [...new Set([code, ...codes].map((value) => normalizeDiagnosticCode(value)).filter(Boolean))];
  const primaryCode = normalizedCodes[0] || "";
  const system = detectSystem(primaryCode, rawText);
  const confidence = evaluateConfidence({ table: sourceLocation.tableIndex != null, explicitHeading: section === "diagnosticos" && Boolean(primaryCode), freeText: !primaryCode });
  const candidate = new ClinicalCandidate({
    id: `${documentId || "doc"}-dx-${noteId || "note"}-${sourceLocation.rowIndex ?? sourceLocation.lineIndex ?? 0}-${primaryCode || normalizeClinicalComparisonText(canonicalName).slice(0, 24)}`,
    type: "diagnosis",
    value: null,
    confidence,
    requiresReview: Boolean(requiresReview || requiresReviewForConfidence(confidence)),
    warnings: primaryCode ? [] : ["missing-code"],
    evidence: [new ClinicalEvidence({ documentId, block: sourceLocation.blockIndex ?? null, offsetStart: sourceLocation.startOffset ?? null, offsetEnd: sourceLocation.endOffset ?? null, heading: section, rawText, confidence })],
    metadata: {
      noteId,
      sourceSection: section,
      sourceType: section === "diagnosticos" ? "structured_diagnosis" : (detectionRule?.includes("narrative") ? "narrative_history" : "clinical_text"),
      detectionRule,
      parserVersion: VERSION,
      codeEvidence: normalizedCodes.map((value) => ({
        code: value,
        blockIndex: sourceLocation.blockIndex ?? null,
        paragraphIndex: sourceLocation.rowIndex ?? sourceLocation.lineIndex ?? null,
        rawText: rawText || "",
        sourceType: section === "diagnosticos" ? "structured_diagnosis" : (detectionRule?.includes("narrative") ? "narrative_history" : "clinical_text")
      }))
    }
  });
  Object.assign(candidate, {
    candidateType: "diagnosis",
    diagnosisName: canonicalName,
    normalizedDiagnosis: normalizeClinicalComparisonText(canonicalName),
    code: primaryCode || null,
    codes: normalizedCodes,
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
    const evidenceText = row.rawText || rowText;
    const classificationText = diagnosisRowForClassification(rowText);
    const rowStatus = row.forcedStatus || statusValue(row.statusAfter);
    if (row.statusOnly) {
      const previous = pendingNames.at(-1);
      if (previous) previous.status = statusValue(row.statusOnly) || previous.status;
      else if (candidates.at(-1)) candidates.at(-1).status = statusValue(row.statusOnly) || candidates.at(-1).status;
      else discardedCount += 1;
      clinicalImportLogger.info("diagnosisParser:status", JSON.stringify({ documentId, noteId, rowIndex, status: statusValue(row.statusOnly) }));
      state = "READING_STATUS";
      return;
    }
    if (!classificationText) return;
    const codes = splitDiagnosticCodes(classificationText);
    if (!codes.length && isTreatmentOnlyClinicalText(classificationText)) {
      discardedCount += 1;
      state = candidates.length ? "FINALIZE_DIAGNOSIS" : "WAITING_DIAGNOSIS";
      return;
    }
    if (!codes.length && isNarrativeClinicalText(classificationText) && !startsWithDiagnosticName(classificationText) && !isExplicitNarrativeDiagnosis(classificationText)) {
      logNarrativeBoundary({
        documentId,
        noteId,
        text: classificationText,
        reason: candidates.length ? "narrative-after-diagnosis" : "narrative-without-diagnostic-structure"
      });
      discardedCount += 1;
      state = candidates.length ? "FINALIZE_DIAGNOSIS" : "WAITING_DIAGNOSIS";
      return;
    }
    const codeOnly = codes.length === 1 && /^[A-Z]\d{2,3}(?:\.\d{1,2})?$/i.test(classificationText);
    const extractedNarrativeEntity = codeOnly ? "" : extractNarrativeDiagnosisEntity(classificationText);
    const narrativeEntity = isPlausibleNarrativeDiagnosisEntity(extractedNarrativeEntity, classificationText)
      ? extractedNarrativeEntity
      : "";
    const name = codeOnly ? "" : (narrativeEntity
      ? normalizeNarrativeDiagnosisName(normalizeDiagnosis(narrativeEntity, codes))
      : normalizeDiagnosis(classificationText, codes));
    if (!name && !codes.length) { discardedCount += 1; return; }
    if (EXCLUDED_DIAGNOSIS_TEXT.test(name) || /^plan\s+terap/i.test(name) || /^(?:diagn[oó]sticos?|cie[- ]?10|cie[- ]?11|sistema)$/i.test(name)) {
      discardedCount += 1;
      state = "WAITING_DIAGNOSIS";
      return;
    }
    if (section !== "diagnosticos" && codes.length && !narrativeEntity && !isDiagnosticContext(classificationText.replace(/\bantecedente\b/gi, ""))) {
      discardedCount += 1;
      return;
    }
    if (section !== "diagnosticos" && !codes.length && !narrativeEntity) {
      discardedCount += 1;
      return;
    }
    const location = { ...sourceLocation, rowIndex };
    if (codes.length === 1 && name.length >= 3) {
      const status = rowStatus || diagnosisStatus(evidenceText);
      const candidate = createDiagnosisCandidate({ name, code: codes[0], rawText: evidenceText, section, documentId, noteId, sourceLocation: location, status, detectionRule: row.forcedStatus ? "state-machine-differential-code-adjacent" : "state-machine-code-adjacent" });
      finish(candidate);
      clinicalImportLogger.info("diagnosisParser:code", JSON.stringify({ documentId, noteId, rowIndex, assigned: true }));
      state = "READING_CODES";
      return;
    }
    if (codes.length === 1 && !name) {
      const nextRow = diagnosisRowForClassification(rows[rowIndex + 1]?.text || "");
      const nextCodes = splitDiagnosticCodes(nextRow);
      const nextIsCodeOnly = nextCodes.length === 1 && /^[A-Z]\d{2,3}(?:\.\d{1,2})?$/i.test(nextRow.trim());
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
        const candidate = createDiagnosisCandidate({ name: pending.name, code: codes[0], rawText: `${pending.rawText} | ${evidenceText}`, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, status: pending.status, detectionRule: pending.detectionRule === "state-machine-differential-name" ? "state-machine-differential-column-pair" : "state-machine-column-pair" });
        finish(candidate);
        clinicalImportLogger.info("diagnosisParser:code", JSON.stringify({ documentId, noteId, rowIndex, assigned: true }));
      } else discardedCount += 1;
      state = "READING_CODES";
      return;
    }
    if (codes.length > 1) {
      if (name.length >= 3) finish(createDiagnosisCandidate({ name, rawText: evidenceText, section, documentId, noteId, sourceLocation: location, status: rowStatus || diagnosisStatus(evidenceText), requiresReview: true, detectionRule: row.forcedStatus ? "state-machine-differential-unpaired-codes" : "state-machine-unpaired-codes" }));
      else discardedCount += 1;
      state = "READING_CODES";
      return;
    }
    if ((explicit || section === "diagnosticos") && name.length >= 3) {
      pendingNames.push({ name, rawText: evidenceText, rowIndex, status: rowStatus || diagnosisStatus(evidenceText), detectionRule: row.forcedStatus ? "state-machine-differential-name" : (narrativeEntity ? "state-machine-narrative-entity" : "state-machine-name-without-code") });
      clinicalImportLogger.info("diagnosisParser:status", JSON.stringify({ documentId, noteId, rowIndex, status: rowStatus || "pending" }));
      state = rowStatus ? "READING_STATUS" : "READING_DIAGNOSIS";
    } else discardedCount += 1;
  });

  pendingNames.forEach((pending) => finish(createDiagnosisCandidate({ name: pending.name, rawText: pending.rawText, section, documentId, noteId, sourceLocation: { ...sourceLocation, rowIndex: pending.rowIndex }, status: pending.status, requiresReview: true, detectionRule: pending.detectionRule || "state-machine-name-without-code" })));
  clinicalImportLogger.info("diagnosisParser:finished", JSON.stringify({ documentId, noteId, tokenCount: tokens.length, detectedCount: candidates.length, pairedCount: candidates.filter((candidate) => candidate.code).length, discardedCount, state: candidates.length ? "FINALIZE_DIAGNOSIS" : "WAITING_DIAGNOSIS" }));
  return candidates;
}

export function parseDiagnosisBlock({ text = "", section = "diagnosticos", documentId = "", noteId = "", sourceLocation = {}, explicit = false } = {}) {
  return parseDiagnosisCandidates({ text, section, documentId, noteId, sourceLocation, explicit });
}

export function detectDiagnosisCandidates({ sections = {}, fullText = "", sourceBlocks = [], documentId = "", noteId = "" } = {}) {
  const detected = [];
  let hasStructuredDiagnosisTable = false;
  const sourcePriority = (item) => (item.metadata?.sourceType === "structured_diagnosis" || item.metadata?.sourceSection === "diagnosticos" ? 3 : item.metadata?.sourceType === "narrative_history" ? 1 : 2) + (item.code ? 1 : 0);
  const add = (items) => items.forEach((item) => {
    if (!item.diagnosisName) return;
    const key = item.normalizedDiagnosis || normalizeClinicalComparisonText(item.diagnosisName);
    const index = detected.findIndex((existing) => (existing.normalizedDiagnosis || normalizeClinicalComparisonText(existing.diagnosisName)) === key);
    if (index < 0) detected.push(item);
    else if (sourcePriority(item) > sourcePriority(detected[index])) detected[index] = item;
  });
  sourceBlocks.filter((block) => block.type === "table").forEach((block) => {
    (block.rows || []).forEach((row, rowIndex) => {
      const rowText = row.join(" | ");
      const codeColumn = row.length > 1 ? String(row[1] || "") : "";
      const codes = splitDiagnosticCodes(codeColumn || rowText);
      const names = splitDiagnosisNameColumn(row[0] || "", codes);
      const location = { tableIndex: block.source?.tableIndex, blockIndex: block.source?.blockIndex, rowIndex };
      if (names.length === 1 && codes.length) {
        hasStructuredDiagnosisTable = true;
        const isDifferential = splitDifferentialDiagnosisRow({ text: names[0] }).length > 1;
        const parsedCandidates = parseDiagnosisCandidates({
          text: `${names[0]} | ${(isDifferential ? codes : [codes[0]]).join(" | ")}`,
          section: "diagnosticos",
          documentId,
          noteId,
          sourceLocation: location,
          explicit: true
        });
        parsedCandidates.forEach((candidate) => {
          if (!isDifferential) candidate.codes = [...new Set(codes)];
          candidate.metadata.codeEvidence = candidate.codes.map((code) => ({
            code,
            blockIndex: location.blockIndex ?? null,
            paragraphIndex: rowIndex,
            rawText: codeColumn || rowText
          }));
        });
        add(parsedCandidates);
        return;
      }
      if (codes.length && names.length > 1) {
        hasStructuredDiagnosisTable = true;
        let codeOffset = 0;
        names.forEach((name, index) => {
          const differentialCount = splitDifferentialDiagnosisRow({ text: name }).length;
          const nameCodes = differentialCount > 1
            ? codes.slice(codeOffset, codeOffset + differentialCount)
            : codes.slice(codeOffset, codeOffset + 1);
          codeOffset += nameCodes.length;
          add(parseDiagnosisCandidates({
            text: nameCodes.length ? `${name} | ${nameCodes.join(" | ")}` : name,
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
