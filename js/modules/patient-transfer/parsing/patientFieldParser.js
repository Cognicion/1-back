import { FIELD_RULES } from "../../importacionDocx/docxImportConfig.js";

function normalizeLabel(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[:：]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanValue(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value = "") {
  const text = cleanValue(value);
  const iso = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const mx = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (mx) {
    const year = mx[3].length === 2 ? `20${mx[3]}` : mx[3];
    return `${year}-${mx[2].padStart(2, "0")}-${mx[1].padStart(2, "0")}`;
  }
  return text;
}

function normalizeHour(value = "") {
  const match = cleanValue(value).match(/\b(\d{1,2}):(\d{2})\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : cleanValue(value);
}

function normalizeField(key, value) {
  if (key === "fecha" || key === "fechaNacimiento") return normalizeDate(value);
  if (key === "hora") return normalizeHour(value);
  if (key === "edad") return cleanValue(value).match(/\d{1,3}/)?.[0] || cleanValue(value);
  return cleanValue(value);
}

function findRule(label = "") {
  const normalized = normalizeLabel(label);
  return FIELD_RULES.find((rule) =>
    rule.aliases.some((alias) => normalized === normalizeLabel(alias) || normalized.endsWith(normalizeLabel(alias)))
  );
}

function makeDetectedField({ key, value, method, source, confidence, sourceFileId = "" }) {
  return {
    value: normalizeField(key, value),
    detectionMethod: method,
    sourceFileId,
    sourceLocation: source || {},
    confidence,
    confirmed: false
  };
}

function parseParagraphLine(line = "") {
  const match = String(line).match(/^([^:：]{2,70})[:：]\s*(.+)$/);
  return match ? { label: match[1], value: match[2] } : null;
}

export function parsePatientFields(blocks = [], sourceFileId = "") {
  const fields = {};
  const conflicts = [];

  blocks.forEach((block) => {
    if (block.type === "table") {
      block.rows.forEach((row, rowIndex) => {
        if (row.length < 2) return;
        const rule = findRule(row[0]);
        if (!rule) return;
        const detected = makeDetectedField({
          key: rule.key,
          value: row.slice(1).join(" "),
          method: "labeled-table-field",
          source: { ...block.source, rowIndex, cellIndex: 1, sourceFileId },
          sourceFileId,
          confidence: "alta"
        });
        if (fields[rule.key] && fields[rule.key].value !== detected.value) {
          conflicts.push({ key: rule.key, current: fields[rule.key], incoming: detected });
          return;
        }
        fields[rule.key] = fields[rule.key] || detected;
      });
      return;
    }

    const pair = parseParagraphLine(block.text);
    if (!pair) return;
    const rule = findRule(pair.label);
    if (!rule) return;
    const detected = makeDetectedField({
      key: rule.key,
      value: pair.value,
      method: "labeled-paragraph-field",
      source: { ...block.source, sourceFileId },
      sourceFileId,
      confidence: "alta"
    });
    if (fields[rule.key] && fields[rule.key].value !== detected.value) {
      conflicts.push({ key: rule.key, current: fields[rule.key], incoming: detected });
      return;
    }
    fields[rule.key] = fields[rule.key] || detected;
  });

  const fullText = blocks.map((block) => block.type === "paragraph" ? block.text : block.rows.map((row) => row.join(" ")).join("\n")).join("\n");
  if (!fields.curp) {
    const curp = fullText.match(/\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i)?.[0];
    if (curp) {
      fields.curp = makeDetectedField({
        key: "curp",
        value: curp.toUpperCase(),
        method: "curp-pattern",
        source: { sourceFileId },
        sourceFileId,
        confidence: "media"
      });
    }
  }

  return { fields, conflicts };
}

export function fieldValues(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field?.value || ""]));
}

export { FIELD_RULES };
