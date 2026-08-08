import { FIELD_RULES } from "../../importacionDocx/docxImportConfig.js";
import {
  buildFullPatientName,
  buildNameFieldsFromExplicitParts,
  inferStructuredPatientNameFormat,
  PATIENT_NAME_SOURCE_FORMATS,
  suggestPatientNameParts
} from "./patientNameParser.js";

const DEBUG_FLAG = "cognicion.debug.patientTransfer";

export const PATIENT_FIELD_DEFINITIONS = FIELD_RULES.map((rule) => ({
  key: rule.key,
  label: rule.label,
  labels: [...rule.aliases].sort((a, b) => b.length - a.length)
}));

function debugPatientFields(stage, payload = {}) {
  if (typeof localStorage === "undefined" || localStorage.getItem(DEBUG_FLAG) !== "1") return;
  console.info("[PATIENT TRANSFER FIELDS]", { stage, ...payload });
}

export function normalizeLabelForMatching(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:：]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTextWithMap(value = "") {
  const output = [];
  const map = [];
  [...String(value || "")].forEach((char, index) => {
    const normalized = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const replacement = /\s/.test(normalized) ? " " : normalized;
    [...replacement].forEach((item) => {
      output.push(item);
      map.push(index);
    });
  });
  return {
    text: output.join(""),
    map
  };
}

export function cleanExtractedFieldValue(value = "") {
  return String(value || "")
    .replace(/^[\s:：\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeHourSuffix(value = "") {
  return cleanExtractedFieldValue(value).replace(/\s*(hrs?|horas?)\.?$/i, "").trim();
}

function cleanFieldValue(value = "", fieldKey = "", label = "") {
  let clean = cleanExtractedFieldValue(value);
  if (label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    clean = clean.replace(new RegExp(`^${escaped}\\s*[:ï¼š\\-â€“â€”]?\\s*`, "i"), "").trim();
  }
  if (fieldKey === "cama") {
    clean = clean.replace(/^(?:no\.?\s*de\s*)?cama\s*[:ï¼š\-â€“â€”]?\s*/i, "").trim();
  }
  return clean;
}

function parsePatientName(value = "") {
  return cleanExtractedFieldValue(value);
}

function parseBirthDate(value = "") {
  const cleaned = cleanExtractedFieldValue(value);
  const match = cleaned.match(/\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${match[1]}/${match[2]}/${match[3]}`;
}

function parseAge(value = "") {
  const age = Number(cleanExtractedFieldValue(value).match(/\b\d{1,3}\b/)?.[0] || NaN);
  return Number.isFinite(age) && age >= 0 && age <= 130 ? String(age) : cleanExtractedFieldValue(value);
}

function parseRecordNumber(value = "") {
  return normalizeRecordNumber(value);
}

function parseDocumentTime(value = "") {
  const match = removeHourSuffix(value).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : removeHourSuffix(value);
}

function parseSex(value = "") {
  return cleanExtractedFieldValue(value);
}

function parseGender(value = "") {
  return cleanExtractedFieldValue(value);
}

function parseService(value = "") {
  return cleanExtractedFieldValue(value);
}

function normalizeValueForField(key, value) {
  if (key === "nombre") return parsePatientName(value);
  if (key === "fechaNacimiento") return parseBirthDate(value);
  if (key === "edad") return parseAge(value);
  if (key === "expediente") return parseRecordNumber(value);
  if (key === "fecha") return cleanExtractedFieldValue(value);
  if (key === "hora") return parseDocumentTime(value);
  if (key === "sexo") return parseSex(value);
  if (key === "genero") return parseGender(value);
  if (key === "servicio") return parseService(value);
  return cleanExtractedFieldValue(value);
}

function buildLabelMatcher(definitions = PATIENT_FIELD_DEFINITIONS) {
  const labels = definitions.flatMap((definition) =>
    definition.labels.map((label) => ({
      key: definition.key,
      label,
      normalized: normalizeLabelForMatching(label)
    }))
  ).sort((a, b) => b.normalized.length - a.normalized.length);
  const pattern = labels
    .map((item) => item.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s.]+"))
    .join("|");
  return { labels, regex: new RegExp(`(?:^|\\s)(${pattern})\\s*(?::|：|-|–|—|\\t|\\s{2,})`, "gi") };
}

function findDefinitionByLabel(label = "") {
  const normalized = normalizeLabelForMatching(label);
  return PATIENT_FIELD_DEFINITIONS.find((definition) =>
    definition.labels.some((item) => normalized === normalizeLabelForMatching(item))
  );
}

export function locateFieldLabels(text = "", definitions = PATIENT_FIELD_DEFINITIONS) {
  const { text: normalizedText, map } = normalizeTextWithMap(text);
  const { labels, regex } = buildLabelMatcher(definitions);
  const matches = [];
  let match = regex.exec(normalizedText);
  while (match) {
    const normalizedLabel = normalizeLabelForMatching(match[1]);
    const definition = labels.find((item) => item.normalized === normalizedLabel);
    if (definition) {
      const leadingSpace = match[0].startsWith(" ") ? 1 : 0;
      const normalizedStart = match.index + leadingSpace;
      const normalizedEnd = regex.lastIndex;
      matches.push({
        fieldKey: definition.key,
        label: definition.label,
        normalizedLabel,
        start: map[normalizedStart] ?? normalizedStart,
        end: ((map[normalizedEnd - 1] ?? normalizedEnd - 1) + 1),
        normalizedStart,
        normalizedEnd
      });
    }
    match = regex.exec(normalizedText);
  }
  return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}

function sliceOriginalByOffsets(original = "", start = 0, end = original.length) {
  return original.slice(Math.max(0, start), Math.max(start, end));
}

/**
 * Extrae un campo administrativo delimitado por la siguiente etiqueta conocida.
 * Mantiene el texto original para que la revisión pueda editarlo sin perder
 * acentos ni la forma en que apareció en el documento.
 */
export function extractAdministrativeField({ text = "", aliases = [], nextFieldAliases = [] } = {}) {
  const definitions = [
    { key: "requested", label: "requested", labels: aliases },
    { key: "next", label: "next", labels: nextFieldAliases }
  ];
  const matches = locateFieldLabels(text, definitions);
  const current = matches.find((match) => match.fieldKey === "requested");
  if (!current) return null;
  const next = matches.find((match) => match.start > current.start);
  const rawValue = cleanFieldValue(
    sliceOriginalByOffsets(text, current.end, next?.start ?? text.length),
    "",
    current.label
  );
  return rawValue ? {
    rawValue,
    value: cleanExtractedFieldValue(rawValue),
    start: current.start,
    end: next?.start ?? text.length,
    nextField: next?.normalizedLabel || null,
    detectionRule: "administrative-field-delimited"
  } : null;
}

export function extractLabeledFieldsFromText(text = "", definitions = PATIENT_FIELD_DEFINITIONS) {
  const matches = locateFieldLabels(text, definitions);
  return matches.map((match, index) => {
    const next = matches[index + 1];
    const rawValue = cleanFieldValue(sliceOriginalByOffsets(text, match.end, next?.start ?? text.length), match.fieldKey, match.label);
    return {
      fieldKey: match.fieldKey,
      label: match.label,
      rawValue,
      normalizedValue: normalizeValueForField(match.fieldKey, rawValue),
      start: match.start,
      end: next?.start ?? text.length,
      detectionRule: "multi-label-text"
    };
  }).filter((candidate) => candidate.rawValue);
}

function candidatesFromParagraph(block, sourceFileId = "") {
  const candidates = extractLabeledFieldsFromText(block.text).map((candidate) => ({
    ...candidate,
    sourceType: "paragraph",
    sourceFileId,
    blockIndex: block.source?.blockIndex,
    detectionRule: "paragraph-multi-label",
    confidence: "alta"
  }));
  debugPatientFields("paragraph", {
    blockIndex: block.source?.blockIndex,
    blockType: "paragraph",
    rawRuns: block.rawRuns || [],
    reconstructedText: block.text,
    candidates: candidates.map(({ fieldKey, label, rawValue, detectionRule }) => ({ fieldKey, label, rawValue, detectionRule }))
  });
  return candidates;
}

function candidatesFromTable(block, sourceFileId = "") {
  const candidates = [];
  block.rows.forEach((row, rowIndex) => {
    for (let cellIndex = 0; cellIndex < row.length - 1; cellIndex += 1) {
      const definition = findDefinitionByLabel(row[cellIndex]);
      if (!definition) continue;
      const rawValue = cleanFieldValue(row[cellIndex + 1], definition.key, definition.label);
      if (!rawValue) continue;
      candidates.push({
        fieldKey: definition.key,
        label: definition.label,
        rawValue,
        normalizedValue: normalizeValueForField(definition.key, rawValue),
        sourceType: "table",
        sourceFileId,
        blockIndex: block.source?.blockIndex,
        tableIndex: block.source?.tableIndex,
        rowIndex,
        cellIndex: cellIndex + 1,
        detectionRule: "table-label-adjacent-cell",
        confidence: "alta"
      });
    }
    for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
      const text = row.slice(cellIndex, cellIndex + 2).join(" ");
      extractLabeledFieldsFromText(text).forEach((candidate) => {
        candidates.push({
          ...candidate,
          sourceType: "table",
          sourceFileId,
          blockIndex: block.source?.blockIndex,
          tableIndex: block.source?.tableIndex,
          rowIndex,
          cellIndex,
          detectionRule: "table-multi-label",
          confidence: "alta"
        });
      });
    }
  });
  debugPatientFields("table", {
    blockIndex: block.source?.blockIndex,
    tableIndex: block.source?.tableIndex,
    rows: block.rows,
    candidates: candidates.map(({ fieldKey, label, rawValue, detectionRule }) => ({ fieldKey, label, rawValue, detectionRule }))
  });
  return candidates;
}

function scoreCandidate(candidate) {
  let score = 0;
  if (candidate.sourceType === "table") score += 30;
  if (candidate.sourceType === "paragraph") score += 20;
  if (candidate.blockIndex <= 8) score += 20;
  if (candidate.confidence === "alta") score += 10;
  if (candidate.normalizedValue) score += 5;
  return score;
}

function candidateToField(candidate, alternatives = [], conflict = false) {
  return {
    value: candidate.normalizedValue,
    rawValue: candidate.rawValue,
    ...(candidate.fieldKey === "expediente" ? { expedienteOriginal: candidate.rawValue } : {}),
    normalizedValue: candidate.normalizedValue,
    detectionMethod: candidate.detectionRule,
    sourceFileId: candidate.sourceFileId,
    sourceLocation: {
      sourceType: candidate.sourceType,
      blockIndex: candidate.blockIndex,
      tableIndex: candidate.tableIndex,
      rowIndex: candidate.rowIndex,
      cellIndex: candidate.cellIndex,
      start: candidate.start,
      end: candidate.end
    },
    confidence: candidate.confidence,
    alternatives,
    conflict,
    nameSplit: candidate.nameSplit || null,
    sourceLabel: candidate.label || "",
    confirmed: false
  };
}

function syntheticNameField({ key, value, source, ruleApplied, confidence = "medium", nameSplit = null }) {
  return {
    value,
    rawValue: value,
    normalizedValue: value,
    detectionMethod: ruleApplied,
    sourceFileId: source?.sourceFileId || "",
    sourceLocation: source?.sourceLocation || {},
    confidence,
    alternatives: [],
    conflict: false,
    nameSplit,
    confirmed: false
  };
}

function inferNameSourceFormat(fields = {}) {
  return inferStructuredPatientNameFormat(fields.nombre?.value || "", {
    detectionMethod: fields.nombre?.detectionMethod || "",
    sourceType: fields.nombre?.sourceLocation?.sourceType || "",
    sourceLabel: fields.nombre?.sourceLabel || ""
  });
}

function resolveNameFields(fields = {}) {
  const explicit = buildNameFieldsFromExplicitParts(fields);
  if (explicit.nombreCompleto) {
    fields.nombre = syntheticNameField({
      key: "nombre",
      value: explicit.nombreCompleto,
      source: fields.nombres || fields.apellidoPaterno || fields.apellidoMaterno,
      ruleApplied: "explicit-separated-fields",
      confidence: "alta",
      nameSplit: { ...explicit, requiresReview: false, ruleApplied: "explicit-separated-fields" }
    });
    return fields;
  }

  const fullName = fields.nombre?.value || "";
  if (!fullName) return fields;
  const sourceFormat = inferNameSourceFormat(fields);
  const suggestion = {
    ...suggestPatientNameParts(fullName, {
      sourceFormat,
      preserveAmbiguous: sourceFormat === PATIENT_NAME_SOURCE_FORMATS.UNKNOWN
    }),
    sourceFormat
  };
  if (!fields.nombres && suggestion.nombres) {
    fields.nombres = syntheticNameField({
      key: "nombres",
      value: suggestion.nombres,
      source: fields.nombre,
      ruleApplied: suggestion.ruleApplied,
      confidence: suggestion.confidence === "high" ? "media" : "baja",
      nameSplit: suggestion
    });
  }
  if (!fields.apellidoPaterno && suggestion.apellidoPaterno) {
    fields.apellidoPaterno = syntheticNameField({
      key: "apellidoPaterno",
      value: suggestion.apellidoPaterno,
      source: fields.nombre,
      ruleApplied: suggestion.ruleApplied,
      confidence: suggestion.confidence === "high" ? "media" : "baja",
      nameSplit: suggestion
    });
  }
  if (!fields.apellidoMaterno && suggestion.apellidoMaterno) {
    fields.apellidoMaterno = syntheticNameField({
      key: "apellidoMaterno",
      value: suggestion.apellidoMaterno,
      source: fields.nombre,
      ruleApplied: suggestion.ruleApplied,
      confidence: suggestion.confidence === "high" ? "media" : "baja",
      nameSplit: suggestion
    });
  }
  fields.nombre.nameSplit = suggestion;
  fields.nombre.confidence = fields.nombre.confidence || "media";
  fields.nombre.value = sourceFormat === PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST
    || sourceFormat === PATIENT_NAME_SOURCE_FORMATS.UNKNOWN
    ? fullName
    : buildFullPatientName({
        nombres: fields.nombres?.value || "",
        apellidoPaterno: fields.apellidoPaterno?.value || "",
        apellidoMaterno: fields.apellidoMaterno?.value || ""
      }) || fullName;
  return fields;
}

export function resolveFieldCandidates(candidates = []) {
  const grouped = new Map();
  candidates.forEach((candidate) => {
    if (!grouped.has(candidate.fieldKey)) grouped.set(candidate.fieldKey, []);
    grouped.get(candidate.fieldKey).push(candidate);
  });

  const fields = {};
  const conflicts = [];
  grouped.forEach((items, key) => {
    const sorted = [...items].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const selected = sorted[0];
    const alternatives = sorted.slice(1);
    const conflict = alternatives.some((item) => item.normalizedValue !== selected.normalizedValue);
    if (conflict) conflicts.push({ key, current: selected, alternatives });
    fields[key] = candidateToField(selected, alternatives, conflict);
  });
  return { fields: resolveNameFields(fields), conflicts };
}

export function parsePatientFields(blocks = [], sourceFileId = "") {
  const candidates = blocks.flatMap((block) => {
    if (block.type === "table") return candidatesFromTable(block, sourceFileId);
    return candidatesFromParagraph(block, sourceFileId);
  });

  const fullText = blocks.map((block) => block.type === "paragraph" ? block.text : block.rows.map((row) => row.join(" ")).join("\n")).join("\n");
  const curp = fullText.match(/\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i)?.[0];
  if (curp) {
    candidates.push({
      fieldKey: "curp",
      label: "CURP",
      rawValue: curp.toUpperCase(),
      normalizedValue: curp.toUpperCase(),
      sourceType: "pattern",
      sourceFileId,
      detectionRule: "curp-pattern",
      confidence: "media"
    });
  }

  const resolved = resolveFieldCandidates(candidates);
  debugPatientFields("resolved", {
    fields: Object.fromEntries(Object.entries(resolved.fields).map(([key, field]) => [key, {
      value: field.value,
      rawValue: field.rawValue,
      detectionMethod: field.detectionMethod,
      sourceLocation: field.sourceLocation,
      confidence: field.confidence,
      conflict: field.conflict
    }])),
    conflicts: resolved.conflicts.map((item) => item.key)
  });

  return { ...resolved, candidates };
}

export function fieldValues(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field?.value || ""]));
}

export { FIELD_RULES };
import { normalizeRecordNumber } from "./patientDuplicateMatcher.js";
