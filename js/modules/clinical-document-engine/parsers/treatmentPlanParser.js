import { TREATMENT_PLAN_ALIASES, TREATMENT_PLAN_BOUNDARIES } from "../boundaries/boundaryAliases.js";
import { extractBoundedSection } from "../boundaries/boundaryEngine.js";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";
import { ClinicalEvidence } from "../core/ClinicalEvidence.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { parseMedicationStrength, splitMedicationItems } from "../normalizers/medicationNormalizer.js?v=20260818-clinical-extraction-v1";
import { parseMedicationCandidates } from "./medicationParser.js?v=20260818-clinical-extraction-v1";
import { clinicalImportLogger } from "../utils/logger.js";
import { MEDICAMENTOS_MAESTROS } from "../../../data/catalogoFarmacologicoUnificado.js?v=20260818-clinical-extraction-v1";

const VERSION = "1.0";
const MEDICATION_SUBSECTION_HEADING = /(?:^|\n)\s*(?:(?:\d+)\s*[.)-]\s*)?(?:medicamentos|medicaci[oó]n|tratamiento farmacol[oó]gico|f[aá]rmacos)\b[^\n]*/gi;
const NEXT_PRIMARY_PLAN_ITEM = /\n\s*\d+\s*[.)-]\s*(?=[A-ZÁÉÍÓÚÑ])/g;
const PRIORITY_RULES = [["urgent", /\burgente\b/i], ["immediate", /\binmediata?\b/i], ["continuous", /\bcontinua|estrecha|vigilancia continua\b/i], ["perShift", /por turno/i], ["daily", /\bdiaria?|cada d[ií]a\b/i], ["asNeeded", /\bprn\b|en caso necesario/i], ["discharge", /al egreso/i]];

export function splitTreatmentPlanItems(text = "") {
  const source = String(text || "").replace(/\r/g, "");
  const starts = [];
  const marker = /(?:^|[\n;])\s*(?:(?:\d+|[a-z])[.)-]|•|\*|-)(?=\s*[A-Za-zÁÉÍÓÚáéíóúÑñ])/gi;
  let match;
  while ((match = marker.exec(source))) starts.push(match.index + (match[0].startsWith("\n") || match[0].startsWith(";") ? 1 : 0));
  const inlineNumeric = /[ \t]+(\d+[.)-])(?=[ \t]*[A-ZÁÉÍÓÚÑ])/g;
  while ((match = inlineNumeric.exec(source))) starts.push(match.index + 1);
  if (!starts.length) return source.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const orderedStarts = [...new Set([0, ...starts])].sort((left, right) => left - right);
  const chunks = orderedStarts.map((start, index) => source.slice(start, orderedStarts[index + 1] ?? source.length).replace(/^\s*(?:(?:\d+|[a-z])[.)-]|\*|-)+\s*/i, "").trim()).filter(Boolean);
  return mergeMedicationPlanItems(chunks);
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length).replace(/^\s*(?:(?:\d+|[a-z])[.)-]|•|\*|-)+\s*/i, "").trim()).filter(Boolean);
}

function splitTreatmentPlanItemsDetailed(text = "") {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n");
  const items = [];
  let current = null;
  const flush = () => { if (current?.text.trim()) items.push(current); current = null; };
  lines.forEach((line, lineIndex) => {
    const raw = line.trim();
    if (!raw) return;
    const marker = raw.match(/^(?:(\d+)[.)-]|([a-z])[.)-]|[•*-])\s*(.*)$/i);
    if (marker) {
      flush();
      const level = marker[1] ? 0 : 1;
      current = { text: marker[3].trim(), level, lineIndex };
      return;
    }
    if (current) current.text = `${current.text}\n${raw}`;
    else current = { text: raw, level: 0, lineIndex };
  });
  flush();
  return items.length ? items : String(text || "").split(/\n+/).map((item, lineIndex) => ({ text: item.trim(), level: 0, lineIndex })).filter((item) => item.text);
}

export function isMeaningfulClinicalInstruction(text = "") {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "").trim();
  if (!normalized) return false;
  if (/^(?:[a-z]|\d+)[.)-]?$|^[()\[\]{}:;,.\-–—]+$/i.test(normalized)) return false;
  return /[\p{L}\p{N}]/u.test(normalized);
}

function groupHierarchicalPlanItems(items = []) {
  const grouped = [];
  items.forEach((item) => {
    if (!isMeaningfulClinicalInstruction(item.text)) return;
    const parent = grouped.at(-1);
    if (item.level > 0 && parent && (parent.children || /:\s*$/.test(parent.text))) {
      parent.children ||= [];
      parent.children.push({ text: item.text, lineIndex: item.lineIndex });
      parent.text = `${parent.text}\n• ${item.text}`;
      return;
    }
    grouped.push({ ...item });
  });
  return grouped;
}

function truncateAtNextPrimaryPlanItem(value = "") {
  const source = String(value || "");
  const nextPrimary = NEXT_PRIMARY_PLAN_ITEM.exec(source);
  NEXT_PRIMARY_PLAN_ITEM.lastIndex = 0;
  return source.slice(0, nextPrimary?.index ?? source.length).trim();
}

function hasCatalogMedicationName(item = "") {
  const source = normalizeClinicalComparisonText(item);
  return MEDICAMENTOS_MAESTROS.some((medication) => [
    medication.nombre,
    medication.genericName,
    ...(medication.sinonimos || []),
    ...(medication.marcas || [])
  ].filter(Boolean).some((name) => {
    const normalizedName = normalizeClinicalComparisonText(name);
    const index = source.indexOf(normalizedName);
    if (index < 0) return false;
    const word = /[\p{L}\p{N}]/u;
    return (!source[index - 1] || !word.test(source[index - 1]))
      && (!source[index + normalizedName.length] || !word.test(source[index + normalizedName.length]));
  }));
}

function looksLikeMedicationPrescription(item = "") {
  const source = normalizeClinicalComparisonText(item);
  const hasStrength = Boolean(parseMedicationStrength(item).rawStrength);
  const hasPresentation = /\b(?:tabletas?|comprimidos?|capsulas?|jarabe|solucion|suspension|polvo|gotas?|ampulas?|ampollas?|vial|parche|spray|inhalador|crema|unguento|supositorio)\b/.test(source);
  const hasAdministration = /\b(?:tomar|administrar|aplicar|via|veces?\s+al\s+dia|cada\s+\d+\s+horas?|a\s+las?\s+\d{1,2}(?::\d{2})?)\b/.test(source);
  return (hasStrength && hasPresentation)
    || (hasCatalogMedicationName(item) && (hasStrength || hasPresentation || hasAdministration));
}

function extractMedicationSubsections(text = "") {
  const source = String(text || "").replace(/\r/g, "");
  const headings = [];
  let match;
  while ((match = MEDICATION_SUBSECTION_HEADING.exec(source))) {
    headings.push({
      start: match.index,
      contentStart: match.index + match[0].length,
      heading: match[0].trim()
    });
  }
  const extracted = headings.map((heading, index) => {
    const nextHeadingStart = headings[index + 1]?.start ?? source.length;
    const remaining = source.slice(heading.contentStart, nextHeadingStart);
    const inlineSubitem = heading.heading.match(/\b[a-z][.)]\s+(.+)$/i)?.[1] || "";
    const inlineAfterColon = heading.heading.includes(":") ? heading.heading.slice(heading.heading.indexOf(":") + 1).trim() : "";
    const inlineValue = inlineSubitem || inlineAfterColon;
    const value = truncateAtNextPrimaryPlanItem([inlineValue, remaining].filter(Boolean).join("\n"));
    return { heading: heading.heading, value };
  }).filter((item) => item.value);

  if (extracted.length) return extracted;

  // El extractor de secciones puede consumir el encabezado "MEDICAMENTOS" y
  // entregar solamente su contenido. Recuperamos el subbloque desde el texto
  // completo del Plan sin volver a interpretar la prescripción.
  const prescriptionItems = splitMedicationItems(source, MEDICAMENTOS_MAESTROS)
    .map((item) => truncateAtNextPrimaryPlanItem(item))
    .filter(looksLikeMedicationPrescription);
  if (!prescriptionItems.length) return [];
  return [{ heading: "MEDICAMENTOS (encabezado consumido)", value: prescriptionItems.join("\n"), recovered: true }];
}

function mergeMedicationPlanItems(items = []) {
  return items.reduce((result, item) => {
    const previous = result.at(-1) || "";
    if (/^(?:medicamentos|medicaci[oó]n|tratamiento farmacol[oó]gico|f[aá]rmacos)\b/i.test(previous)
      && /\b(?:mg|g|mcg|tabletas?|c[aá]psulas?|jarabe|polvo|gotas?)\b/i.test(item)) {
      result[result.length - 1] = `${previous}\n${item}`;
    } else result.push(item);
    return result;
  }, []);
}

function classify(text = "") {
  const value = normalizeClinicalComparisonText(text);
  if (/dieta|ayuno|liquidos a libre demanda|restriccion hidrica/.test(value)) return "diet";
  if (/cuidados generales|cuidados de enfermeria|higiene|ulceras|cambios de posicion|supervisar ingesta/.test(value)) return "nursingCare";
  if (/signos vitales|balance hidrico|diuresis|excretas|vigilancia de ingesta|eventualidades|por turno/.test(value)) return "monitoring";
  if (/riesgo suicida|suicid/.test(value)) return "suicideRiskPrecautions";
  if (/autolesiv|self.?harm/.test(value)) return "selfHarmPrecautions";
  if (/riesgo de fuga|heteroagres|agitacion|delirium|abstinencia|vigilancia estrecha|acompanamiento permanente|brazalete amarillo|contencion/.test(value)) return "monitoring";
  if (/riesgo de ca[ií]da/.test(value)) return "fallRisk";
  if (/alergia|alergias negadas|no conocidas/.test(value)) return "allergies";
  if (/medicamentos|medicacion|tratamiento farmacologico|farmacos|esquema farmacologico/.test(value)) return "medications";
  if (/solicitar|bh\b|qs\b|pfh\b|ego\b|electrolitos|perfil tiroideo|niveles sericos/.test(value)) return "laboratoryOrders";
  if (/electrocardiograma|ekg|tac\b|rm\b|resonancia|radiografia|prueba de embarazo/.test(value)) return "imagingOrders";
  if (/interconsulta|valoracion por|seguimiento por/.test(value)) return "consultations";
  if (/procedimiento|curacion/.test(value)) return "procedures";
  if (/psicoterapia|intervencion en crisis|terapia familiar/.test(value)) return "psychotherapy";
  if (/psicoeducacion|prevencion de recaidas|plan de seguridad|higiene del sueno/.test(value)) return "psychoeducation";
  if (/continuar en observacion|hospitalizacion|egreso|referencia/.test(value)) return "dischargePlanning";
  if (/seguimiento|cita de control|consulta externa/.test(value)) return "followUp";
  return "otherInstruction";
}

function priority(text = "") { return PRIORITY_RULES.find(([, rule]) => rule.test(text))?.[0] || ""; }
function normalizedValue(type, text) {
  if (type === "fallRisk") return /\b(bajo|low)\b/i.test(text) ? "low" : /\b(alto|high)\b/i.test(text) ? "high" : normalizeClinicalComparisonText(text);
  if (type === "diet") return { dietType: text.replace(/^.*?dieta\s*/i, "").trim() };
  return normalizeClinicalComparisonText(text);
}

function createInstruction({ text, order, documentId, noteId, date, time, sourceHeading, block = null, startOffset = null, endOffset = null, explicit = true, children = [] }) {
  const instructionType = classify(children.length ? String(text).split(/\n/, 1)[0] : text);
  const confidence = evaluateConfidence({ table: false, explicitHeading: explicit, inferred: !explicit, freeText: !explicit });
  const evidence = new ClinicalEvidence({ documentId, block, offsetStart: startOffset, offsetEnd: endOffset, heading: sourceHeading || "PLAN TERAPÉUTICO", rawText: text, confidence });
  const candidate = new ClinicalCandidate({ id: `${documentId || "doc"}-plan-${noteId || "note"}-${order}`, type: "treatmentPlanInstruction", value: text, confidence, requiresReview: requiresReviewForConfidence(confidence), evidence: [evidence], metadata: { noteId, order, sourceHeading, parser: "midc.treatmentPlanParser", parserVersion: VERSION, sourceSpan: { start: startOffset, end: endOffset } } });
  Object.assign(candidate, { candidateType: "treatmentPlanInstruction", instructionType, text, value: text, children, normalizedValue: normalizedValue(instructionType, text), status: "detected", priority: priority(text), order, date, time, parserVersion: VERSION, evidence: [evidence], metadata: { ...candidate.metadata, sourceSection: "plan" } });
  return candidate;
}

export function parseTreatmentPlan({ text = "", documentId = "", noteId = "", date = "", time = "", sourceHeading = "PLAN TERAPÉUTICO", blockIndex = null } = {}) {
  clinicalImportLogger.info("treatmentPlanParser:start", JSON.stringify({ documentId, noteId, sourceLength: String(text || "").length }));
  const bounded = extractBoundedSection({ text, startAliases: TREATMENT_PLAN_ALIASES, boundaryAliases: TREATMENT_PLAN_BOUNDARIES });
  const source = bounded.start ? bounded.value : String(text || "").trim();
  const items = groupHierarchicalPlanItems(splitTreatmentPlanItemsDetailed(source));
  clinicalImportLogger.info("treatmentPlanParser:block", JSON.stringify({ documentId, noteId, bounded: Boolean(bounded.start), itemCount: items.length, boundary: bounded.boundary?.alias || "" }));
  const candidates = items.map((item, index) => createInstruction({ text: item.text, children: item.children || [], order: index + 1, documentId, noteId, date, time, sourceHeading, block: blockIndex, startOffset: item.lineIndex, endOffset: item.lineIndex + 1, explicit: Boolean(bounded.start) })).filter((candidate) => candidate && isMeaningfulClinicalInstruction(candidate.text));
  const medicationSubsections = extractMedicationSubsections(source);
  medicationSubsections.forEach((item) => clinicalImportLogger.info("treatmentPlanParser:medication-heading", JSON.stringify({ documentId, noteId, found: true, recovered: Boolean(item.recovered), heading: item.heading.slice(0, 80) })));
  const medicationText = medicationSubsections.map((item) => item.value).join("\n");
  const delegatedItems = medicationText
    ? splitMedicationItems(medicationText, MEDICAMENTOS_MAESTROS).map((item) => truncateAtNextPrimaryPlanItem(item)).filter(looksLikeMedicationPrescription)
    : [];
  clinicalImportLogger.info("treatmentPlanParser:medication-block", JSON.stringify({ documentId, noteId, subsectionCount: medicationSubsections.length, sourceLength: medicationText.length }));
  const delegatedMedicationText = delegatedItems.map((item, index) => `${index + 1}) ${item}`).join("\n");
  const medicationCandidates = delegatedItems.length ? parseMedicationCandidates({ text: delegatedMedicationText, section: "plan", documentId, noteId, date }) : [];
  const claimedMedicationNames = medicationCandidates.map((candidate) => normalizeClinicalComparisonText(candidate.medicationName)).filter(Boolean);
  const filteredCandidates = candidates.filter((candidate) => !claimedMedicationNames.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i").test(normalizeClinicalComparisonText(candidate.text))));
  clinicalImportLogger.info("treatmentPlanParser:delegated-medications", JSON.stringify({ documentId, noteId, inputCount: delegatedItems.length, count: medicationCandidates.length }));
  filteredCandidates.forEach((candidate) => clinicalImportLogger.info("treatmentPlanParser:item", JSON.stringify({ documentId, noteId, id: candidate.id, instructionType: candidate.instructionType, order: candidate.order })));
  clinicalImportLogger.info("treatmentPlanParser:finished", JSON.stringify({ documentId, noteId, count: filteredCandidates.length, medicationCount: medicationCandidates.length }));
  return { candidates: filteredCandidates, medicationCandidates, bounded };
}
