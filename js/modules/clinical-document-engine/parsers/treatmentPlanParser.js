import { TREATMENT_PLAN_ALIASES, TREATMENT_PLAN_BOUNDARIES } from "../boundaries/boundaryAliases.js";
import { extractBoundedSection } from "../boundaries/boundaryEngine.js";
import { ClinicalCandidate } from "../core/ClinicalCandidate.js";
import { ClinicalEvidence } from "../core/ClinicalEvidence.js";
import { evaluateConfidence, requiresReviewForConfidence } from "../confidence/confidenceEngine.js";
import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { parseMedicationCandidates } from "./medicationParser.js";
import { clinicalImportLogger } from "../utils/logger.js";

const VERSION = "1.0";
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
  const chunks = starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length).replace(/^\s*(?:(?:\d+|[a-z])[.)-]|\*|-)+\s*/i, "").trim()).filter(Boolean);
  return mergeMedicationPlanItems(chunks);
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length).replace(/^\s*(?:(?:\d+|[a-z])[.)-]|•|\*|-)+\s*/i, "").trim()).filter(Boolean);
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

function createInstruction({ text, order, documentId, noteId, date, time, sourceHeading, block = null, startOffset = null, endOffset = null, explicit = true }) {
  const instructionType = classify(text);
  const confidence = evaluateConfidence({ table: false, explicitHeading: explicit, inferred: !explicit, freeText: !explicit });
  const evidence = new ClinicalEvidence({ documentId, block, offsetStart: startOffset, offsetEnd: endOffset, heading: sourceHeading || "PLAN TERAPÉUTICO", rawText: text, confidence });
  const candidate = new ClinicalCandidate({ id: `${documentId || "doc"}-plan-${noteId || "note"}-${order}`, type: "treatmentPlanInstruction", value: text, confidence, requiresReview: requiresReviewForConfidence(confidence), evidence: [evidence], metadata: { noteId, order, sourceHeading, parser: "midc.treatmentPlanParser", parserVersion: VERSION } });
  Object.assign(candidate, { candidateType: "treatmentPlanInstruction", instructionType, text, value: text, normalizedValue: normalizedValue(instructionType, text), status: "detected", priority: priority(text), order, date, time, parserVersion: VERSION, evidence: [evidence], metadata: { ...candidate.metadata, sourceSection: "plan" } });
  return candidate;
}

export function parseTreatmentPlan({ text = "", documentId = "", noteId = "", date = "", time = "", sourceHeading = "PLAN TERAPÉUTICO", blockIndex = null } = {}) {
  clinicalImportLogger.info("treatmentPlanParser:start", JSON.stringify({ documentId, noteId, sourceLength: String(text || "").length }));
  const bounded = extractBoundedSection({ text, startAliases: TREATMENT_PLAN_ALIASES, boundaryAliases: TREATMENT_PLAN_BOUNDARIES });
  const source = bounded.start ? bounded.value : String(text || "").trim();
  const items = mergeMedicationPlanItems(splitTreatmentPlanItems(source));
  clinicalImportLogger.info("treatmentPlanParser:block", JSON.stringify({ documentId, noteId, bounded: Boolean(bounded.start), itemCount: items.length, boundary: bounded.boundary?.alias || "" }));
  const candidates = items.map((item, index) => createInstruction({ text: item, order: index + 1, documentId, noteId, date, time, sourceHeading, block: blockIndex, startOffset: null, endOffset: null, explicit: Boolean(bounded.start) })).filter(Boolean);
  const medicationText = candidates.filter((candidate) => candidate.instructionType === "medications").map((candidate) => candidate.text).join("\n");
  const medicationCandidates = medicationText ? parseMedicationCandidates({ text: medicationText, section: "plan", documentId, noteId, date }) : [];
  if (medicationCandidates.length) clinicalImportLogger.info("treatmentPlanParser:delegated-medications", JSON.stringify({ documentId, noteId, count: medicationCandidates.length }));
  candidates.forEach((candidate) => clinicalImportLogger.info("treatmentPlanParser:item", JSON.stringify({ documentId, noteId, id: candidate.id, instructionType: candidate.instructionType, order: candidate.order })));
  clinicalImportLogger.info("treatmentPlanParser:finished", JSON.stringify({ documentId, noteId, count: candidates.length, medicationCount: medicationCandidates.length }));
  return { candidates, medicationCandidates, bounded };
}
