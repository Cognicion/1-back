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

const SUBJECTIVE_CONTAMINANTS = Object.freeze([
  "NOTA DE EVOLUCIÓN",
  "NOTA DE INGRESO",
  "EXPLORACIÓN FÍSICA",
  "EXAMEN MENTAL",
  "DIAGNÓSTICO CIE-10",
  "PLAN TERAPÉUTICO",
  "COMENTARIO Y/O ANÁLISIS",
  "PRONÓSTICO",
  "DESTINO",
  "CÉD. PROF."
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

function findFirstBoundaryInsideText(value = "", aliases = []) {
  const normalized = canonicalizeWithMap(value);
  let earliest = null;

  for (const candidate of orderedAliases(aliases)) {
    let searchFrom = 0;

    while (searchFrom < normalized.text.length) {
      const position = normalized.text.indexOf(
        candidate.canonical,
        searchFrom
      );

      if (position < 0) break;

      const previous =
        normalized.text[position - 1] || "";

      const next =
        normalized.text[
          position + candidate.canonical.length
        ] || "";

      const validStart =
        position === 0 ||
        /[\s.;:|()[\]\-]/u.test(previous);

      const validEnd =
        !next ||
        /[\s:;|()[\]\-]/u.test(next);

      if (validStart && validEnd) {
        const originalStart =
          normalized.characters[position]?.start ?? 0;

        const originalEnd =
          normalized.characters[
            position + candidate.canonical.length - 1
          ]?.end ?? originalStart;

        if (!earliest || originalStart < earliest.start) {
          earliest = {
            alias: candidate.alias,
            headingText: normalized.source
              .slice(originalStart, originalEnd)
              .trim(),
            start: originalStart,
            end: originalEnd
          };
        }

        break;
      }

      searchFrom = position + 1;
    }
  }

  return earliest;
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
        localBlockIndex: fallbackIndex,
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

console.log(
  "NOTE",
  noteSegment.date,
  noteSegment.time,
  records.length
);

records.forEach((record, i) => {
  console.log(i, record.text.substring(0, 80));
});


  const subjectiveAliases = sectionAliases.subjetivo || CLINICAL_SECTION_ALIASES.subjetivo;
  const noteId = noteSegment.id || "";
  const traceBase = {
    noteId,
    date: noteSegment.date || "",
    time: noteSegment.time || "",
    segmentStartBlock: noteSegment.startBlockIndex ?? null,
    segmentEndBlock: noteSegment.endBlockIndex ?? null,
    segmentBlockCount: blocks.length,
    segmentRawTextLength: String(noteSegment.rawText || "").length
  };
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
      localStartBlockIndex: null,
      localEndBlockIndex: null,
      startOffset: null,
      endOffset: null,
      nextHeading: "",
      detectionMethod: "not-detected"
    };
    console.info("[patient-transfer] subjective:parsed", {
      ...traceBase,
      subjectiveStartBlock: null,
      subjectiveEndBlock: null,
      subjectiveLength: 0,
      detectionMethod: empty.detectionMethod
    });
    return empty;
  }

const contentParts = [];
let endRecordIndex = records.length;
let nextHeading = "";
let inlineBoundaryOffset = null;
let boundaryFoundInStartLine = false;

if (startMatch?.inlineContent) {
  const inlineBoundary = findFirstBoundaryInsideText(
    startMatch.inlineContent,
    SUBJECTIVE_BOUNDARY_ALIASES
  );

  if (inlineBoundary) {
    const textBeforeBoundary = startMatch.inlineContent
      .slice(0, inlineBoundary.start)
      .trim();

    if (textBeforeBoundary) {
      contentParts.push(textBeforeBoundary);
    }

    nextHeading =
      inlineBoundary.headingText ||
      inlineBoundary.alias;

    inlineBoundaryOffset =
      records[startRecordIndex].startOffset +
      startMatch.headingEnd +
      inlineBoundary.start;

    endRecordIndex = startRecordIndex;
    boundaryFoundInStartLine = true;
  } else {
    contentParts.push(startMatch.inlineContent);
  }
}

if (!boundaryFoundInStartLine) {
  for (
    let index = startMatch
      ? startRecordIndex + 1
      : startRecordIndex;
    index < records.length;
    index += 1
  ) {
    const record = records[index];

    const boundary = matchHeadingAtLineStart(
      record.text,
      SUBJECTIVE_BOUNDARY_ALIASES
    );

    if (boundary) {
      endRecordIndex = index;
      nextHeading =
        boundary.headingText ||
        boundary.alias;
      break;
    }

    const inlineBoundary = findFirstBoundaryInsideText(
      record.text,
      SUBJECTIVE_BOUNDARY_ALIASES
    );

    if (inlineBoundary) {
      const textBeforeBoundary = record.text
        .slice(0, inlineBoundary.start)
        .trim();

      if (textBeforeBoundary) {
        contentParts.push(textBeforeBoundary);
      }

      endRecordIndex = index;
      nextHeading =
        inlineBoundary.headingText ||
        inlineBoundary.alias;

      inlineBoundaryOffset =
        record.startOffset +
        inlineBoundary.start;

      break;
    }

    const nestedSubjective = matchHeadingAtLineStart(
      record.text,
      subjectiveAliases
    );

    if (nestedSubjective) {
      if (nestedSubjective.inlineContent) {
        contentParts.push(
          nestedSubjective.inlineContent
        );
      }

      continue;
    }

    contentParts.push(record.text);
  }
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
    localStartBlockIndex: startMatch ? records[startRecordIndex].localBlockIndex : firstContentRecord?.localBlockIndex ?? null,
    localEndBlockIndex: boundaryRecord?.localBlockIndex ?? blocks.length,
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
    subjectiveStartBlock: result.startBlockIndex,
    subjectiveEndBlock: result.endBlockIndex,
    localSubjectiveStartBlock: result.localStartBlockIndex,
    localSubjectiveEndBlock: result.localEndBlockIndex,
    subjectiveLength: result.text.length,
    detectionMethod: result.detectionMethod
  });
  return result;
}

export function assertSubjectiveIsolation(noteSegments = []) {
  const sectionReferences = new Set();
  noteSegments.forEach((segment) => {
    if (sectionReferences.has(segment.sections)) {
      throw new Error(`Subjetivo no aislado: ${segment.id || "nota-sin-id"} comparte el objeto sections.`);
    }
    sectionReferences.add(segment.sections);
    const text = String(segment.sections?.subjetivo || "");
    const normalizedText = canonicalize(text).toUpperCase();
    SUBJECTIVE_CONTAMINANTS.forEach((term) => {
      const normalizedTerm = canonicalize(term).toUpperCase();
      const position = normalizedText.indexOf(normalizedTerm);
      if (position >= 0) {
        throw new Error(`Subjetivo contaminado: noteId=${segment.id || "nota-sin-id"}; término=${term}; posición=${position}.`);
      }
    });
  });
  return true;
}
