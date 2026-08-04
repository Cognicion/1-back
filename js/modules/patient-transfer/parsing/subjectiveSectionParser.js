import { CLINICAL_SECTION_ALIASES, NOTE_START_ALIASES } from "./clinicalSectionConfig.js";

const SUBJECTIVE_BOUNDARY_ALIASES = Object.freeze([
  ...CLINICAL_SECTION_ALIASES.physicalNeurologicalExam,
  ...CLINICAL_SECTION_ALIASES.examenMental,
  "resultados relevantes de los estudios de diagnóstico",
  ...CLINICAL_SECTION_ALIASES.diagnosticos,
  ...CLINICAL_SECTION_ALIASES.plan,
  ...CLINICAL_SECTION_ALIASES.tratamiento,
  ...CLINICAL_SECTION_ALIASES.medicamentos,
  ...CLINICAL_SECTION_ALIASES.analisis,
  ...CLINICAL_SECTION_ALIASES.pronostico,
  ...CLINICAL_SECTION_ALIASES.destino,
  "nombre, firma y cédula profesional",
  ...NOTE_START_ALIASES
]);

const VITAL_SIGN_LABELS = Object.freeze([
  "presión arterial",
  "temperatura",
  "frecuencia cardiaca",
  "frecuencia respiratoria",
  "sato2",
  "saturación",
  "peso",
  "talla",
  "imc"
]);

function canonicalizeWithMap(value = "") {
  const source = String(value || "").replace(/\u00a0/g, " ").trim();
  const characters = [];
  let pendingSpace = null;

  for (let index = 0; index < source.length;) {
    const codePoint = source.codePointAt(index);
    const original = String.fromCodePoint(codePoint);
    const originalEnd = index + original.length;
    const normalized = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (/\s/u.test(normalized)) {
      if (characters.length && characters.at(-1).character !== "/") pendingSpace = { start: index, end: originalEnd };
      index = originalEnd;
      continue;
    }

    if (normalized === "/") {
      if (characters.at(-1)?.character === " ") characters.pop();
      pendingSpace = null;
      characters.push({ character: "/", start: index, end: originalEnd });
      index = originalEnd;
      continue;
    }

    if (pendingSpace && characters.length && characters.at(-1).character !== "/") {
      characters.push({ character: " ", ...pendingSpace });
    }
    pendingSpace = null;
    [...normalized].forEach((character) => characters.push({ character, start: index, end: originalEnd }));
    index = originalEnd;
  }

  return {
    source,
    text: characters.map((item) => item.character).join(""),
    characters
  };
}

function canonicalize(value = "") {
  return canonicalizeWithMap(value).text.replace(/[.:;]+$/g, "").trim();
}

function orderedAliases(aliases = []) {
  return [...new Set(aliases.filter(Boolean))]
    .map((alias) => ({ alias, canonical: canonicalize(alias) }))
    .filter((item) => item.canonical)
    .sort((a, b) => b.canonical.length - a.canonical.length);
}

function isUppercaseHeading(value = "") {
  const letters = String(value || "").replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function matchHeadingAtLineStart(value = "", aliases = []) {
  const normalized = canonicalizeWithMap(value);
  for (const candidate of orderedAliases(aliases)) {
    if (!normalized.text.startsWith(candidate.canonical)) continue;
    const boundaryCharacter = normalized.text[candidate.canonical.length] || "";
    if (boundaryCharacter && !/[\s:;|()\-]/.test(boundaryCharacter)) continue;

    const mappedEnd = normalized.characters[candidate.canonical.length - 1]?.end ?? 0;
    const matchedText = normalized.source.slice(0, mappedEnd).trim();
    let remainder = normalized.source.slice(mappedEnd);
    const delimiter = remainder.match(/^\s*[:：]\s*/u)?.[0] || "";
    if (delimiter) remainder = remainder.slice(delimiter.length);
    else if (remainder.trim() && !(candidate.canonical.length >= 18 && isUppercaseHeading(matchedText))) continue;

    return {
      alias: candidate.alias,
      headingText: matchedText,
      inlineContent: remainder.trim(),
      headingEnd: mappedEnd,
      delimiter: delimiter ? ":" : ""
    };
  }
  return null;
}

function lineRecords(blocks = []) {
  const records = [];
  let offset = 0;
  const addLines = (text, block, fallbackIndex, location = {}) => {
    String(text || "").split(/\r?\n/).forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (!line) return;
      const startOffset = offset;
      const endOffset = startOffset + line.length;
      records.push({
        text: line,
        blockIndex: Number.isInteger(block.source?.blockIndex) ? block.source.blockIndex : fallbackIndex,
        blockType: block.type,
        lineIndex,
        startOffset,
        endOffset,
        ...location
      });
      offset = endOffset + 1;
    });
  };

  blocks.forEach((block, blockPosition) => {
    if (block.type !== "table") {
      addLines(block.text, block, blockPosition);
      return;
    }
    (block.rows || []).forEach((row, rowIndex) => {
      (row || []).forEach((cell, cellIndex) => addLines(cell, block, blockPosition, { rowIndex, cellIndex }));
    });
  });
  return records;
}

function isVitalSignsTable(block = {}) {
  if (block.type !== "table") return false;
  const heading = canonicalize((block.rows?.[0] || []).join(" "));
  return VITAL_SIGN_LABELS.filter((label) => heading.includes(canonicalize(label))).length >= 3;
}

function cleanSubjectiveText(parts = []) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/(RIESGO\s+SUICIDA)(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/gu, "$1\n")
    .trim();
}

function sourceLabel(result = {}) {
  if (result.detectionMethod === "between-vitals-and-physical-exam") {
    return "Texto entre signos vitales y exploración física";
  }
  return result.matchedHeading || "";
}

/**
 * Extrae exclusivamente Subjetivo dentro de una nota ya delimitada.
 * Nunca utiliza rawText ni el texto completo del documento como respaldo.
 */
export function parseSubjectiveSection({ noteSegment = {}, headings = [], sectionAliases = CLINICAL_SECTION_ALIASES } = {}) {
  void headings;
  const blocks = noteSegment.blocks || [];
  const records = lineRecords(blocks);
  const subjectiveAliases = sectionAliases.subjetivo || CLINICAL_SECTION_ALIASES.subjetivo;
  const noteId = noteSegment.id || "";
  const traceBase = { noteId, date: noteSegment.date || "", time: noteSegment.time || "" };
  console.info("[patient-transfer] subjective:start", traceBase);

  let startRecordIndex = -1;
  let startMatch = null;
  for (let index = 0; index < records.length; index += 1) {
    const match = matchHeadingAtLineStart(records[index].text, subjectiveAliases);
    if (!match) continue;
    startRecordIndex = index;
    startMatch = match;
    break;
  }

  let detectionMethod = "explicit-heading";
  if (startRecordIndex < 0) {
    const physicalIndex = records.findIndex((record) => matchHeadingAtLineStart(record.text, CLINICAL_SECTION_ALIASES.physicalNeurologicalExam));
    const physicalBlockIndex = physicalIndex >= 0 ? records[physicalIndex].blockIndex : Number.POSITIVE_INFINITY;
    const vitalBlock = [...blocks]
      .filter((block) => isVitalSignsTable(block) && (block.source?.blockIndex ?? -1) < physicalBlockIndex)
      .at(-1);
    if (vitalBlock && physicalIndex >= 0) {
      const vitalBlockIndex = vitalBlock.source?.blockIndex;
      startRecordIndex = records.findIndex((record) => record.blockIndex > vitalBlockIndex && record.blockIndex < physicalBlockIndex);
      detectionMethod = "between-vitals-and-physical-exam";
    }
  }

  if (startRecordIndex < 0) {
    const empty = {
      text: "",
      matchedHeading: "",
      sourceLabel: "",
      startBlockIndex: null,
      endBlockIndex: null,
      startOffset: null,
      endOffset: null,
      nextHeading: "",
      detectionMethod: "not-detected"
    };
    console.info("[patient-transfer] subjective:parsed", { ...traceBase, characterLength: 0, detectionMethod: empty.detectionMethod });
    return empty;
  }

  const contentParts = [];
  if (startMatch?.inlineContent) contentParts.push(startMatch.inlineContent);
  let endRecordIndex = records.length;
  let nextHeading = "";

  for (let index = startMatch ? startRecordIndex + 1 : startRecordIndex; index < records.length; index += 1) {
    const record = records[index];
    const boundary = matchHeadingAtLineStart(record.text, SUBJECTIVE_BOUNDARY_ALIASES);
    if (boundary) {
      endRecordIndex = index;
      nextHeading = boundary.headingText || boundary.alias;
      break;
    }
    const nestedSubjective = matchHeadingAtLineStart(record.text, subjectiveAliases);
    if (nestedSubjective) {
      if (nestedSubjective.inlineContent) contentParts.push(nestedSubjective.inlineContent);
      continue;
    }
    contentParts.push(record.text);
  }

  const firstContentRecord = records[startMatch ? startRecordIndex + 1 : startRecordIndex] || records[startRecordIndex];
  const boundaryRecord = records[endRecordIndex];
  const lastContentRecord = records[Math.max(startRecordIndex, endRecordIndex - 1)] || records[startRecordIndex];
  const result = {
    text: cleanSubjectiveText(contentParts),
    matchedHeading: startMatch?.headingText || "",
    startBlockIndex: startMatch ? records[startRecordIndex].blockIndex : firstContentRecord?.blockIndex ?? null,
    endBlockIndex: boundaryRecord?.blockIndex ?? (noteSegment.endBlockIndex ?? (lastContentRecord?.blockIndex != null ? lastContentRecord.blockIndex + 1 : null)),
    startOffset: startMatch ? records[startRecordIndex].endOffset : firstContentRecord?.startOffset ?? null,
    endOffset: boundaryRecord?.startOffset ?? lastContentRecord?.endOffset ?? null,
    nextHeading,
    detectionMethod
  };
  result.sourceLabel = sourceLabel(result);

  if (startMatch) {
    console.info("[patient-transfer] subjective:heading-found", {
      ...traceBase,
      matchedHeading: result.matchedHeading,
      startBlockIndex: result.startBlockIndex
    });
  }
  console.info("[patient-transfer] subjective:boundary-found", {
    ...traceBase,
    nextHeading: result.nextHeading,
    endBlockIndex: result.endBlockIndex
  });
  console.info("[patient-transfer] subjective:parsed", {
    ...traceBase,
    matchedHeading: result.matchedHeading,
    nextHeading: result.nextHeading,
    startBlockIndex: result.startBlockIndex,
    endBlockIndex: result.endBlockIndex,
    characterLength: result.text.length,
    detectionMethod: result.detectionMethod
  });
  return result;
}

