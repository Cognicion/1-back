/**
 * Utilidades comunes para localizar encabezados y recortar secciones clínicas.
 * Conserva offsets sobre el texto original; no usa índices del texto normalizado
 * para cortar directamente la fuente.
 */

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
    if (pendingSpace && characters.length && characters.at(-1).character !== "/") characters.push({ character: " ", ...pendingSpace });
    pendingSpace = null;
    [...normalized].forEach((character) => characters.push({ character, start: index, end: originalEnd }));
    index = originalEnd;
  }
  return { source, text: characters.map((item) => item.character).join(""), characters };
}

function orderedAliases(aliases = []) {
  return [...new Set(aliases.filter(Boolean))]
    .map((alias) => ({ alias, canonical: canonicalizeWithMap(alias).text }))
    .filter((item) => item.canonical)
    .sort((a, b) => b.canonical.length - a.canonical.length);
}

function isUppercaseHeading(value = "") {
  const letters = String(value || "").replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/** Devuelve el primer alias con offset en el texto original. */
export function findFirstBoundary(value = "", aliases = []) {
  const normalized = canonicalizeWithMap(value);
  let earliest = null;
  for (const candidate of orderedAliases(aliases)) {
    let searchFrom = 0;
    while (searchFrom < normalized.text.length) {
      const position = normalized.text.indexOf(candidate.canonical, searchFrom);
      if (position < 0) break;
      const previous = normalized.text[position - 1] || "";
      const next = normalized.text[position + candidate.canonical.length] || "";
      const validStart = position === 0 || /[\s.;:|()[\]\-]/u.test(previous);
      const validEnd = !next || /[\s:;|()[\]\-]/u.test(next);
      const originalStart = normalized.characters[position]?.start ?? 0;
      const originalEnd = normalized.characters[position + candidate.canonical.length - 1]?.end ?? originalStart;
      const headingText = normalized.source.slice(originalStart, originalEnd).trim();
      const hasHeadingDelimiter = /^\s*[:：]/u.test(normalized.source.slice(originalEnd));
      if (validStart && validEnd && (isUppercaseHeading(headingText) || hasHeadingDelimiter)) {
        if (!earliest || originalStart < earliest.start) earliest = { alias: candidate.alias, headingText, start: originalStart, end: originalEnd };
        break;
      }
      searchFrom = position + 1;
    }
  }
  return earliest;
}

/** Localiza un encabezado al principio de una línea y conserva su contenido inline. */
export function findSectionStart(value = "", aliases = []) {
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
    return { alias: candidate.alias, headingText: matchedText, inlineContent: remainder.trim(), headingEnd: mappedEnd, delimiter: delimiter ? ":" : "" };
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
