import { MEDICAMENTOS_MAESTROS, normalizarNombreMedicamento } from "../../../data/catalogoFarmacologicoUnificado.js?v=20260811-ssri-interactions-v1";
import { clinicalImportLogger } from "../utils/logger.js";

const MATCH_STATUS = Object.freeze({
  EXACT: "exact",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NONE: "none"
});

function normalize(value = "") {
  return normalizarNombreMedicamento(value)
    .replace(/[-–—_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesFor(item = {}) {
  return [...new Set([
    item.nombre,
    item.genericName,
    item.nombreGenerico,
    ...(item.brandNames || []),
    ...(item.synonyms || [])
  ].map(normalize).filter(Boolean))];
}

function levenshtein(left = "", right = "") {
  const source = String(left);
  const target = String(right);
  if (source === target) return 0;
  if (!source.length) return target.length;
  if (!target.length) return source.length;
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    const current = [sourceIndex];
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      current[targetIndex] = Math.min(
        current[targetIndex - 1] + 1,
        previous[targetIndex] + 1,
        previous[targetIndex - 1] + (source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[target.length];
}

function scoreName(query, name) {
  if (!query || !name) return 0;
  if (query === name) return 100;
  const distance = levenshtein(query, name);
  return Math.max(0, Math.round((1 - distance / Math.max(query.length, name.length)) * 100));
}

function alternativeFor(item, query) {
  const entries = namesFor(item);
  const bestName = entries.sort((left, right) => scoreName(query, right) - scoreName(query, left))[0] || "";
  return {
    id: item.id || normalize(item.genericName || item.nombre),
    name: item.nombre || item.genericName || "",
    genericName: item.genericName || item.nombreGenerico || item.nombre || "",
    score: scoreName(query, bestName),
    matchedName: bestName,
    presentations: item.presentaciones || item.formulations || []
  };
}

function exactMethod(item = {}, query = "") {
  if (normalize(item.nombre) === query) return "name-exact";
  if (normalize(item.genericName || item.nombreGenerico) === query) return "generic-name-exact";
  if ([...(item.brandNames || []), ...(item.synonyms || [])].some((name) => normalize(name) === query)) return "alternate-name-exact";
  return "normalized-name";
}

function resolutionFor(alternatives = [], manualId = "", catalog = [], query = "") {
  const selected = manualId ? alternatives.find((item) => item.id === manualId) : alternatives[0];
  if (!selected) return { status: MATCH_STATUS.NONE, method: "none", selected: null };
  if (manualId) return { status: MATCH_STATUS.EXACT, method: "catalog-id", selected };
  if (selected.score === 100) return {
    status: MATCH_STATUS.EXACT,
    method: exactMethod((catalog || []).find((item) => (item.id || normalize(item.genericName || item.nombre)) === selected.id), query),
    selected
  };
  const nextScore = alternatives[1]?.score || 0;
  if (selected.score >= 90 && selected.score - nextScore >= 8) return { status: MATCH_STATUS.HIGH, method: "approximate-name", selected };
  if (selected.score >= 75) return { status: MATCH_STATUS.MEDIUM, method: "ambiguous-approximate-name", selected: null };
  if (selected.score >= 60) return { status: MATCH_STATUS.LOW, method: "weak-approximate-name", selected: null };
  return { status: MATCH_STATUS.NONE, method: "none", selected: null };
}

function matchesCatalogPresentation(candidate = {}, selected = null) {
  const presentation = normalize(candidate.presentation || "");
  const strength = candidate.strengthValue ?? candidate.strength;
  const strengthUnit = normalize(candidate.strengthUnit || "");
  if (!selected || (!presentation && (strength == null || !strengthUnit))) return null;
  const expected = [presentation, strength == null ? "" : String(strength), strengthUnit]
    .filter(Boolean)
    .flatMap((value) => String(value).split(" "))
    .filter((value) => value && value !== "de");
  const presentations = selected.presentations || selected.formulations || [];
  return presentations.some((entry) => {
    const text = normalize(entry?.texto || entry?.presentationDescription || entry);
    return expected.every((token) => text.includes(token));
  });
}

/**
 * Vincula una prescripción ya interpretada con el catálogo farmacológico.
 * No interpreta dosis, vía ni horario: esos campos pertenecen al parser MIDC.
 */
export function resolveMedicationAgainstCatalog(candidate = {}, catalog = MEDICAMENTOS_MAESTROS) {
  const medicationName = candidate.medicationName || candidate.genericName || "";
  const query = normalize(medicationName);
  const alternatives = (catalog || [])
    .map((item) => alternativeFor(item, query))
    .filter((item) => item.score >= 60 || item.id === candidate.catalogMedicationId)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const resolution = resolutionFor(alternatives, candidate.catalogMedicationId || "", catalog, query);
  const selected = resolution.selected;
  const catalogItem = selected ? (catalog || []).find((item) => (item.id || normalize(item.genericName || item.nombre)) === selected.id) : null;
  const catalogPresentationMatch = matchesCatalogPresentation(candidate, catalogItem);
  const result = {
    ...candidate,
    catalogMedicationId: selected?.id || null,
    catalogMatchStatus: resolution.status,
    catalogMatchScore: selected?.score || alternatives[0]?.score || 0,
    catalogMatchMethod: resolution.method,
    catalogAlternatives: alternatives,
    catalogPresentationMatch,
    genericName: selected?.genericName || candidate.genericName || medicationName,
    requiresCatalogReview: resolution.status === MATCH_STATUS.MEDIUM || resolution.status === MATCH_STATUS.LOW || resolution.status === MATCH_STATUS.NONE || catalogPresentationMatch === false,
    requiresReview: Boolean(candidate.requiresReview || resolution.status === MATCH_STATUS.MEDIUM || resolution.status === MATCH_STATUS.LOW || catalogPresentationMatch === false)
  };
  clinicalImportLogger.info("medicationCatalogResolver:match", JSON.stringify({
    noteId: candidate.metadata?.noteId || candidate.evidence?.[0]?.noteId || "",
    medicationName: medicationName.slice(0, 80),
    status: result.catalogMatchStatus,
    score: result.catalogMatchScore,
    matched: Boolean(result.catalogMedicationId)
  }));
  if (alternatives.length > 1 || result.catalogMatchStatus === MATCH_STATUS.MEDIUM) {
    clinicalImportLogger.info("medicationCatalogResolver:alternatives", JSON.stringify({
      medicationName: medicationName.slice(0, 80),
      count: alternatives.length,
      scores: alternatives.map((item) => item.score)
    }));
  }
  return result;
}

export function resolveMedicationCandidatesAgainstCatalog(candidates = [], catalog = MEDICAMENTOS_MAESTROS) {
  return (candidates || []).map((candidate) => resolveMedicationAgainstCatalog(candidate, catalog));
}

export { MATCH_STATUS as MEDICATION_CATALOG_MATCH_STATUS };
