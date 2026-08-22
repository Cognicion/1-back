import { calculateCorrectedQt, QTC_CALCULATION_VERSION } from "./qtcCalculator.js";

export const ECG_INTERPRETATION_VERSION = "1.0.0";

export const ECG_EVIDENCE_REFERENCES = Object.freeze([
  Object.freeze({
    evidenceId: "aha-ecg-standardization-part-i",
    title: "Estandarización e interpretación del ECG, parte I: tecnología y medición",
    organization: "AHA/ACCF/HRS",
    year: 2007,
    doi: "10.1016/j.jacc.2007.01.024",
    url: "https://pubmed.ncbi.nlm.nih.gov/17349896/"
  }),
  Object.freeze({
    evidenceId: "aha-ecg-standardization-part-iii",
    title: "Estandarización e interpretación del ECG, parte III: conducción intraventricular",
    organization: "AHA/ACCF/HRS",
    year: 2009,
    doi: "10.1161/CIRCULATIONAHA.108.191095",
    url: "https://pubmed.ncbi.nlm.nih.gov/19228822/"
  }),
  Object.freeze({
    evidenceId: "aha-ecg-standardization-part-iv",
    title: "Estandarización e interpretación del ECG, parte IV: ST, T, U y QT",
    organization: "AHA/ACCF/HRS",
    year: 2009,
    doi: "10.1161/CIRCULATIONAHA.108.191096",
    url: "https://pubmed.ncbi.nlm.nih.gov/19228821/"
  }),
  Object.freeze({
    evidenceId: "aha-torsade-prevention",
    title: "Prevención de torsade de pointes en el entorno hospitalario",
    organization: "AHA/ACCF",
    year: 2010,
    doi: "10.1161/CIRCULATIONAHA.109.192704",
    url: "https://pubmed.ncbi.nlm.nih.gov/20142454/"
  }),
  Object.freeze({
    evidenceId: "aha-drug-induced-arrhythmias",
    title: "Arritmias inducidas por medicamentos",
    organization: "AHA",
    year: 2020,
    doi: "10.1161/CIR.0000000000000905",
    url: "https://pubmed.ncbi.nlm.nih.gov/32929996/"
  }),
  Object.freeze({
    evidenceId: "fda-ich-e14-s7b",
    title: "Evaluación clínica y no clínica de prolongación QT/QTc y potencial proarrítmico",
    organization: "FDA / ICH",
    year: 2022,
    doi: "",
    url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e14-and-s7b-clinical-and-nonclinical-evaluation-qtqtc-interval-prolongation-and-proarrhythmic"
  })
]);

const ECG_RECORD_PATTERN = /\b(?:ecg|ekg|electrocardiogram(?:a|as|o|os|ico|ica|icos|icas)?)\b/i;
const IRREGULAR_RHYTHM_PATTERN = /\b(?:fibrilaci[oó]n auricular|flutter auricular|ritmo irregular|irregularmente irregular)\b/i;
const TEXT_FIELDS = Object.freeze(["resultado", "result", "resumen", "summary", "observaciones", "observations", "informe", "reporte", "interpretacion", "interpretación", "sourceText", "texto"]);
const DATE_FIELDS = Object.freeze(["fechaEstudio", "fecha", "date", "observedAt", "fechaResultado", "createdAt", "updatedAt", "fechaCreacion"]);
const SOURCE_LABEL_FIELDS = Object.freeze(["nombre", "name", "estudio", "tipoEstudio", "tipo", "type"]);

const MEASUREMENT_DEFINITIONS = Object.freeze({
  heartRate: Object.freeze({
    label: "Frecuencia cardiaca",
    unit: "lpm",
    aliases: Object.freeze(["frecuenciacardiaca", "frecuenciaventricular", "fc", "heartrate", "ventricularrate"]),
    minimum: 20,
    maximum: 300,
    textPattern: /(?:frecuencia\s+(?:card[ií]aca|ventricular)|\bFC\b|\bHR\b)\s*[:=]?\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:lpm|bpm)?/i
  }),
  prMs: Object.freeze({
    label: "Intervalo PR",
    unit: "ms",
    aliases: Object.freeze(["pr", "prms", "intervalopr", "duracionpr"]),
    minimum: 50,
    maximum: 500,
    textPattern: /(?:intervalo\s+)?\bPR\b\s*[:=]?\s*(\d{2,3}(?:[.,]\d+)?)\s*(ms|msec|s)?/i
  }),
  qrsMs: Object.freeze({
    label: "Duración QRS",
    unit: "ms",
    aliases: Object.freeze(["qrs", "qrsms", "duracionqrs", "intervaloqrs"]),
    minimum: 40,
    maximum: 300,
    textPattern: /(?:duraci[oó]n\s+)?\bQRS\b\s*[:=]?\s*(\d{2,3}(?:[.,]\d+)?)\s*(ms|msec|s)?/i
  }),
  qtMs: Object.freeze({
    label: "Intervalo QT",
    unit: "ms",
    aliases: Object.freeze(["qt", "qtms", "intervaloqt", "duracionqt"]),
    minimum: 200,
    maximum: 700,
    textPattern: /(?:intervalo\s+)?\bQT(?!c)\b\s*[:=]?\s*(\d{2,3}(?:[.,]\d+)?)\s*(ms|msec|s)?/i
  }),
  qtcMs: Object.freeze({
    label: "QTc reportado",
    unit: "ms",
    aliases: Object.freeze(["qtc", "qtcms", "qtcorregido", "intervaloqtc", "qtcfridericia", "qtcbazett"]),
    minimum: 200,
    maximum: 700,
    textPattern: /\bQTc(?:\s+(?:Bazett|Fridericia|Framingham|Hodges))?\b\s*[:=]?\s*(\d{2,3}(?:[.,]\d+)?)\s*(ms|msec|s)?/i
  }),
  qrsAxisDegrees: Object.freeze({
    label: "Eje QRS",
    unit: "°",
    aliases: Object.freeze(["eje", "ejeqrs", "qrsaxis", "axis"]),
    minimum: -180,
    maximum: 180,
    textPattern: /(?:eje(?:\s+el[eé]ctrico)?(?:\s+QRS)?|QRS\s+axis)\s*[:=]?\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:°|grados?)?/i
  })
});

const DIAGNOSIS_FACTOR_RULES = Object.freeze([
  Object.freeze({ pattern: /\b(?:arritmia|fibrilaci[oó]n auricular|flutter|taquicardia|bradicardia|bloqueo\s+(?:av|auriculoventricular|de rama)|qt\s+prolongado|s[ií]ndrome\s+de\s+qt\s+largo)\b/i, category: "Ritmo y conducción", relevance: "Puede modificar ritmo, frecuencia, conducción o la lectura del QT." }),
  Object.freeze({ pattern: /\b(?:insuficiencia\s+card[ií]aca|cardiomiopat[ií]a|cardiopat[ií]a|infarto|isquemia\s+mioc[aá]rdica|enfermedad\s+coronaria|valvulopat[ií]a)\b/i, category: "Enfermedad cardiaca", relevance: "El contexto cardiaco estructural o isquémico cambia la interpretación y la relevancia de los hallazgos." }),
  Object.freeze({ pattern: /\b(?:hipopotasemia|hipocalemia|hiperpotasemia|hipercalemia|hipomagnesemia|hipocalcemia|alteraci[oó]n\s+electrol[ií]tica)\b/i, category: "Electrolitos", relevance: "Las alteraciones de potasio, magnesio o calcio pueden modificar conducción y repolarización." }),
  Object.freeze({ pattern: /\b(?:enfermedad\s+renal|insuficiencia\s+renal|hepatopat[ií]a|insuficiencia\s+hep[aá]tica)\b/i, category: "Función renal o hepática", relevance: "Puede modificar electrolitos o exposición a fármacos con efectos electrocardiográficos." }),
  Object.freeze({ pattern: /\b(?:hipotiroidismo|hipertiroidismo|tirotoxicosis|hipotermia|fiebre)\b/i, category: "Estado sistémico", relevance: "Puede modificar frecuencia, ritmo, conducción o repolarización." }),
  Object.freeze({ pattern: /\b(?:hipertensi[oó]n arterial|diabetes mellitus|dislipidemia|obesidad)\b/i, category: "Contexto cardiovascular", relevance: "Es un modificador del contexto cardiovascular; no explica por sí solo un hallazgo del ECG." })
]);

const MEDICATION_EFFECTS = Object.freeze({
  qt: "Repolarización / QT",
  bradicardia: "Frecuencia baja / conducción",
  arritmia: "Ritmo",
  cardiovascular: "Tolerancia cardiovascular",
  presion: "Frecuencia o presión arterial",
  potasio: "Electrolitos relacionados con repolarización",
  potasio_bajo: "Electrolitos relacionados con repolarización"
});

const RELEVANT_MEDICATION_ALERT = /\b(?:qt|qtc|electrocard|arritm|bradicard|taquicard|bloqueo\s+av|conducci[oó]n|frecuencia\s+card[ií]aca|potasio|magnesio|torsad|cardiovascular)\b/i;
const LAB_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "potassium", label: "Potasio", pattern: /^(?:potasio|k\+?)$/i }),
  Object.freeze({ key: "magnesium", label: "Magnesio", pattern: /^(?:magnesio|mg\+?\+?)$/i }),
  Object.freeze({ key: "calcium", label: "Calcio", pattern: /^(?:calcio|ca\+?\+?|calcio\s+ionizado)$/i }),
  Object.freeze({ key: "creatinine", label: "Creatinina", pattern: /^creatinina$/i }),
  Object.freeze({ key: "egfr", label: "eGFR / TFG", pattern: /^(?:egfr|tfg|filtrado\s+glomerular)$/i }),
  Object.freeze({ key: "tsh", label: "TSH", pattern: /^tsh$/i })
]);

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizedKey(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function patientIdentityTerms(patient = {}) {
  const fullName = [patient.nombres, patient.apellidoPaterno, patient.apellidoMaterno].filter(Boolean).join(" ");
  return [
    patient.nombreCompleto,
    patient.displayName,
    fullName,
    patient.nombre,
    patient.apellidos,
    patient.apellidoPaterno,
    patient.apellidoMaterno
  ].map((item) => String(item || "").trim()).filter((item) => item.length >= 4);
}

function redactDirectIdentifiers(value, identityTerms = []) {
  let text = String(value || "");
  [...new Set(identityTerms)]
    .sort((a, b) => b.length - a.length)
    .forEach((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[paciente actual]");
    });
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[correo oculto]")
    .replace(/\b[A-Z]{4}\d{6}[A-Z0-9]{3}\b/gi, "[identificador oculto]")
    .replace(/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi, "[identificador oculto]")
    .replace(/\b(?:\+?\d[\s().-]*){8,}\b/g, "[teléfono oculto]");
}

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function valueToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const candidate = typeof value?.toDate === "function"
    ? value.toDate()
    : typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : value;
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstValue(record = {}, fields = []) {
  for (const field of fields) {
    if (record[field] !== undefined && record[field] !== null && String(record[field]).trim() !== "") return record[field];
  }
  return null;
}

function deepValues(value, depth = 0) {
  if (value === null || value === undefined || depth > 3) return [];
  if (["string", "number"].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.slice(0, 30).flatMap((item) => deepValues(item, depth + 1));
  if (typeof value !== "object") return [];
  return Object.entries(value)
    .filter(([key]) => !/^(?:id|uid|patientId|pacienteId|nombrePaciente|curp|rfc|telefono|correo|email)$/i.test(key))
    .flatMap(([, item]) => deepValues(item, depth + 1));
}

function recordText(record = {}) {
  return deepValues(record).join(" ").replace(/\s+/g, " ").trim();
}

function isEcgRecord(record = {}) {
  const identity = [firstValue(record, SOURCE_LABEL_FIELDS), record.clave, record.categoria, record.tipoEstudio, record.sourceText].filter(Boolean).join(" ");
  if (ECG_RECORD_PATTERN.test(identity)) return true;
  const fullText = recordText(record);
  return ECG_RECORD_PATTERN.test(fullText)
    && /\b(?:resultado|informe|ritmo|sinusal|anormal|normal|qtc?|qrs|intervalo|frecuencia\s+card[ií]aca)\b/i.test(fullText);
}

function findAliasedValue(value, aliases, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const [key, item] of Object.entries(value)) {
    if (aliases.includes(normalizedKey(key))) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const nestedValue = firstValue(item, ["value", "valor", "result", "resultado"]);
        if (nestedValue !== null) return nestedValue;
      }
      if (["string", "number"].includes(typeof item)) return item;
    }
  }
  for (const item of Object.values(value)) {
    if (item && typeof item === "object") {
      const nested = findAliasedValue(item, aliases, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function normalizeIntervalValue(rawValue, explicitUnit = "") {
  const number = finiteNumber(rawValue);
  if (number === null) return null;
  const unit = normalizeText(explicitUnit || String(rawValue).replace(/[\d.,\s-]/g, ""));
  if (number > 0 && number < 5 && /^(?:s|seg|sec|second)/.test(unit) && !/ms|msec/.test(unit)) return number * 1000;
  return number;
}

function measurementValue(record, report, definition) {
  const structured = findAliasedValue(record, definition.aliases);
  if (structured !== null) {
    const value = definition.unit === "ms" ? normalizeIntervalValue(structured) : finiteNumber(structured);
    if (value !== null && value >= definition.minimum && value <= definition.maximum) return { value, origin: "structured", confidence: 0.98 };
    return { value: null, origin: "invalid_structured", confidence: 0 };
  }
  const match = String(report || "").match(definition.textPattern);
  if (!match) return null;
  const value = definition.unit === "ms" ? normalizeIntervalValue(match[1], match[2]) : finiteNumber(match[1]);
  if (value === null || value < definition.minimum || value > definition.maximum) return { value: null, origin: "invalid_text", confidence: 0 };
  return { value, origin: "report_text", confidence: 0.82 };
}

function extractReport(record = {}, identityTerms = []) {
  const values = TEXT_FIELDS.flatMap((field) => {
    const value = record[field];
    if (typeof value === "string" && value.trim()) return [value.trim()];
    if (value && typeof value === "object") return deepValues(value);
    return [];
  });
  return redactDirectIdentifiers(
    [...new Set(values)].join(" · ").replace(/\s+/g, " ").trim(),
    identityTerms
  ).slice(0, 1200);
}

function extractRhythm(record, report) {
  const structured = findAliasedValue(record, ["ritmo", "rhythm", "ritmocardiaco"]);
  if (structured !== null && String(structured).trim()) return { value: String(structured).trim().slice(0, 120), origin: "structured", confidence: 0.98 };
  const source = String(report || "");
  const known = source.match(/\b(ritmo\s+sinusal|fibrilaci[oó]n\s+auricular|flutter\s+auricular|ritmo\s+irregular|ritmo\s+de\s+marcapasos)\b/i);
  if (known) return { value: known[1], origin: "report_text", confidence: 0.82 };
  const generic = source.match(/\britmo\s*[:=]\s*([^.;\n]{3,80})/i);
  return generic ? { value: generic[1].trim(), origin: "report_text", confidence: 0.72 } : null;
}

function studyDate(record = {}) {
  for (const field of DATE_FIELDS) {
    const value = valueToIso(record[field]);
    if (value) return value;
  }
  return null;
}

function studyLabel(record = {}, identityTerms = []) {
  return redactDirectIdentifiers(
    String(firstValue(record, SOURCE_LABEL_FIELDS) || "Electrocardiograma").trim(),
    identityTerms
  ).slice(0, 120);
}

function compactSource(record = {}, identityTerms = []) {
  return {
    label: studyLabel(record, identityTerms),
    date: studyDate(record),
    sourceType: "electrocardiogram_study"
  };
}

export function extractElectrocardiograms(records = [], { identityTerms = [] } = {}) {
  return (Array.isArray(records) ? records : [])
    .map((record, sourceIndex) => ({ record, sourceIndex }))
    .filter(({ record }) => isEcgRecord(record))
    .map(({ record, sourceIndex }) => {
      const report = extractReport(record, identityTerms);
      const source = compactSource(record, identityTerms);
      const measurementResults = Object.fromEntries(Object.entries(MEASUREMENT_DEFINITIONS).map(([key, definition]) => [key, measurementValue(record, report, definition)]));
      const measurements = Object.fromEntries(Object.entries(MEASUREMENT_DEFINITIONS).map(([key, definition]) => {
        const result = measurementResults[key];
        return [key, result?.value === null ? null : result ? { key, label: definition.label, unit: definition.unit, ...result, source } : null];
      }));
      return {
        source,
        sourceIndex,
        report,
        rhythm: extractRhythm(record, report),
        measurements,
        invalidMeasurementDetected: Object.values(measurementResults).some((item) => item?.origin?.startsWith("invalid"))
      };
    })
    .sort((a, b) => {
      const byDate = String(b.source.date || "").localeCompare(String(a.source.date || ""));
      return byDate || b.sourceIndex - a.sourceIndex;
    });
}

function calculateAge(patient = {}) {
  const direct = finiteNumber(patient.edad ?? patient.age);
  if (direct !== null && direct >= 0 && direct < 130) return direct;
  const birth = valueToIso(patient.fechaNacimiento || patient.nacimiento || patient.birthDate);
  if (!birth) return null;
  const date = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function registeredSex(patient = {}) {
  const value = normalizeText(patient.sexo || patient.genero || patient.registeredSex);
  if (/^(?:m|masculino|hombre|male)$/.test(value)) return "masculino";
  if (/^(?:f|femenino|mujer|female)$/.test(value)) return "femenino";
  return value ? "otro_o_no_clasificado" : "no_documentado";
}

function contextualDiagnoses(diagnoses = [], identityTerms = []) {
  const output = [];
  (Array.isArray(diagnoses) ? diagnoses : []).forEach((diagnosis) => {
    const label = redactDirectIdentifiers(
      String(diagnosis?.texto || diagnosis?.label || diagnosis?.nombre || diagnosis || "").replace(/\s+/g, " ").trim(),
      identityTerms
    );
    const code = String(diagnosis?.codigo || diagnosis?.codigoRelacionado || "").trim();
    if (!label) return;
    DIAGNOSIS_FACTOR_RULES.forEach((rule) => {
      if (!rule.pattern.test(label)) return;
      output.push({
        label: label.slice(0, 180),
        code: code.slice(0, 40),
        status: diagnosis?.estado || diagnosis?.status || "documentado",
        category: rule.category,
        relevance: rule.relevance,
        source: "diagnostico_estructurado"
      });
    });
  });
  const seen = new Set();
  return output.filter((item) => {
    const key = `${item.code ? normalizeText(item.code) : normalizeText(item.label)}|${item.category}|${item.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function medicationContext(assessment = {}) {
  const medications = (assessment.medicamentosNormalizados || []).flatMap((medication) => {
    const effects = Object.entries(medication.riesgos || {})
      .filter(([key, value]) => MEDICATION_EFFECTS[key] && Number(value) > 0)
      .map(([key]) => MEDICATION_EFFECTS[key]);
    if (!effects.length) return [];
    return [{
      medication: String(medication.nombresIngredientes?.join(" + ") || medication.textoOriginal || "Medicamento").slice(0, 160),
      possibleEffects: [...new Set(effects)],
      source: "motor_farmacologico_unificado",
      interpretation: "Señal contextual del catálogo farmacológico; no demuestra que el fármaco sea la causa del hallazgo."
    }];
  });
  const alerts = (assessment.alertas || []).filter((alert) => RELEVANT_MEDICATION_ALERT.test([
    alert.titulo,
    alert.categoria,
    alert.tipo,
    alert.mecanismo,
    alert.efecto,
    alert.recomendacion,
    ...(alert.parametrosVigilancia || [])
  ].filter(Boolean).join(" "))).map((alert) => ({
    title: String(alert.titulo || "Alerta farmacológica relacionada con ECG").slice(0, 180),
    severity: alert.severidad || "informativa",
    medications: (alert.medicamentos || []).slice(0, 8),
    effect: String(alert.efectoClinico || alert.efecto || "").slice(0, 500),
    professionalReview: String(alert.recomendacion || "").slice(0, 500),
    sources: (alert.fuentes || []).slice(0, 5),
    source: "motor_farmacologico_unificado"
  }));
  return {
    medications,
    alerts,
    coverage: assessment.cobertura || { total: 0, fuenteVerificada: 0, fuentePendiente: 0, sinReglaIngrediente: 0 },
    noSignalIsNotNoRisk: true
  };
}

function labName(record = {}) {
  return String(record.analito || record.analyte || record.nombre || record.name || record.estudio || "").replace(/\s+/g, " ").trim();
}

function labValue(record = {}) {
  return firstValue(record, ["valor", "value", "resultadoLaboratorio", "valorLaboratorio", "resultado", "result"]);
}

function parseReferenceRange(value) {
  const match = String(value || "").match(/(-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|a)\s*(-?\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const minimum = finiteNumber(match[1]);
  const maximum = finiteNumber(match[2]);
  return minimum !== null && maximum !== null && minimum <= maximum ? { minimum, maximum } : null;
}

function labStatus(record, value) {
  const explicit = normalizeText(record.estado || record.status || record.interpretacion || record.bandera || "");
  if (/\b(?:bajo|low|disminuid|hipo)\b/.test(explicit)) return "low";
  if (/\b(?:alto|high|elevad|hiper)\b/.test(explicit)) return "high";
  if (/\b(?:normal|en rango|dentro de rango)\b/.test(explicit)) return "within_recorded_range";
  const rangeText = record.rangoReferencia || record.referenceRange || record.rango || record.valoresReferencia || "";
  const range = parseReferenceRange(rangeText);
  const numeric = finiteNumber(value);
  if (!range || numeric === null) return "not_classified";
  if (numeric < range.minimum) return "low";
  if (numeric > range.maximum) return "high";
  return "within_recorded_range";
}

function relevantLaboratories(records = []) {
  const latest = new Map();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const name = labName(record);
    const normalizedName = normalizeText(name).replace(/\s+/g, " ");
    const definition = LAB_DEFINITIONS.find((item) => item.pattern.test(normalizedName));
    if (!definition) return;
    const value = labValue(record);
    if (value === null) return;
    const item = {
      key: definition.key,
      label: definition.label,
      value: String(value).slice(0, 80),
      numericValue: finiteNumber(value),
      unit: String(record.unidad || record.unit || "").slice(0, 40),
      referenceRange: String(record.rangoReferencia || record.referenceRange || record.rango || record.valoresReferencia || "").slice(0, 80),
      status: labStatus(record, value),
      date: studyDate(record),
      source: "laboratorio_estructurado",
      sourceIndex: index
    };
    const previous = latest.get(definition.key);
    if (!previous || String(item.date || "").localeCompare(String(previous.date || "")) > 0 || (!item.date && index > previous.sourceIndex)) latest.set(definition.key, item);
  });
  return [...latest.values()].map(({ sourceIndex, ...item }) => item);
}

function measurementList(study) {
  if (!study) return [];
  const measurements = Object.values(study.measurements || {}).filter(Boolean);
  if (study.rhythm) measurements.unshift({ key: "rhythm", label: "Ritmo reportado", unit: "", value: study.rhythm.value, origin: study.rhythm.origin, confidence: study.rhythm.confidence, source: study.source });
  return measurements;
}

function qtcThreshold(sex) {
  if (sex === "masculino") return 470;
  if (sex === "femenino") return 480;
  return null;
}

function finding(id, level, title, detail, basis, limitations = []) {
  return { id, level, title, detail, basis, limitations };
}

function interpretMeasurements({ study, age, sex, qtcCalculation }) {
  if (!study) return [];
  const findings = [];
  const values = study.measurements || {};
  const adultReferenceApplies = age !== null && age >= 16;
  const rhythm = study.rhythm?.value || "";
  const irregularRhythm = IRREGULAR_RHYTHM_PATTERN.test(rhythm) || IRREGULAR_RHYTHM_PATTERN.test(study.report);

  if (!adultReferenceApplies) {
    findings.push(finding(
      "adult-reference-not-applied",
      "informativo",
      "No se aplicaron intervalos de referencia de adulto",
      age === null ? "La edad no está disponible." : "El paciente es menor de 16 años.",
      "Los intervalos ECG dependen de la edad.",
      ["Se requiere una referencia pediátrica o etaria validada."]
    ));
  }

  if (adultReferenceApplies && values.heartRate) {
    if (values.heartRate.value < 60) findings.push(finding("heart-rate-low", "revisar", "Frecuencia registrada por debajo del intervalo adulto habitual", `${values.heartRate.value} lpm.`, "Frecuencia del ECG actual.", ["No diagnostica bradicardia sin confirmar ritmo, condiciones de registro y contexto clínico."]));
    if (values.heartRate.value > 100) findings.push(finding("heart-rate-high", "revisar", "Frecuencia registrada por encima del intervalo adulto habitual", `${values.heartRate.value} lpm.`, "Frecuencia del ECG actual.", ["No diagnostica taquicardia sin confirmar ritmo, condiciones de registro y contexto clínico."]));
  }
  if (adultReferenceApplies && values.prMs) {
    if (values.prMs.value < 120) findings.push(finding("pr-short", "revisar", "PR por debajo del intervalo adulto orientativo", `${values.prMs.value} ms.`, "PR medido o reportado.", ["La morfología de P y QRS no fue analizada."]));
    if (values.prMs.value > 200) findings.push(finding("pr-long", "revisar", "PR por encima del intervalo adulto orientativo", `${values.prMs.value} ms.`, "PR medido o reportado.", ["No establece por sí solo un diagnóstico de bloqueo auriculoventricular."]));
  }
  if (adultReferenceApplies && values.qrsMs?.value > 110) {
    findings.push(finding("qrs-wide", "revisar", "QRS mayor de 110 ms", `${values.qrsMs.value} ms.`, "Criterio de duración para adultos mayores de 16 años.", ["No permite clasificar bloqueo de rama sin analizar la morfología de las 12 derivaciones."]));
  }

  const qtcForReview = values.qtcMs?.value ?? qtcCalculation?.primaryValueMs ?? null;
  const qtcOrigin = values.qtcMs ? "QTc reportado" : qtcCalculation?.calculable ? "QTc Fridericia calculado" : "";
  const threshold = adultReferenceApplies ? qtcThreshold(sex) : null;
  if (qtcForReview !== null && adultReferenceApplies) {
    const wideQrsLimit = values.qrsMs?.value > 110 ? ["Un QRS ancho prolonga el QT total; la repolarización requiere valoración especializada adicional."] : [];
    if (qtcForReview >= 500) {
      findings.push(finding("qtc-500", "prioritario", "QTc igual o mayor de 500 ms: verificación prioritaria", `${qtcOrigin}: ${Math.round(qtcForReview)} ms.`, "Umbral asociado con QTc altamente anormal y mayor susceptibilidad a torsade de pointes.", ["Confirmar manualmente medición, ritmo, fórmula, fármacos y electrolitos.", ...wideQrsLimit]));
    } else if (threshold !== null && qtcForReview >= threshold) {
      findings.push(finding("qtc-prolonged", "revisar", "QTc igual o por encima del límite superior orientativo según sexo registrado", `${qtcOrigin}: ${Math.round(qtcForReview)} ms; referencia usada: ${threshold} ms.`, "Límite superior del percentil 99 citado por AHA/ACCF para población adulta pospuberal.", ["Un valor aislado no equivale a un diagnóstico ni predice por sí solo una arritmia.", ...wideQrsLimit]));
    }
  }
  if (values.qtcMs && qtcCalculation?.calculable && Math.abs(values.qtcMs.value - qtcCalculation.primaryValueMs) >= 30) {
    findings.push(finding("qtc-discordance", "revisar", "Discordancia entre QTc reportado y QTc Fridericia calculado", `Reportado: ${Math.round(values.qtcMs.value)} ms; Fridericia: ${Math.round(qtcCalculation.primaryValueMs)} ms.`, "Comparación de valores del mismo registro.", ["Verificar qué fórmula y qué latido utilizó el equipo; no se selecciona automáticamente uno como correcto."]));
  }
  if (irregularRhythm) {
    findings.push(finding("irregular-rhythm", "revisar", "Ritmo irregular documentado", rhythm || "El informe contiene un ritmo irregular.", "Texto o campo estructurado del informe.", ["Un QTc basado en un solo RR no es suficiente en ritmos irregulares; requiere medición apropiada de varios ciclos."]));
  }
  if (qtcCalculation?.warnings?.length) {
    findings.push(finding("qtc-formula-limits", "informativo", "Límites del cálculo QTc", qtcCalculation.warnings.join(" "), "Frecuencia cardiaca y comportamiento conocido de las fórmulas de corrección.", ["El resultado requiere correlación con el método y la medición del ECG original."]));
  }
  return findings;
}

function contextualFindings({ diagnoses, medications, laboratories }) {
  const findings = [];
  if (diagnoses.length) findings.push(finding("diagnosis-context", "informativo", "Diagnósticos o comorbilidades relevantes", `${diagnoses.length} elemento(s) estructurado(s) pueden modificar la interpretación o el contexto de riesgo.`, "Diagnósticos y comorbilidades del expediente.", ["La coexistencia no demuestra causalidad del hallazgo ECG."]));
  if (medications.medications.length || medications.alerts.length) findings.push(finding("medication-context", "revisar", "Fármacos con señales electrocardiográficas en la base actual", `${medications.medications.length} medicamento(s) y ${medications.alerts.length} alerta(s) contextual(es).`, "Motor farmacológico unificado de COGNICIÓN.", ["No atribuye automáticamente el hallazgo a un medicamento."]));
  const abnormalLabs = laboratories.filter((item) => ["low", "high"].includes(item.status));
  if (abnormalLabs.length) findings.push(finding("laboratory-context", "revisar", "Laboratorios fuera del rango documentado", abnormalLabs.map((item) => `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ""} (${item.status === "low" ? "bajo" : "alto"})`).join("; "), "Rango de referencia guardado con cada resultado.", ["Verificar fecha, unidad, muestra y rango del laboratorio antes de relacionarlo con el ECG."]));
  return findings;
}

function missingData({ study, qtcCalculation, laboratories, medications, age, sex }) {
  const missing = [];
  if (!study) return ["Electrocardiograma identificado con informe o mediciones estructuradas."];
  if (!study.rhythm) missing.push("Ritmo documentado.");
  if (!study.measurements.heartRate) missing.push("Frecuencia cardiaca del mismo ECG.");
  if (!study.measurements.prMs) missing.push("Intervalo PR.");
  if (!study.measurements.qrsMs) missing.push("Duración QRS.");
  if (!study.measurements.qtMs && !study.measurements.qtcMs) missing.push("QT o QTc.");
  if (study.measurements.qtMs && !study.measurements.qtcMs && !qtcCalculation?.calculable) missing.push("Datos suficientes para calcular QTc de forma trazable.");
  if (study.measurements.qtcMs) missing.push("Fórmula utilizada para el QTc reportado, si el equipo no la documentó.");
  if (age === null) missing.push("Edad para seleccionar referencias etarias.");
  if (sex === "no_documentado" || sex === "otro_o_no_clasificado") missing.push("Sexo registrado utilizable para umbrales QTc específicos, cuando corresponda.");
  const labKeys = new Set(laboratories.map((item) => item.key));
  if ((medications.medications.length || study.measurements.qtcMs) && !labKeys.has("potassium")) missing.push("Potasio reciente, si el contexto clínico lo requiere.");
  if ((medications.medications.length || study.measurements.qtcMs) && !labKeys.has("magnesium")) missing.push("Magnesio reciente, si el contexto clínico lo requiere.");
  return [...new Set(missing)];
}

export function buildPatientEcgInterpretation({ expediente = {}, diagnoses = [], medicationAssessment = {} } = {}) {
  const patient = expediente.paciente || {};
  const identityTerms = patientIdentityTerms(patient);
  const ecgStudies = extractElectrocardiograms(expediente.estudios || [], { identityTerms });
  const latestStudy = ecgStudies[0] || null;
  const age = calculateAge(patient);
  const sex = registeredSex(patient);
  const rhythmText = `${latestStudy?.rhythm?.value || ""} ${latestStudy?.report || ""}`;
  const irregularRhythm = IRREGULAR_RHYTHM_PATTERN.test(rhythmText);
  const qtMs = latestStudy?.measurements?.qtMs?.value ?? null;
  const heartRate = latestStudy?.measurements?.heartRate?.value ?? null;
  const qtcCalculation = qtMs !== null && heartRate !== null && !irregularRhythm
    ? calculateCorrectedQt({ qtMs, heartRate })
    : null;
  const diagnosisContext = contextualDiagnoses(diagnoses, identityTerms);
  const medications = medicationContext(medicationAssessment);
  const laboratories = relevantLaboratories(expediente.laboratorios || []);
  const measurements = measurementList(latestStudy);
  if (qtcCalculation?.calculable) {
    measurements.push({
      key: "qtcFridericiaCalculated",
      label: "QTc Fridericia calculado",
      unit: "ms",
      value: qtcCalculation.primaryValueMs,
      origin: "calculated",
      confidence: null,
      source: latestStudy.source,
      method: "Fridericia",
      calculationVersion: QTC_CALCULATION_VERSION
    });
  }
  const measurementFindings = interpretMeasurements({ study: latestStudy, age, sex, qtcCalculation });
  const contextFindings = contextualFindings({ diagnoses: diagnosisContext, medications, laboratories });
  const findings = [...measurementFindings, ...contextFindings];
  const status = !latestStudy
    ? "ecg_not_found"
    : measurements.length || latestStudy.report
      ? "available"
      : "insufficient_data";
  const limitations = [
    "COGNICIÓN no recibió ni analizó el trazado de 12 derivaciones; no puede valorar morfología de ondas, ST-T, ondas Q, bloqueos ni arritmias no documentadas en el informe.",
    "La interpretación automatizada es apoyo clínico y requiere confirmación por un profesional con el ECG original y el estado clínico.",
    "Los factores coexistentes y los fármacos son asociaciones contextuales; no se atribuye causalidad automática.",
    "No se generan decisiones de alta, hospitalización, suspensión farmacológica ni tratamiento."
  ];
  if (latestStudy?.invalidMeasurementDetected) limitations.push("Se descartó al menos un valor fuera del intervalo técnico admitido; revise el dato de origen.");
  if (irregularRhythm && qtMs !== null && heartRate !== null) limitations.push("No se calculó QTc desde un único RR porque el ritmo fue documentado como irregular.");

  return {
    status,
    generatedAt: new Date().toISOString(),
    interpretationVersion: ECG_INTERPRETATION_VERSION,
    calculationVersion: QTC_CALCULATION_VERSION,
    sourceCount: ecgStudies.length,
    latestSource: latestStudy?.source || null,
    reportExcerpt: latestStudy?.report ? latestStudy.report.slice(0, 600) : "",
    measurements,
    qtcCalculation,
    findings,
    context: {
      demographics: { age, registeredSex: sex, adultReferenceApplied: age !== null && age >= 16 },
      diagnoses: diagnosisContext,
      medications,
      laboratories
    },
    missingData: missingData({ study: latestStudy, qtcCalculation, laboratories, medications, age, sex }),
    dataQuality: {
      ecgSourceCount: ecgStudies.length,
      structuredOrParsedMeasurementCount: measurements.filter((item) => item.origin !== "calculated").length,
      reportAvailable: Boolean(latestStudy?.report),
      waveformAvailable: false,
      qtAndHeartRateFromSameRecord: Boolean(qtMs !== null && heartRate !== null),
      unknownIsNotNormal: true
    },
    references: ECG_EVIDENCE_REFERENCES,
    limitations,
    notice: "Interpretación contextual de apoyo clínico. No sustituye la lectura del ECG original ni el juicio profesional.",
    clinicalWritesPerformed: false,
    directIdentifiersIncluded: false
  };
}

export { ECG_RECORD_PATTERN, IRREGULAR_RHYTHM_PATTERN, MEASUREMENT_DEFINITIONS };
