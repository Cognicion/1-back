import { flattenNormalizedBlocks } from "../docx/docxBlockNormalizer.js";
import { CLINICAL_SECTION_ALIASES, CLINICAL_SECTION_KEYS } from "./clinicalSectionConfig.js";

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
  const letters = String(value).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function matchHeadingPart(rawHeading = "") {
  const normalized = normalizeClinicalHeading(rawHeading);
  if (!normalized || normalized.length > 140) return null;
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
  if (exact && (raw.length <= 80 || isUppercaseHeading(raw))) {
    return { key: exact.key, alias: exact.alias, headingText: raw, inlineContent: "", delimiter: "" };
  }
  return null;
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

/** Separa por todos los encabezados delimitados y conserva texto y posiciones originales. */
export function parseClinicalSections(blocks = []) {
  const secciones = Object.fromEntries(CLINICAL_SECTION_KEYS.map((key) => [key, ""]));
  const encabezados = [];
  const lines = flattenedLines(blocks);
  let currentKey = "";

  lines.forEach((line) => {
    const heading = detectClinicalHeading(line.text);
    if (heading) {
      const previous = encabezados.at(-1);
      if (previous) previous.end = line.source?.blockIndex ?? line.position;
      currentKey = heading.key;
      encabezados.push({
        key: heading.key,
        alias: heading.alias,
        heading: heading.headingText,
        position: line.position,
        start: line.source?.blockIndex ?? line.position,
        end: null,
        source: line.source || {},
        inlineContent: heading.inlineContent
      });
      if (heading.inlineContent) {
        secciones[currentKey] = [secciones[currentKey], heading.inlineContent].filter(Boolean).join("\n");
      }
      return;
    }
    if (currentKey) secciones[currentKey] = [secciones[currentKey], line.text].filter(Boolean).join("\n");
  });

  if (encabezados.length) {
    encabezados.at(-1).end = Math.max(...lines.map((line) => line.source?.blockIndex ?? line.position), 0) + 1;
  }
  encabezados.forEach((heading, index) => {
    console.info("[patient-transfer] clinical-heading", {
      heading: heading.heading,
      mappedSection: heading.key,
      start: heading.start,
      end: heading.end,
      nextHeading: encabezados[index + 1]?.heading || ""
    });
  });

  return { secciones, encontradas: encabezados.map((item) => item.key), encabezados };
}
