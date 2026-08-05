function canonicalize(value = "") {
  return String(value || "").replace(/\u00a0/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function aliasesByLength(aliases = []) {
  return [...new Set(aliases)].filter(Boolean).map((alias) => ({ alias, value: canonicalize(alias) })).sort((a, b) => b.value.length - a.value.length);
}

export function findSectionStart(text = "", aliases = []) {
  const source = String(text || "");
  const normalized = canonicalize(source);
  for (const candidate of aliasesByLength(aliases)) {
    if (!normalized.startsWith(candidate.value)) continue;
    const next = normalized[candidate.value.length] || "";
    if (next && !/[\s:;|()\-]/.test(next)) continue;
    const start = source.search(new RegExp(candidate.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    const content = source.slice(Math.max(0, start) + candidate.alias.length).replace(/^\s*[:：]\s*/, "");
    return { alias: candidate.alias, start: Math.max(0, start), contentStart: source.length - content.length, inlineContent: content };
  }
  return null;
}

export function findFirstBoundary(text = "", aliases = []) {
  const source = String(text || "");
  const normalized = canonicalize(source);
  let best = null;
  for (const candidate of aliasesByLength(aliases)) {
    const index = normalized.indexOf(candidate.value);
    if (index < 0) continue;
    const before = normalized[index - 1] || "";
    const after = normalized[index + candidate.value.length] || "";
    if ((before && !/[\s.;:|()[\]\-]/.test(before)) || (after && !/[\s:;|()[\]\-]/.test(after))) continue;
    const start = source.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").indexOf(candidate.value);
    if (!best || start < best.start) best = { alias: candidate.alias, start: Math.max(0, start), end: Math.max(0, start) + candidate.alias.length };
  }
  return best;
}

export function extractBoundedSection({ text = "", startAliases = [], boundaryAliases = [] } = {}) {
  const start = findSectionStart(text, startAliases);
  if (!start) return { value: "", rawText: "", start: null, boundary: null, requiresReview: true };
  const boundary = findFirstBoundary(start.inlineContent, boundaryAliases);
  const value = (boundary ? start.inlineContent.slice(0, boundary.start) : start.inlineContent).trim();
  return { value, rawText: value, start, boundary, requiresReview: false };
}
