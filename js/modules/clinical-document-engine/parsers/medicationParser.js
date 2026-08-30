import { MEDICAMENTOS_MAESTROS } from "../../../data/catalogoFarmacologicoUnificado.js?v=20260822-fda-cofepris-v1";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";
import { ClinicalEvidence } from "../core/ClinicalEvidence.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { normalizeMedicationName, normalizeMedicationPresentation, normalizeMedicationRoute, normalizeMedicationFrequency, parseClinicalQuantity, parseMedicationStrength, parseMedicationSchedules, splitMedicationItems } from "../normalizers/medicationNormalizer.js?v=20260830-medication-presentation-bulk-selection-v1";
import { clinicalImportLogger } from "../utils/logger.js";

const VERSION = "1.0";
const PARSER = "midc.medicationParser";
const MANUAL_NAMES = ["Yasmin", "Lactobacilos"];
const ALLERGY_CONTEXT = /\b(?:alergias?\s*(?::|a\b)|alergic[oa]\s+a\b|hipersensibilidades?\s*(?::|a\b))[^.\n;]{0,180}$/i;

function catalogNames(catalog = MEDICAMENTOS_MAESTROS) {
  return [...new Set([...catalog, ...MEDICAMENTOS_MAESTROS].flatMap((item) => [
    item.nombre,
    item.genericName,
    item.nombreGenerico,
    ...(item.sinonimos || item.synonyms || []),
    ...(item.marcas || item.brandNames || [])
  ]).concat(MANUAL_NAMES).filter(Boolean))].sort((a, b) => String(b).length - String(a).length);
}

function findMedicationName(item = "", catalog = MEDICAMENTOS_MAESTROS) {
  const names = catalogNames(catalog);
  const match = names.find((name) => new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(item));
  if (match) return match;
  const source = String(item).trim();
  const presentationStart = source.search(/\s+(?=tabletas?|comprimidos?|cápsulas?|capsulas?|jarabe|solución|solucion|suspensión|suspension|polvo|gotas?|ámpulas?|ampulas?|ampollas?|vial|parche|spray|inhalador|crema|ungüento|unguento|supositorio)\b/i);
  const nameBeforePresentation = presentationStart > 0 ? source.slice(0, presentationStart).trim() : "";
  if (/^[A-Za-zÁÉÍÓÚáéíóúÑñ-]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ-]+){0,2}$/.test(nameBeforePresentation)) return nameBeforePresentation;
  const manual = String(item).match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ-]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ-]+){0,2})(?=\s+(?:tabletas?|cápsulas?|capsulas?|jarabe|polvo|\d|tomar|administrar|vía|via)|$)/i);
  const value = manual?.[1]?.trim() || "";
  if (/^antecedente\s+de$/i.test(value)) return "";
  if (/^(?:cada|hora|horas)$/i.test(value)) return "";
  if (/^(?:tomar|administrar|aplicar|via|oral|se|se inicio|se inició|inicia|inicio|suspende|suspendio|suspendió|se suspendio|se suspendió|suspender|aumenta|disminuye|cambia|recibio|recibió|previamente|previo|antecedente)$/i.test(value)) return "";
  return value;
}

function medicationMentionIsAllergy(source = "", name = "", position = -1) {
  const mentionPosition = position >= 0
    ? position
    : normalizeClinicalComparisonText(source).indexOf(normalizeClinicalComparisonText(name));
  if (mentionPosition < 0) return false;
  const prefix = normalizeClinicalComparisonText(source).slice(Math.max(0, mentionPosition - 220), mentionPosition);
  return ALLERGY_CONTEXT.test(prefix);
}

function itemStartsInAllergyContext(source = "", item = "", name = "") {
  const comparableSource = normalizeClinicalComparisonText(source);
  const comparableItem = normalizeClinicalComparisonText(item);
  const comparableName = normalizeClinicalComparisonText(name);
  const itemPosition = comparableSource.indexOf(comparableItem);
  const namePosition = comparableItem.indexOf(comparableName);
  return medicationMentionIsAllergy(comparableSource, comparableName, itemPosition >= 0 && namePosition >= 0 ? itemPosition + namePosition : -1);
}

function hasMedicationMentionOutsideAllergy(source = "", name = "") {
  const comparableSource = normalizeClinicalComparisonText(source);
  const comparableName = normalizeClinicalComparisonText(name);
  let position = 0;
  let found = false;
  while ((position = comparableSource.indexOf(comparableName, position)) >= 0) {
    found = true;
    if (!medicationMentionIsAllergy(comparableSource, comparableName, position)) return true;
    position += comparableName.length;
  }
  return !found;
}

function actionFromText(text = "") {
  const value = normalizeClinicalComparisonText(text);
  if (/cambia\s+presentacion/.test(value)) return "Cambia presentación";
  if (/\b(?:suspende|suspendio|suspendió|suspender|suspendido)\b/.test(value)) return "Suspende";
  if (/\b(?:inicia|inicio|iniciar)\b/.test(value)) return "Inicia";
  if (/\b(?:aumenta|aumentar|aumento)\b/.test(value)) return "Aumenta";
  if (/\b(?:disminuye|disminuir|disminuyo|reduce)\b/.test(value)) return "Disminuye";
  if (/\b(?:antecedente|recibio|previamente|previo|manejo\s+a\s+base|en\s+\d{4})\b/.test(value)) return "Antecedente";
  return "Continúa";
}

export function medicationCandidateCompleteness(candidate = {}) {
  const fields = [
    candidate.medicationName,
    candidate.presentation,
    candidate.strength,
    candidate.strengthUnit,
    candidate.administrationQuantity,
    candidate.administrationUnit,
    candidate.route,
    candidate.frequency,
    Array.isArray(candidate.schedule) && candidate.schedule.length ? candidate.schedule : null
  ];
  return fields.filter((value) => value !== null && value !== undefined && value !== "").length;
}

function comparableRegimenValue(value = "") {
  return normalizeClinicalComparisonText(value).replace(/\s+/g, " ").trim();
}

function candidateMedicationIdentity(candidate = {}) {
  return comparableRegimenValue(candidate.normalizedMedicationName || candidate.medicationName || candidate.genericName);
}

function candidateActionIdentity(candidate = {}) {
  return comparableRegimenValue(candidate.action || candidate.status || candidate.statusSuggestion || "Continúa") || "continua";
}

function candidateEvidenceText(candidate = {}) {
  return comparableRegimenValue(
    candidate.metadata?.rawMedicationText
    || candidate.rawMedicationText
    || candidate.sourceText
    || candidate.evidence?.[0]?.rawText
    || ""
  );
}

function candidateMedicationDetailEvidence(candidate = {}) {
  const evidence = candidateEvidenceText(candidate);
  const medication = candidateMedicationIdentity(candidate);
  const index = medication ? evidence.indexOf(medication) : -1;
  return index >= 0 ? evidence.slice(index, index + 96) : evidence;
}

function candidateFrequencyIdentity(candidate = {}) {
  return comparableRegimenValue(candidate.frequency || normalizeMedicationFrequency(candidate.frequencyRaw || "").key);
}

function candidateScheduleIdentity(candidate = {}) {
  const schedule = Array.isArray(candidate.schedule) ? candidate.schedule : [];
  return schedule
    .map((item) => [
      comparableRegimenValue(item.time || ""),
      comparableRegimenValue(item.quantity ?? ""),
      comparableRegimenValue(item.unit || item.administrationUnit || "")
    ].join("|"))
    .sort()
    .join(";");
}

function candidateRegimen(candidate = {}) {
  return {
    presentation: comparableRegimenValue(candidate.presentation || ""),
    strength: comparableRegimenValue(candidate.strength ?? candidate.strengthValue ?? candidate.dose ?? ""),
    strengthUnit: comparableRegimenValue(candidate.strengthUnit || candidate.doseUnit || ""),
    strengthPerValue: comparableRegimenValue(candidate.strengthPerValue ?? ""),
    strengthPerUnit: comparableRegimenValue(candidate.strengthPerUnit || ""),
    route: comparableRegimenValue(candidate.route || ""),
    frequency: candidateFrequencyIdentity(candidate),
    schedule: candidateScheduleIdentity(candidate)
  };
}

function regimensConflict(left = {}, right = {}) {
  const leftRegimen = candidateRegimen(left);
  const rightRegimen = candidateRegimen(right);
  return Object.keys(leftRegimen).some((key) =>
    leftRegimen[key] && rightRegimen[key] && leftRegimen[key] !== rightRegimen[key]
  );
}

function evidenceIsSamePrescription(left = {}, right = {}) {
  const leftEvidence = candidateEvidenceText(left);
  const rightEvidence = candidateEvidenceText(right);
  if (!leftEvidence || !rightEvidence) return false;
  if (leftEvidence === rightEvidence) return true;
  const shortest = leftEvidence.length <= rightEvidence.length ? leftEvidence : rightEvidence;
  const longest = leftEvidence.length <= rightEvidence.length ? rightEvidence : leftEvidence;
  return shortest.length >= candidateMedicationIdentity(left).length + 6 && longest.includes(shortest);
}

function sourceSectionPriority(candidate = {}) {
  const section = comparableRegimenValue(candidate.metadata?.sourceSection || candidate.sourceSection || "");
  if (section === "medicamentos") return 3;
  if (section === "tratamiento") return 2;
  if (section === "plan") return 1;
  return 0;
}

function candidateEvidenceSupport(candidate = {}) {
  const detail = candidateMedicationDetailEvidence(candidate);
  const presentation = comparableRegimenValue(candidate.presentation || "");
  const route = comparableRegimenValue(candidate.route || "");
  let score = 0;
  if (presentation && detail.includes(presentation)) score += 4;
  if (route && new RegExp(`\\b${route}\\b`, "i").test(detail)) score += 2;
  if (candidateFrequencyIdentity(candidate) && detail) score += 1;
  return score;
}

function preferredMedicationCandidate(left = {}, right = {}) {
  const leftRank = candidateEvidenceSupport(left) * 10 + medicationCandidateCompleteness(left) + sourceSectionPriority(left);
  const rightRank = candidateEvidenceSupport(right) * 10 + medicationCandidateCompleteness(right) + sourceSectionPriority(right);
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;
  return candidateEvidenceText(left).length >= candidateEvidenceText(right).length ? left : right;
}

function mergeDuplicateMedicationCandidates(left = {}, right = {}) {
  const preferred = preferredMedicationCandidate(left, right);
  const fallback = preferred === left ? right : left;
  const merged = {
    ...fallback,
    ...preferred,
    metadata: {
      ...(fallback.metadata || {}),
      ...(preferred.metadata || {}),
      collapsedMedicationCandidateCount: Number(fallback.metadata?.collapsedMedicationCandidateCount || 1)
        + Number(preferred.metadata?.collapsedMedicationCandidateCount || 1)
    },
    requiresReview: Boolean(preferred.requiresReview || fallback.requiresReview || regimensConflict(left, right))
  };
  ["presentation", "strength", "strengthValue", "strengthUnit", "strengthPerValue", "strengthPerUnit", "route", "frequency", "frequencyRaw", "administrationQuantity", "administrationUnit", "dose", "doseUnit"].forEach((field) => {
    if (merged[field] === null || merged[field] === undefined || merged[field] === "") {
      merged[field] = fallback[field];
    }
  });
  if (!Array.isArray(merged.schedule) || !merged.schedule.length) merged.schedule = fallback.schedule || [];
  return merged;
}

/**
 * Colapsa la misma prescripción detectada más de una vez por secciones
 * superpuestas o por un OCR que repite el inciso. Mantiene regímenes distintos
 * cuando hay evidencia independiente de una presentación, concentración, vía,
 * frecuencia u horario diferente.
 */
export function consolidateMedicationCandidates(candidates = []) {
  const consolidated = [];
  (candidates || []).forEach((candidate) => {
    const medication = candidateMedicationIdentity(candidate);
    const action = candidateActionIdentity(candidate);
    if (!medication) {
      consolidated.push(candidate);
      return;
    }
    const duplicateIndex = consolidated.findIndex((existing) =>
      candidateMedicationIdentity(existing) === medication
      && candidateActionIdentity(existing) === action
      && (evidenceIsSamePrescription(existing, candidate) || !regimensConflict(existing, candidate))
    );
    if (duplicateIndex < 0) consolidated.push(candidate);
    else consolidated[duplicateIndex] = mergeDuplicateMedicationCandidates(consolidated[duplicateIndex], candidate);
  });
  return consolidated;
}

function administrationFromText(text = "", schedule = []) {
  const match = normalizeClinicalComparisonText(text).match(/(?:tomar|administrar|aplicar)\s+(\d+(?:[.,]\d+)?|una|un|uno|dos|tres|½|¼|¾|\d+\/\d+)\s*(?:de\s+)?(tabletas?|capsulas?|comprimidos?|ampulas?|ampollas?|atomizaciones?|ml|mililitros|cucharadas?|cucharaditas?|gotas?)/i);
  if (match) return { quantity: parseClinicalQuantity(match[1]), unit: match[2].toLowerCase() };
  const first = schedule.find((item) => item.quantity != null);
  return { quantity: first?.quantity ?? null, unit: first?.unit || "" };
}

function createCandidate({ item, itemIndex, section, documentId, noteId, date, catalog }) {
  const medicationName = findMedicationName(item, catalog);
  if (!medicationName) return null;
  const nameIndex = normalizeClinicalComparisonText(item).indexOf(normalizeClinicalComparisonText(medicationName));
  const detail = nameIndex >= 0 ? item.slice(nameIndex) : item;
  const strength = parseMedicationStrength(detail);
  const schedule = parseMedicationSchedules(detail);
  const frequency = normalizeMedicationFrequency(detail.replace(/\b(1|una)\s+veces\b/i, "$1 vez"));
  const administration = administrationFromText(detail, schedule);
  const presentation = normalizeMedicationPresentation(detail);
  const route = normalizeMedicationRoute(detail);
  const action = actionFromText(item);
  const confidence = evaluateConfidence({
    explicitHeading: Boolean(section) && Boolean(strength.strength) && Boolean(route) && Boolean(frequency.key),
    inferred: Boolean(strength.strength),
    freeText: true
  });
  const candidate = new ClinicalCandidate({
    id: `${documentId || "doc"}-tx-${noteId || "note"}-${itemIndex}-${normalizeClinicalComparisonText(medicationName)}`,
    type: "medication",
    value: null,
    confidence,
    requiresReview: requiresReviewForConfidence(confidence),
    warnings: [],
    evidence: [new ClinicalEvidence({ documentId, block: null, heading: section, rawText: item, confidence })],
    metadata: { noteId, sourceSection: section, parser: PARSER, parserVersion: VERSION, frequencyRaw: frequency.text, sourceSpan: { start: null, end: null, itemIndex } }
  });
  Object.assign(candidate, {
    candidateType: "medication",
    medicationName,
    normalizedMedicationName: normalizeMedicationName(medicationName),
    presentation,
    strength: strength.strength,
    strengthUnit: strength.strengthUnit,
    strengthPerValue: strength.strengthPerValue,
    strengthPerUnit: strength.strengthPerUnit,
    route,
    frequency: frequency.key,
    frequencyRaw: frequency.text,
    administrationQuantity: administration.quantity,
    administrationUnit: administration.unit,
    schedule,
    action,
    status: action,
    date,
    parserVersion: VERSION,
    evidence: candidate.evidence,
    metadata: { ...candidate.metadata, rawMedicationText: item, sourceSpan: { ...candidate.metadata.sourceSpan, rawText: item } }
  });
  return candidate;
}

/** Parser nativo MIDC de medicamentos; una entidad estructurada por inciso. */
export function parseMedicationCandidates({ text = "", section = "tratamiento", documentId = "", noteId = "", date = "", medicationCatalog = MEDICAMENTOS_MAESTROS } = {}) {
  clinicalImportLogger.info("medicationParser:start", JSON.stringify({ documentId, noteId, section, sourceLength: String(text || "").length }));
  const items = splitMedicationItems(text, medicationCatalog);
  clinicalImportLogger.info("medicationParser:input-count", JSON.stringify({ documentId, noteId, count: items.length }));
  const candidates = items.filter((item) => !/\b(?:niega|sin\s+uso\s+de|no\s+usa|no\s+toma)\b/i.test(item)).map((item, itemIndex) => {
    const candidate = createCandidate({ item, itemIndex, section, documentId, noteId, date, catalog: medicationCatalog });
    if (candidate && itemStartsInAllergyContext(text, item, candidate.medicationName)) return null;
    if (candidate && new RegExp(`\\b(?:niega|sin\\s+uso\\s+de|no\\s+usa|no\\s+toma)\\b[^.]{0,80}\\b${candidate.medicationName.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(text)) return null;
    if (candidate) {
      const namePosition = normalizeClinicalComparisonText(text).indexOf(normalizeClinicalComparisonText(candidate.medicationName));
      const context = namePosition >= 0 ? normalizeClinicalComparisonText(text).slice(Math.max(0, namePosition - 70), namePosition + item.length) : item;
      const contextualAction = actionFromText(context);
      if (contextualAction !== "Continúa") { candidate.action = contextualAction; candidate.status = contextualAction; }
    }
    return candidate;
  }).filter(Boolean);
  catalogNames(medicationCatalog).forEach((name) => {
    if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(text)) return;
    if (!hasMedicationMentionOutsideAllergy(text, name)) return;
    const normalizedName = normalizeClinicalComparisonText(name);
    if (candidates.some((candidate) => {
      const existing = normalizeClinicalComparisonText(candidate.medicationName);
      const sameResolvedEntity = existing === normalizedName || existing.split(/\s+/).includes(normalizedName) || existing.startsWith(`${normalizedName} `);
      return sameResolvedEntity && medicationCandidateCompleteness(candidate) >= 1;
    })) return;
    if (new RegExp(`\\b(?:niega|sin\\s+uso\\s+de|no\\s+usa|no\\s+toma)\\b[^.]{0,80}\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(text)) return;
    const fallback = createCandidate({ item: name, itemIndex: candidates.length, section, documentId, noteId, date, catalog: medicationCatalog });
    if (fallback) {
      const position = normalizeClinicalComparisonText(text).indexOf(normalizeClinicalComparisonText(name));
      const context = position >= 0 ? normalizeClinicalComparisonText(text).slice(Math.max(0, position - 70), position + name.length) : name;
      fallback.action = actionFromText(context);
      fallback.status = fallback.action;
      candidates.push(fallback);
    }
  });
  const comparableText = normalizeClinicalComparisonText(text);
  const consolidatedCandidates = consolidateMedicationCandidates(candidates);
  consolidatedCandidates.sort((left, right) => {
    const leftPosition = comparableText.indexOf(normalizeClinicalComparisonText(left.medicationName));
    const rightPosition = comparableText.indexOf(normalizeClinicalComparisonText(right.medicationName));
    return leftPosition - rightPosition;
  });
  consolidatedCandidates.forEach((candidate) => clinicalImportLogger.info("medicationParser:item", JSON.stringify({ documentId, noteId, candidateId: candidate.id, medicationName: candidate.medicationName, confidence: candidate.confidence, schedulesCount: candidate.schedule.length })));
  clinicalImportLogger.info("medicationParser:output-count", JSON.stringify({ documentId, noteId, count: consolidatedCandidates.length, collapsed: Math.max(0, candidates.length - consolidatedCandidates.length) }));
  clinicalImportLogger.info("medicationParser:finished", JSON.stringify({ documentId, noteId, itemCount: items.length, candidateCount: consolidatedCandidates.length }));
  return consolidatedCandidates;
}

export function detectMedicationCandidates({ sections = {}, fullText = "", sourceBlocks = [], medicationCatalog = MEDICAMENTOS_MAESTROS, documentId = "", noteId = "", date = "" } = {}) {
  const sources = Object.entries(sections).filter(([section, value]) => /tratamiento|medicamentos|plan|subjetivo/.test(section) && String(value || "").trim());
  if (!sources.length && String(fullText || "").trim()) sources.push(["texto_completo", fullText]);
  const result = [];
  sources.forEach(([section, text]) => parseMedicationCandidates({ text, section, documentId, noteId, date, medicationCatalog }).forEach((candidate) => {
    result.push(candidate);
  }));
  void sourceBlocks;
  return consolidateMedicationCandidates(result);
}
