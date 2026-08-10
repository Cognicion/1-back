/**
 * Utilidades comunes para localizar encabezados y recortar secciones clínicas.
 * Cada carácter normalizado conserva su rango en el texto original para que los
 * límites nunca dependan de índices calculados sobre una cadena transformada.
 */

const HEADING_SEPARATOR = /[\s/\\.:;|,()[\]{}\-–—_]/u;
const LEADING_ENUMERATION = /^(?:\d{1,3}|[ivxlcdm]{1,8})\s+(?=[\p{L}\p{N}])/u;

/** Normaliza texto clínico y conserva un mapa de offsets hacia la fuente. */
export function normalizeClinicalHeadingWithMap(value = "", { stripEnumeration = true } = {}) {
  const source = String(value || "").replace(/\u00a0/g, " ");
  const characters = [];
  let pendingSeparator = null;

  const queueSeparator = (start, end) => {
    if (!characters.length) return;
    if (!pendingSeparator) pendingSeparator = { start, end };
    else pendingSeparator.end = end;
  };

  const flushSeparator = () => {
    if (!pendingSeparator || !characters.length || characters.at(-1)?.character === " ") {
      pendingSeparator = null;
      return;
    }
    characters.push({ character: " ", ...pendingSeparator });
    pendingSeparator = null;
  };

  for (let index = 0; index < source.length;) {
    const codePoint = source.codePointAt(index);
    const original = String.fromCodePoint(codePoint);
    const originalEnd = index + original.length;
    const normalized = original
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    for (const character of normalized) {
      if (HEADING_SEPARATOR.test(character)) {
        queueSeparator(index, originalEnd);
        continue;
      }
      flushSeparator();
      characters.push({ character, start: index, end: originalEnd });
    }
    index = originalEnd;
  }

  let mappedCharacters = characters;
  let text = mappedCharacters.map((item) => item.character).join("");
  if (stripEnumeration) {
    const enumeration = text.match(LEADING_ENUMERATION)?.[0] || "";
    if (enumeration) {
      mappedCharacters = mappedCharacters.slice(enumeration.length);
      text = mappedCharacters.map((item) => item.character).join("");
    }
  }

  return { source, text, characters: mappedCharacters };
}

function orderedAliases(aliases = []) {
  return [...new Set(aliases.filter(Boolean))]
    .map((alias) => ({
      alias,
      canonical: normalizeClinicalHeadingWithMap(alias, { stripEnumeration: false }).text
    }))
    .filter((item) => item.canonical)
    .sort((a, b) => b.canonical.length - a.canonical.length);
}

function isUppercaseHeading(value = "") {
  const letters = String(value || "").replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function delimiterAfter(source = "", end = 0) {
  return source.slice(end).match(/^\s*(?:(?:[:：])|(?:[.．\-–—]+(?=\s|$)))\s*/u)?.[0] || "";
}

function previousNonWhitespace(source = "", start = 0) {
  return source.slice(0, start).match(/\S(?=\s*$)/u)?.[0] || "";
}

/** Devuelve el primer alias estructural con offsets en el texto original. */
export function findFirstBoundary(value = "", aliases = []) {
  const normalized = normalizeClinicalHeadingWithMap(value, { stripEnumeration: false });
  let earliest = null;

  for (const candidate of orderedAliases(aliases)) {
    let searchFrom = 0;
    while (searchFrom < normalized.text.length) {
      const position = normalized.text.indexOf(candidate.canonical, searchFrom);
      if (position < 0) break;

      const previous = normalized.text[position - 1] || "";
      const next = normalized.text[position + candidate.canonical.length] || "";
      const validStart = position === 0 || previous === " ";
      const validEnd = !next || next === " ";
      const originalStart = normalized.characters[position]?.start ?? 0;
      const originalEnd = normalized.characters[position + candidate.canonical.length - 1]?.end ?? originalStart;
      const headingText = normalized.source.slice(originalStart, originalEnd).trim();
      const delimiter = delimiterAfter(normalized.source, originalEnd);
      const suffix = normalized.source.slice(originalEnd + delimiter.length);
      const atLineEnd = !suffix.trim();
      const uppercase = isUppercaseHeading(headingText);
      const previousCharacter = previousNonWhitespace(normalized.source, originalStart);
      const sentenceBoundary = !previousCharacter || /[.;:|()[\]\-–—]/u.test(previousCharacter);
      const structural = position === 0
        ? Boolean(delimiter) || atLineEnd || (uppercase && candidate.canonical.length >= 18)
        : uppercase && (Boolean(delimiter) || atLineEnd || (sentenceBoundary && candidate.canonical.length >= 8));

      if (validStart && validEnd && structural) {
        const match = {
          alias: candidate.alias,
          headingText,
          start: originalStart,
          end: originalEnd,
          delimiter
        };
        if (!earliest || originalStart < earliest.start) earliest = match;
        break;
      }
      searchFrom = position + 1;
    }
  }
  return earliest;
}

/** Localiza un encabezado al principio de una línea y conserva su contenido inline. */
export function findSectionStart(value = "", aliases = []) {
  const normalized = normalizeClinicalHeadingWithMap(value);
  for (const candidate of orderedAliases(aliases)) {
    if (!normalized.text.startsWith(candidate.canonical)) continue;
    const boundaryCharacter = normalized.text[candidate.canonical.length] || "";
    if (boundaryCharacter && boundaryCharacter !== " ") continue;

    const mappedStart = normalized.characters[0]?.start ?? 0;
    const mappedEnd = normalized.characters[candidate.canonical.length - 1]?.end ?? mappedStart;
    const matchedText = normalized.source.slice(0, mappedEnd).trim();
    let remainder = normalized.source.slice(mappedEnd);
    const delimiter = delimiterAfter(normalized.source, mappedEnd);
    if (delimiter) remainder = remainder.slice(delimiter.length);
    else if (remainder.trim()) continue;

    return {
      alias: candidate.alias,
      headingText: matchedText,
      inlineContent: remainder.trim(),
      headingStart: mappedStart,
      headingEnd: mappedEnd,
      contentStart: mappedEnd + delimiter.length,
      delimiter: delimiter ? delimiter.trim() || ":" : ""
    };
  }
  return null;
}

/** Recorta una sección entre su inicio y el primer límite posterior. */
export function extractBoundedSection({ text = "", startAliases = [], boundaryAliases = [] } = {}) {
  const start = findSectionStart(text, startAliases);
  if (!start) return { value: "", rawText: "", start, boundary: null, requiresReview: true };
  const inline = start.inlineContent || "";
  const boundary = findFirstBoundary(inline, boundaryAliases);
  const value = (boundary ? inline.slice(0, boundary.start) : inline).trim();
  return { value, rawText: value, start, boundary, requiresReview: false };
}
