import { flattenNormalizedBlocks } from "../docx/docxBlockNormalizer.js";
import { CLINICAL_SECTION_ALIASES, CLINICAL_SECTION_KEYS, CORE_CLINICAL_SECTION_KEYS } from "./clinicalSectionConfig.js";
import { findFirstBoundary, findSectionStart, normalizeClinicalHeadingWithMap } from "./clinicalBoundaryEngine.js";
import { parseSubjectiveSection } from "./subjectiveSectionParser.js";

export const SECTION_RULES = CLINICAL_SECTION_ALIASES;

export function normalizeClinicalHeading(value = "") {
  return normalizeClinicalHeadingWithMap(value).text;
}

const ORDERED_ALIASES = Object.freeze(
  Object.entries(CLINICAL_SECTION_ALIASES)
    .flatMap(([key, aliases]) => aliases.map((alias) => ({
      key,
      alias,
      normalized: normalizeClinicalHeading(alias)
    })))
    .sort((a, b) => b.normalized.length - a.normalized.length)
);

const ALL_SECTION_ALIASES = Object.freeze(ORDERED_ALIASES.map(({ alias }) => alias));

export function classifyClinicalHeading(value = "") {
  const normalized = normalizeClinicalHeading(value);
  if (!normalized || normalized.length > 180) return null;
  return ORDERED_ALIASES.find((entry) => entry.normalized === normalized) || null;
}

/** Reconoce un título clínico al inicio del bloque y conserva contenido inline. */
export function detectClinicalHeading(text = "") {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const start = findSectionStart(raw, ALL_SECTION_ALIASES);
  if (!start) return null;
  const match = classifyClinicalHeading(start.alias);
  if (!match) return null;
  return {
    key: match.key,
    alias: match.alias,
    headingText: start.headingText,
    inlineContent: start.inlineContent,
    headingStart: start.headingStart,
    headingEnd: start.headingEnd,
    contentStart: start.contentStart,
    delimiter: start.delimiter
  };
}

/** Detector estructural público: exige vocabulario canónico y forma de título. */
export function isLikelySectionHeading(line = "") {
  const raw = String(line || "").trim();
  if (!raw || raw.length > 1500) return false;
  return Boolean(detectClinicalHeading(raw));
}

function boundaryContentStart(raw = "", boundary = {}) {
  const delimiterLength = String(boundary.delimiter || "").length;
  if (delimiterLength) return boundary.end + delimiterLength;
  const whitespace = raw.slice(boundary.end).match(/^\s*/u)?.[0] || "";
  return boundary.end + whitespace.length;
}

/** Detecta todos los límites reconocidos de una línea, no solo los de examen mental. */
function headingMarkers(text = "") {
  const raw = String(text || "");
  const markers = [];
  const leading = detectClinicalHeading(raw);
  let searchOffset = 0;

  if (leading) {
    markers.push({
      key: leading.key,
      alias: leading.alias,
      start: 0,
      headingEnd: leading.headingEnd,
      contentStart: leading.contentStart,
      headingText: leading.headingText,
      delimiter: leading.delimiter
    });
    searchOffset = Math.max(leading.contentStart, leading.headingEnd);
  }

  while (searchOffset < raw.length) {
    const boundary = findFirstBoundary(raw.slice(searchOffset), ALL_SECTION_ALIASES);
    if (!boundary) break;
    const absoluteStart = searchOffset + boundary.start;
    const absoluteEnd = searchOffset + boundary.end;
    const match = classifyClinicalHeading(boundary.alias);
    if (!match) {
      searchOffset = Math.max(absoluteEnd, searchOffset + 1);
      continue;
    }
    const localBoundary = { ...boundary, end: absoluteEnd };
    const contentStart = boundaryContentStart(raw, localBoundary);
    const overlapsPrevious = markers.some((marker) => absoluteStart < marker.headingEnd);
    if (!overlapsPrevious) {
      markers.push({
        key: match.key,
        alias: match.alias,
        start: absoluteStart,
        headingEnd: absoluteEnd,
        contentStart,
        headingText: raw.slice(absoluteStart, absoluteEnd).trim(),
        delimiter: boundary.delimiter || ""
      });
    }
    searchOffset = Math.max(contentStart, absoluteEnd, searchOffset + 1);
  }

  return markers.sort((left, right) => left.start - right.start || right.headingEnd - left.headingEnd);
}

function flattenedLines(blocks = []) {
  let ordinal = 0;
  return flattenNormalizedBlocks(blocks).flatMap((block, flattenedIndex) =>
    String(block.text || "").split(/\r?\n/).map((text, lineIndex) => ({
      text: text.trim(),
      source: block.source || {},
      position: flattenedIndex,
      lineIndex,
      ordinal: ordinal++
    })).filter((line) => line.text)
  );
}

function appendSection(secciones, sectionParts, key, value = "", line = {}) {
  const clean = String(value || "").trim();
  if (!key || !clean) return;
  secciones[key] = [secciones[key], clean].filter(Boolean).join("\n");
  sectionParts[key].push({
    text: clean,
    ordinal: line.ordinal ?? -1,
    position: line.position ?? -1,
    blockIndex: line.source?.blockIndex ?? line.position ?? -1,
    source: line.source || {}
  });
}

function joinParts(parts = []) {
  return parts.map((part) => part.text).filter(Boolean).join("\n").trim();
}

const ANALYSIS_LANGUAGE_SIGNALS = Object.freeze([
  /\bpor lo anterior\b/u,
  /\bse (?:considera|concluye|integra|plantea)\b/u,
  /\bcompatible con\b/u,
  /\bamerita\b/u,
  /\brequiere\b/u,
  /\bfactores? de riesgo\b/u,
  /\bimpresion diagnostica\b/u,
  /\bjuicio clinico\b/u
]);

function interpretiveLanguageScore(value = "") {
  const normalized = normalizeClinicalHeading(value);
  return ANALYSIS_LANGUAGE_SIGNALS.filter((pattern) => pattern.test(normalized)).length;
}

function groupPartsByBlock(parts = []) {
  const groups = [];
  parts.forEach((part) => {
    const identity = `${part.blockIndex}:${part.position}`;
    const current = groups.at(-1);
    if (!current || current.identity !== identity) groups.push({ identity, parts: [part] });
    else current.parts.push(part);
  });
  return groups;
}

/**
 * Inferencia deliberadamente conservadora: solo separa el último bloque entre
 * examen mental y diagnósticos/plan cuando existe contenido mental previo y al
 * menos dos señales interpretativas independientes.
 */
function inferContextualAnalysis({ secciones, sectionParts, encabezados, noteSegment = {} } = {}) {
  const keys = CORE_CLINICAL_SECTION_KEYS;
  if (encabezados.some((heading) => heading.key === keys.analysis)) return null;

  for (let mentalIndex = encabezados.length - 1; mentalIndex >= 0; mentalIndex -= 1) {
    const mentalHeading = encabezados[mentalIndex];
    if (mentalHeading.key !== keys.mentalExam) continue;
    const nextHeading = encabezados[mentalIndex + 1];
    if (!nextHeading || ![keys.diagnoses, keys.plan].includes(nextHeading.key)) continue;

    const mentalParts = sectionParts[keys.mentalExam].filter((part) =>
      part.ordinal >= mentalHeading.ordinal && part.ordinal < nextHeading.ordinal
    );
    const groups = groupPartsByBlock(mentalParts);
    if (groups.length < 2) continue;

    const candidateGroup = groups.at(-1);
    const previousGroup = groups.at(-2);
    if (!candidateGroup || candidateGroup.identity === previousGroup?.identity) continue;
    const candidateText = joinParts(candidateGroup.parts);
    if (!candidateText || candidateText.length > 800 || interpretiveLanguageScore(candidateText) < 2) continue;

    const candidateSet = new Set(candidateGroup.parts);
    sectionParts[keys.mentalExam] = sectionParts[keys.mentalExam].filter((part) => !candidateSet.has(part));
    sectionParts[keys.analysis].push(...candidateGroup.parts);
    secciones[keys.mentalExam] = joinParts(sectionParts[keys.mentalExam]);
    secciones[keys.analysis] = joinParts(sectionParts[keys.analysis]);

    const inference = {
      key: keys.analysis,
      detectionMethod: "contextual-inference",
      start: candidateGroup.parts[0]?.blockIndex ?? null,
      end: nextHeading.start ?? null,
      precedingSection: keys.mentalExam,
      followingSection: nextHeading.key,
      signalCount: interpretiveLanguageScore(candidateText)
    };
    console.info("[patient-transfer] clinical-section:context-inferred", {
      noteId: noteSegment.id || "",
      ...inference,
      length: candidateText.length
    });
    return inference;
  }
  return null;
}

function splitPlanAndMedications(secciones) {
  if (!secciones.plan) return;
  const marker = /(?:^|\n|\s)6\s*[.)-]+\s*medicamentos\b/i.exec(secciones.plan);
  if (!marker) return;
  const contentStart = marker.index + marker[0].length;
  const medicationText = secciones.plan.slice(contentStart).trim();
  secciones.plan = secciones.plan.slice(0, marker.index).trim();
  if (medicationText) secciones.medicamentos = [secciones.medicamentos, medicationText].filter(Boolean).join("\n");
}

const DESTINATION_FOOTER_BOUNDARIES = Object.freeze([
  { pattern: /(?:^|\n)\s*(?:dr\.|dra\.|m[eé]dico adscrito|m[eé]dica residente)(?=\s|$)/i },
  { pattern: /(?:^|\n)\s*(?:c[eé]d\.?|c[eé]dula|firma|nombre,?\s*firma\s+y\s+c[eé]dula)(?=\s|$)/i },
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

/** Separa cada segmento usando un único motor de headings y límites canónicos. */
export function parseClinicalSections(blocks = [], { noteSegment = {} } = {}) {
  const secciones = Object.fromEntries(CLINICAL_SECTION_KEYS.map((key) => [key, ""]));
  const sectionParts = Object.fromEntries(CLINICAL_SECTION_KEYS.map((key) => [key, []]));
  const encabezados = [];
  const lines = flattenedLines(blocks);
  let currentKey = "";

  lines.forEach((line) => {
    const markers = headingMarkers(line.text);
    if (!markers.length) {
      appendSection(secciones, sectionParts, currentKey, line.text, line);
      return;
    }

    appendSection(secciones, sectionParts, currentKey, line.text.slice(0, markers[0].start), line);
    markers.forEach((marker, markerIndex) => {
      const previous = encabezados.at(-1);
      if (previous) previous.end = line.source?.blockIndex ?? line.position;
      currentKey = marker.key;
      const nextMarkerStart = markers[markerIndex + 1]?.start ?? line.text.length;
      const inlineContent = line.text.slice(marker.contentStart, nextMarkerStart).trim();
      encabezados.push({
        key: marker.key,
        alias: marker.alias,
        heading: marker.headingText,
        position: line.position,
        ordinal: line.ordinal,
        start: line.source?.blockIndex ?? line.position,
        end: null,
        source: line.source || {},
        inlineContent,
        detectionMethod: "explicit-heading"
      });
      appendSection(secciones, sectionParts, currentKey, inlineContent, line);
    });
  });

  if (encabezados.length) {
    encabezados.at(-1).end = Math.max(...lines.map((line) => line.source?.blockIndex ?? line.position), 0) + 1;
  }

  const contextualInference = inferContextualAnalysis({ secciones, sectionParts, encabezados, noteSegment });
  splitPlanAndMedications(secciones);
  clampDestination(secciones);
  const subjectiveExtraction = parseSubjectiveSection({
    noteSegment: { ...noteSegment, blocks },
    headings: encabezados,
    sectionAliases: CLINICAL_SECTION_ALIASES
  });
  secciones.subjetivo = secciones.subjetivo || subjectiveExtraction.text || "";

  encabezados.forEach((heading, index) => {
    console.info("[patient-transfer] clinical-heading", {
      heading: heading.heading,
      mappedSection: heading.key,
      start: heading.start,
      end: heading.end,
      nextHeading: encabezados[index + 1]?.heading || ""
    });
  });

  const encontradas = [...new Set([
    ...encabezados.map((item) => item.key),
    ...(contextualInference ? [contextualInference.key] : [])
  ])];
  return {
    secciones,
    encontradas,
    encabezados,
    inferencias: contextualInference ? [contextualInference] : [],
    subjectiveExtraction
  };
}
