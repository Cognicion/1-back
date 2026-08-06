import { flattenNormalizedBlocks } from "../docx/docxBlockNormalizer.js";
import { CLINICAL_SECTION_ALIASES, CLINICAL_SECTION_KEYS, MENTAL_EXAM_BOUNDARY_ALIASES } from "./clinicalSectionConfig.js";
import { findFirstBoundaryInsideText, parseSubjectiveSection } from "./subjectiveSectionParser.js";

export const SECTION_RULES = CLINICAL_SECTION_ALIASES;

export function normalizeClinicalHeading(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:;]+$/g, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const ORDERED_ALIASES = Object.freeze(
  Object.entries(CLINICAL_SECTION_ALIASES)
    .flatMap(([key, aliases]) => aliases.map((alias) => ({ key, alias, normalized: normalizeClinicalHeading(alias) })))
    .sort((a, b) => b.normalized.length - a.normalized.length)
);

function isUppercaseHeading(value = "") {
  const letters = String(value).replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function matchHeadingPart(rawHeading = "") {
  const normalized = normalizeClinicalHeading(rawHeading);
  if (!normalized || normalized.length > 180) return null;
  return ORDERED_ALIASES.find(({ normalized: alias }) => normalized === alias) || null;
}

/** Reconoce títulos aislados y títulos con contenido después de dos puntos. */
export function detectClinicalHeading(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const colonIndex = raw.search(/[:：]/);
  if (colonIndex >= 0) {
    const headingText = raw.slice(0, colonIndex).trim();
    const match = matchHeadingPart(headingText);
    if (match) {
      return {
        key: match.key,
        alias: match.alias,
        headingText,
        inlineContent: raw.slice(colonIndex + 1).trim(),
        delimiter: ":"
      };
    }
  }

  const exact = matchHeadingPart(raw);
  if (exact && (raw.length <= 100 || isUppercaseHeading(raw))) {
    return { key: exact.key, alias: exact.alias, headingText: raw, inlineContent: "", delimiter: "" };
  }
  return null;
}

function headingMarkers(text = "") {
  const raw = String(text || "");
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const markers = [];

  ORDERED_ALIASES.forEach((entry) => {
    let offset = 0;
    while ((offset = normalized.indexOf(entry.normalized, offset)) >= 0) {
      const before = offset === 0 ? "" : normalized[offset - 1];
      const afterIndex = offset + entry.normalized.length;
      const after = normalized.slice(afterIndex).match(/^\s*/)?.[0] || "";
      const delimiterIndex = afterIndex + after.length;
      const hasColon = /[:：]/.test(raw[delimiterIndex] || "");
      const atBoundary = offset === 0 || /[\s|.)-]/.test(before);
      const headingText = raw.slice(offset, afterIndex);
      const looksLikeTitle = isUppercaseHeading(headingText) || offset === 0;
      if (atBoundary && hasColon && looksLikeTitle) {
        markers.push({
          ...entry,
          start: offset,
          contentStart: delimiterIndex + 1,
          headingText
        });
      }
      offset = afterIndex || offset + 1;
    }
  });

  return markers
    .sort((a, b) => a.start - b.start || b.normalized.length - a.normalized.length)
    .filter((marker, index, all) => index === 0 || marker.start >= all[index - 1].contentStart);
}

function flattenedLines(blocks = []) {
  return flattenNormalizedBlocks(blocks).flatMap((block, flattenedIndex) =>
    String(block.text || "").split(/\r?\n/).map((text, lineIndex) => ({
      text: text.trim(),
      source: block.source || {},
      position: flattenedIndex,
      lineIndex
    })).filter((line) => line.text)
  );
}

function appendSection(secciones, key, value = "") {
  const clean = String(value || "").trim();
  if (!key || !clean) return;
  secciones[key] = [secciones[key], clean].filter(Boolean).join("\n");
}

function splitPlanAndMedications(secciones) {
  if (!secciones.plan) return;
  const marker = /(?:^|\n|\s)6\s*[.)-]+\s*medicamentos\b/i.exec(secciones.plan);
  if (!marker) return;
  const markerText = marker[0];
  const contentStart = marker.index + markerText.length;
  const medicationText = secciones.plan.slice(contentStart).trim();
  secciones.plan = secciones.plan.slice(0, marker.index).trim();
  if (medicationText) secciones.medicamentos = [secciones.medicamentos, medicationText].filter(Boolean).join("\n");
}

function clampMentalExam(secciones, encabezados, lines, noteSegment = {}) {
  const mentalHeading = encabezados.find((heading) => heading.key === "examenMental");
  if (!mentalHeading || !secciones.examenMental) return;
  const mentalStartPosition = mentalHeading.position ?? -1;
  let boundary = null;
  for (const line of lines) {
    if ((line.position ?? -1) < mentalStartPosition) continue;
    const match = findFirstBoundaryInsideText(line.text, MENTAL_EXAM_BOUNDARY_ALIASES);
    if (match) {
      boundary = { ...match, line };
      break;
    }
  }
  if (!boundary) return;
  const before = secciones.examenMental;
  const inlineBoundary = findFirstBoundaryInsideText(before, MENTAL_EXAM_BOUNDARY_ALIASES);
  if (!inlineBoundary) return;
  secciones.examenMental = before.slice(0, inlineBoundary.start).trim();
  const trace = {
    noteId: noteSegment.id || "",
    startBlock: mentalHeading.start ?? null,
    endBlock: boundary.line.source?.blockIndex ?? boundary.line.position ?? null,
    matchedBoundary: boundary.alias,
    length: secciones.examenMental.length
  };
  console.info("[patient-transfer] mental-exam:boundary-found", trace);
  return trace;
}

const DESTINATION_FOOTER_BOUNDARIES = Object.freeze([
  { pattern: /(?:^|\n)\s*(?:dr\.|dra\.|m[eé]dico adscrito|m[eé]dica residente)(?=\s|$)/i },
  { pattern: /(?:^|\n)\s*(?:c[eé]d\.?|c[eé]dula|firma|nombre,?\s*firma\s+y\s*c[eé]dula)(?=\s|$)/i },
  { pattern: /(?:^|\n)\s*(?:secretar[ií]a de salud|comisi[oó]n nacional|hospital psiqui[aá]trico|conasama|p[aá]gina siguiente|pie institucional)(?=\s|$)/i }
]);

function clampDestination(secciones) {
  const source = String(secciones.destino || "").trim();
  if (!source) return;
  const boundary = DESTINATION_FOOTER_BOUNDARIES
    .map((item) => ({ ...item, match: item.pattern.exec(source) }))
    .filter((item) => item.match)
    .sort((left, right) => left.match.index - right.match.index)[0];
  if (!boundary) return;
  const boundaryStart = boundary.match.index + (boundary.match[0].startsWith("\n") ? 1 : 0);
  secciones.destino = source.slice(0, boundaryStart).trim();
}

/** Separa cada segmento usando todos los encabezados, sin recurrir a rawText como respaldo. */
export function parseClinicalSections(blocks = [], { noteSegment = {} } = {}) {
  const secciones = Object.fromEntries(CLINICAL_SECTION_KEYS.map((key) => [key, ""]));
  const encabezados = [];
  const lines = flattenedLines(blocks);
  let currentKey = "";

  lines.forEach((line) => {
    const markers = headingMarkers(line.text);
    if (!markers.length) {
      const exact = detectClinicalHeading(line.text);
      if (exact) {
        const previous = encabezados.at(-1);
        if (previous) previous.end = line.source?.blockIndex ?? line.position;
        currentKey = exact.key;
        encabezados.push({
          key: exact.key,
          alias: exact.alias,
          heading: exact.headingText,
          position: line.position,
          start: line.source?.blockIndex ?? line.position,
          end: null,
          source: line.source || {},
          inlineContent: exact.inlineContent
        });
        appendSection(secciones, currentKey, exact.inlineContent);
        return;
      }
      appendSection(secciones, currentKey, line.text);
      return;
    }

    appendSection(secciones, currentKey, line.text.slice(0, markers[0].start));
    markers.forEach((marker, markerIndex) => {
      const previous = encabezados.at(-1);
      if (previous) previous.end = line.source?.blockIndex ?? line.position;
      currentKey = marker.key;
      const end = markers[markerIndex + 1]?.start ?? line.text.length;
      const inlineContent = line.text.slice(marker.contentStart, end).trim();
      encabezados.push({
        key: marker.key,
        alias: marker.alias,
        heading: marker.headingText,
        position: line.position,
        start: line.source?.blockIndex ?? line.position,
        end: null,
        source: line.source || {},
        inlineContent
      });
      appendSection(secciones, currentKey, inlineContent);
    });
  });

  if (encabezados.length) {
    encabezados.at(-1).end = Math.max(...lines.map((line) => line.source?.blockIndex ?? line.position), 0) + 1;
  }
  splitPlanAndMedications(secciones);
  clampDestination(secciones);
  console.info("[patient-transfer] mental-exam:start", {
    noteId: noteSegment.id || "",
    startBlock: encabezados.find((heading) => heading.key === "examenMental")?.start ?? null
  });
  const mentalBoundary = clampMentalExam(secciones, encabezados, lines, noteSegment);
  console.info("[patient-transfer] mental-exam:parsed", {
    noteId: noteSegment.id || "",
    startBlock: encabezados.find((heading) => heading.key === "examenMental")?.start ?? null,
    endBlock: mentalBoundary?.endBlock ?? encabezados.find((heading) => heading.key === "examenMental")?.end ?? null,
    matchedBoundary: mentalBoundary?.matchedBoundary || "",
    length: secciones.examenMental.length
  });
  const subjectiveExtraction = parseSubjectiveSection({
    noteSegment: { ...noteSegment, blocks },
    headings: encabezados,
    sectionAliases: CLINICAL_SECTION_ALIASES
  });
  secciones.subjetivo = subjectiveExtraction.text || "";

  encabezados.forEach((heading, index) => {
    console.info("[patient-transfer] clinical-heading", {
      heading: heading.heading,
      mappedSection: heading.key,
      start: heading.start,
      end: heading.end,
      nextHeading: encabezados[index + 1]?.heading || ""
    });
  });

  return {
    secciones,
    encontradas: [...new Set(encabezados.map((item) => item.key))],
    encabezados,
    subjectiveExtraction
  };
}
