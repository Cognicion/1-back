const {
  CLINICAL_FEATURE_PROFILE_VERSION,
  CLINICAL_PATTERN_MATRIX_CONFIG
} = require("./config");
const { VARIABLE_CATALOG } = require("./variableExtractor");
const { COLLECTIONS, valueToIso } = require("./contextBuilder");
const { positiveEvents, temporalSequencePairs } = require("./patternAnalyzer");

const NOTE_COLLECTIONS = new Set(["notasMedicas", "notas", "notasClinicas", "notasRapidas", "historiaClinica"]);
const BLOCKED_TEXT_KEYS = /^(id|uid|uuid|name|nombre|nombres|apellido|apellidos|telefono|tel|phone|email|correo|domicilio|direccion|direcci[oó]n|curp|rfc|patientid|pacienteid|pacienteuid|uidpaciente|expediente|numeroexpediente|foto|fotografia|path|ruta|url)$/i;
const BLOCKED_STRUCTURED_KEYS = /(id|uid|uuid|name|nombre|apellido|telefono|phone|contacto|email|correo|domicilio|direccion|curp|rfc|expediente|folio|fecha|date|time|timestamp|created|updated|token|session|ip|device|foto|archivo|documento|path|ruta|url|latitud|longitud)/i;
const COLLECTION_DOMAINS = Object.freeze({
  notasMedicas: "documentation",
  notas: "documentation",
  notasClinicas: "documentation",
  notasRapidas: "documentation",
  tratamientos: "treatment",
  estudios: "laboratories",
  escalasAplicadas: "scales",
  resultadosEscalas: "scales",
  laboratorios: "laboratories",
  signosVitales: "vitals",
  eventos: "events"
});

function normalizedText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function finiteNumber(value) {
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - center) ** 2), 0) / values.length);
}

function safeDate(value) {
  const iso = valueToIso(value);
  return iso ? new Date(iso) : null;
}

function monthBucket(value) {
  const date = safeDate(value);
  return date ? date.toISOString().slice(0, 7) : null;
}

function mapRegisteredSex(value) {
  const normalized = normalizedText(value);
  if (/^(f|femenino|mujer|female)$/.test(normalized)) return "female";
  if (/^(m|masculino|hombre|male)$/.test(normalized)) return "male";
  if (/no binar|nonbinary|no-binario|no binario/.test(normalized)) return "non_binary";
  if (/intersex|otro|other/.test(normalized)) return "other";
  return "unknown";
}

function mapEducation(value) {
  const normalized = normalizedText(value);
  if (!normalized) return "unknown";
  if (/sin escolar|ninguna|analfabet/.test(normalized)) return "none";
  if (/primaria|elemental/.test(normalized)) return "primary";
  if (/secundaria|bachiller|preparatoria|media superior/.test(normalized)) return "secondary";
  if (/doctorado|maestria|maestría|posgrado|especialidad/.test(normalized)) return "postgraduate";
  if (/universidad|universitaria|licenciatura|ingenieria|ingeniería|superior/.test(normalized)) return "higher";
  return "other";
}

function safeCategoricalValue(variableId, value) {
  if (variableId === "registered_sex") return mapRegisteredSex(value);
  if (variableId === "education") return mapEducation(value);
  return null;
}

function createFeature({
  featureId,
  canonicalName,
  domain,
  statisticalType,
  value,
  unit = null,
  observedAt = null,
  observationCount = 1,
  absenceIsZero = false
}) {
  if (!featureId || value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (!["number", "boolean", "string"].includes(typeof value)) return null;
  return {
    featureId,
    canonicalName: canonicalName || featureId,
    domain,
    datatype: typeof value,
    statisticalType,
    unit,
    value,
    observedAt: monthBucket(observedAt),
    observationCount,
    absenceIsZero,
    sourceType: "derived_deidentified",
    featureProfileVersion: CLINICAL_FEATURE_PROFILE_VERSION
  };
}

function addFeature(features, definition) {
  const feature = createFeature(definition);
  if (feature) features.set(feature.featureId, feature);
}

function lastByDate(items) {
  return [...items].sort((a, b) => String(a.observedAt || "").localeCompare(String(b.observedAt || ""))).at(-1) || null;
}

function addNumericSummary(features, variableId, definition, items) {
  const observations = items
    .map((item) => ({ value: finiteNumber(item.value), observedAt: item.observedAt }))
    .filter((item) => item.value !== null)
    .sort((a, b) => String(a.observedAt || "").localeCompare(String(b.observedAt || "")));
  if (!observations.length) return;
  const values = observations.map((item) => item.value);
  const base = { domain: definition.domain, statisticalType: "continuous", unit: definition.unit, observationCount: values.length };
  addFeature(features, { ...base, featureId: `${variableId}.latest`, canonicalName: `${definition.canonicalName}_ultimo`, value: observations.at(-1).value, observedAt: observations.at(-1).observedAt });
  addFeature(features, { ...base, featureId: `${variableId}.mean`, canonicalName: `${definition.canonicalName}_promedio`, value: mean(values), observedAt: observations.at(-1).observedAt });
  addFeature(features, { ...base, featureId: `${variableId}.range`, canonicalName: `${definition.canonicalName}_rango`, value: Math.max(...values) - Math.min(...values), observedAt: observations.at(-1).observedAt });
  if (observations.length > 1) {
    const firstTime = Date.parse(observations[0].observedAt);
    const lastTime = Date.parse(observations.at(-1).observedAt);
    const elapsedDays = (lastTime - firstTime) / 86400000;
    if (Number.isFinite(elapsedDays) && elapsedDays > 0) addFeature(features, {
      ...base,
      featureId: `${variableId}.change_per_day`,
      canonicalName: `${definition.canonicalName}_cambio_diario`,
      value: (observations.at(-1).value - observations[0].value) / elapsedDays,
      observedAt: observations.at(-1).observedAt
    });
  }
}

function addVariableFeatures(features, variables = []) {
  const grouped = new Map();
  variables.forEach((variable) => {
    if (!VARIABLE_CATALOG[variable.variableId]) return;
    if (!grouped.has(variable.variableId)) grouped.set(variable.variableId, []);
    grouped.get(variable.variableId).push(variable);
  });

  Object.entries(VARIABLE_CATALOG).forEach(([variableId, definition]) => {
    const items = grouped.get(variableId) || [];
    const observedAt = lastByDate(items)?.observedAt || null;
    addFeature(features, {
      featureId: `${variableId}.documented`,
      canonicalName: `${definition.canonicalName}_documentado`,
      domain: "documentation",
      statisticalType: "binary",
      value: items.length > 0,
      observedAt,
      observationCount: items.length,
      absenceIsZero: true
    });
    addFeature(features, {
      featureId: `${variableId}.observation_count`,
      canonicalName: `${definition.canonicalName}_observaciones`,
      domain: definition.domain,
      statisticalType: "count",
      value: items.length,
      observedAt,
      observationCount: items.length,
      absenceIsZero: true
    });
    if (!items.length) return;

    if (definition.statisticalType === "binary") {
      const latest = lastByDate(items);
      addFeature(features, {
        featureId: `${variableId}.ever_positive`,
        canonicalName: `${definition.canonicalName}_alguna_vez`,
        domain: definition.domain,
        statisticalType: "binary",
        value: items.some((item) => item.value === true),
        observedAt,
        observationCount: items.length
      });
      addFeature(features, {
        featureId: `${variableId}.latest`,
        canonicalName: `${definition.canonicalName}_ultimo`,
        domain: definition.domain,
        statisticalType: "binary",
        value: latest.value === true,
        observedAt: latest.observedAt,
        observationCount: items.length
      });
      return;
    }

    if (definition.statisticalType === "continuous" && items.some((item) => finiteNumber(item.value) !== null)) {
      addNumericSummary(features, variableId, definition, items);
      return;
    }

    const latest = lastByDate(items);
    const safeValue = safeCategoricalValue(variableId, latest.value);
    if (safeValue) addFeature(features, {
      featureId: `${variableId}.latest`,
      canonicalName: `${definition.canonicalName}_ultimo`,
      domain: definition.domain,
      statisticalType: "categorical",
      value: safeValue,
      observedAt: latest.observedAt,
      observationCount: items.length
    });
  });

  addDiagnosisCodeFeatures(features, grouped.get("diagnosis") || []);
  addVitalFeatures(features, grouped.get("vital_sign") || []);
  addTreatmentFeatures(features, grouped.get("treatment") || []);
}

function addDiagnosisCodeFeatures(features, diagnoses) {
  const codes = new Set(diagnoses.map((item) => String(item.value?.code || "").toUpperCase().trim()).filter((code) => /^[A-Z][0-9]{2}(?:\.[A-Z0-9]{1,4})?$/.test(code)));
  [...codes].sort().slice(0, 24).forEach((code) => addFeature(features, {
    featureId: `diagnosis.code.${code.replace(/\./g, "_")}`,
    canonicalName: `diagnostico_codigo_${code}`,
    domain: "diagnosis",
    statisticalType: "binary",
    value: true,
    observationCount: diagnoses.filter((item) => String(item.value?.code || "").toUpperCase().trim() === code).length,
    observedAt: lastByDate(diagnoses)?.observedAt || null,
    absenceIsZero: true
  }));
}

function addVitalFeatures(features, vitals) {
  const keys = Object.freeze({
    weight: ["peso", "kg"],
    height: ["talla", "cm"],
    bmi: ["imc", null],
    heartRate: ["frecuencia_cardiaca", "bpm"],
    temperature: ["temperatura", "celsius"],
    oxygenSaturation: ["saturacion_oxigeno", "%"]
  });
  Object.entries(keys).forEach(([key, [name, unit]]) => {
    const items = vitals.map((item) => ({ ...item, value: item.value?.[key] })).filter((item) => finiteNumber(item.value) !== null);
    addNumericSummary(features, `vital_sign.${key}`, { canonicalName: name, domain: "vitals", unit }, items);
  });
}

function addTreatmentFeatures(features, treatments) {
  const active = treatments.filter((item) => !/suspend|inactive|finaliz/i.test(String(item.value?.status || ""))).length;
  addFeature(features, {
    featureId: "treatment.active_count",
    canonicalName: "tratamientos_activos",
    domain: "treatment",
    statisticalType: "count",
    value: active,
    observationCount: treatments.length,
    observedAt: lastByDate(treatments)?.observedAt || null,
    absenceIsZero: true
  });
}

function collectSafeText(value, key = "", result = [], depth = 0) {
  if (depth > 5 || result.join(" ").length > 120000 || BLOCKED_TEXT_KEYS.test(key)) return result;
  if (typeof value === "string") {
    if (value.trim()) result.push(value.slice(0, 12000));
    return result;
  }
  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((item) => collectSafeText(item, key, result, depth + 1));
    return result;
  }
  if (value && typeof value === "object" && typeof value.toDate !== "function" && typeof value.seconds !== "number") {
    Object.entries(value).forEach(([childKey, child]) => collectSafeText(child, childKey, result, depth + 1));
  }
  return result;
}

function safeFieldSegment(value) {
  return normalizedText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
}

function collectStructuredPrimitives(value, path = [], result = [], depth = 0) {
  if (depth > 4 || result.length >= 800) return result;
  if (typeof value === "boolean") {
    result.push({ path: path.join("."), type: "boolean", value });
    return result;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    result.push({ path: path.join("."), type: "number", value });
    return result;
  }
  if (typeof value === "string" && value.trim()) {
    result.push({ path: path.join("."), type: "string", length: value.trim().length });
    return result;
  }
  if (Array.isArray(value)) {
    value.slice(0, 80).forEach((item) => collectStructuredPrimitives(item, path, result, depth + 1));
    return result;
  }
  if (!value || typeof value !== "object" || typeof value.toDate === "function" || typeof value.seconds === "number") return result;
  Object.entries(value).forEach(([key, child]) => {
    if (key.startsWith("_") || BLOCKED_STRUCTURED_KEYS.test(normalizedText(key))) return;
    const segment = safeFieldSegment(key);
    if (segment) collectStructuredPrimitives(child, [...path, segment], result, depth + 1);
  });
  return result;
}

function addStructuredFieldFeatures(features, recordsByType = {}) {
  COLLECTIONS.forEach((collectionName) => {
    const records = Array.isArray(recordsByType[collectionName]) ? recordsByType[collectionName] : [];
    const fields = new Map();
    records.forEach((record) => collectStructuredPrimitives(record).forEach((item) => {
      if (!item.path) return;
      if (!fields.has(item.path)) fields.set(item.path, []);
      fields.get(item.path).push(item);
    }));
    [...fields.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .slice(0, 40)
      .forEach(([path, items]) => {
        const baseId = `structured.${safeFieldSegment(collectionName)}.${path.replace(/\./g, "_")}`;
        const canonicalName = `${collectionName}_${path.replace(/\./g, "_")}`;
        const domain = COLLECTION_DOMAINS[collectionName] || "structured_record";
        addFeature(features, {
          featureId: `${baseId}.documented`,
          canonicalName: `${canonicalName}_documentado`,
          domain: "documentation",
          statisticalType: "binary",
          value: true,
          observationCount: items.length,
          absenceIsZero: true
        });
        addFeature(features, {
          featureId: `${baseId}.observation_count`,
          canonicalName: `${canonicalName}_observaciones`,
          domain,
          statisticalType: "count",
          value: items.length,
          observationCount: items.length,
          absenceIsZero: true
        });
        const numbers = items.filter((item) => item.type === "number").map((item) => item.value);
        if (numbers.length) addFeature(features, {
          featureId: `${baseId}.mean`,
          canonicalName: `${canonicalName}_promedio`,
          domain,
          statisticalType: "continuous",
          value: mean(numbers),
          observationCount: numbers.length
        });
        const booleans = items.filter((item) => item.type === "boolean").map((item) => item.value);
        if (booleans.length) addFeature(features, {
          featureId: `${baseId}.positive_rate`,
          canonicalName: `${canonicalName}_proporcion_positiva`,
          domain,
          statisticalType: "continuous",
          value: booleans.filter(Boolean).length / booleans.length,
          observationCount: booleans.length
        });
        const lengths = items.filter((item) => item.type === "string").map((item) => item.length);
        if (lengths.length) addFeature(features, {
          featureId: `${baseId}.mean_length`,
          canonicalName: `${canonicalName}_longitud_promedio`,
          domain: "documentation",
          statisticalType: "continuous",
          value: mean(lengths),
          observationCount: lengths.length
        });
      });
  });
}

function addRecordFeatures(features, context = {}) {
  const recordsByType = context.records || {};
  addStructuredFieldFeatures(features, recordsByType);
  const allRecords = [];
  COLLECTIONS.forEach((collectionName) => {
    const records = Array.isArray(recordsByType[collectionName]) ? recordsByType[collectionName] : [];
    allRecords.push(...records);
    addFeature(features, {
      featureId: `record_type.${collectionName}.count`,
      canonicalName: `registros_${collectionName}`,
      domain: "platform_usage",
      statisticalType: "count",
      value: records.length,
      observationCount: records.length,
      absenceIsZero: true
    });
  });

  const dates = allRecords
    .map((record) => safeDate(record.fecha || record.fechaAplicacion || record.fechaInicio || record.observedAt || record.createdAt || record.updatedAt))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const gaps = dates.slice(1).map((date, index) => (date - dates[index]) / 86400000).filter((value) => Number.isFinite(value) && value >= 0);
  const spanDays = dates.length > 1 ? (dates.at(-1) - dates[0]) / 86400000 : 0;
  const numericFeatures = [
    ["records.total", "registros_totales", allRecords.length, "count"],
    ["records.source_count", "fuentes_documentales", COLLECTIONS.filter((name) => (recordsByType[name] || []).length).length, "count"],
    ["timing.span_days", "periodo_observado_dias", spanDays, "continuous"],
    ["timing.mean_gap_days", "intervalo_promedio_dias", mean(gaps) || 0, "continuous"],
    ["timing.gap_variability", "variabilidad_intervalos", standardDeviation(gaps), "continuous"],
    ["timing.longest_gap_days", "intervalo_maximo_dias", gaps.length ? Math.max(...gaps) : 0, "continuous"],
    ["timing.records_per_30_days", "registros_por_30_dias", spanDays > 0 ? allRecords.length / (spanDays / 30) : allRecords.length, "continuous"]
  ];
  numericFeatures.forEach(([featureId, canonicalName, value, statisticalType]) => addFeature(features, {
    featureId,
    canonicalName,
    domain: "platform_usage",
    statisticalType,
    value,
    observationCount: allRecords.length,
    observedAt: dates.at(-1)?.toISOString() || null,
    absenceIsZero: true
  }));

  const noteRecords = Object.entries(recordsByType).filter(([name]) => NOTE_COLLECTIONS.has(name)).flatMap(([, records]) => records || []);
  const noteTexts = noteRecords.map((record) => collectSafeText(record).join(" ").slice(0, 30000));
  const wordsByNote = noteTexts.map((text) => normalizedText(text).match(/[a-z0-9áéíóúñü]+/gi) || []);
  const allWords = wordsByNote.flat().slice(0, 60000);
  const noteCharacters = noteTexts.reduce((sum, text) => sum + text.length, 0);
  const negations = noteTexts.reduce((sum, text) => sum + (normalizedText(text).match(/\b(niega|nego|sin|no|descarta)\b/g) || []).length, 0);
  const questions = noteTexts.reduce((sum, text) => sum + (text.match(/\?/g) || []).length, 0);
  const documentationFeatures = [
    ["documentation.note_count", "notas_documentadas", noteRecords.length, "count"],
    ["documentation.mean_characters", "longitud_promedio_nota", noteRecords.length ? noteCharacters / noteRecords.length : 0, "continuous"],
    ["documentation.mean_words", "palabras_promedio_nota", noteRecords.length ? allWords.length / noteRecords.length : 0, "continuous"],
    ["documentation.lexical_diversity", "diversidad_lexica", allWords.length ? new Set(allWords).size / allWords.length : 0, "continuous"],
    ["documentation.negation_rate", "frecuencia_negaciones", allWords.length ? negations / allWords.length : 0, "continuous"],
    ["documentation.question_rate", "frecuencia_preguntas", noteRecords.length ? questions / noteRecords.length : 0, "continuous"]
  ];
  documentationFeatures.forEach(([featureId, canonicalName, value, statisticalType]) => addFeature(features, {
    featureId,
    canonicalName,
    domain: "documentation",
    statisticalType,
    value,
    observationCount: noteRecords.length,
    observedAt: dates.at(-1)?.toISOString() || null,
    absenceIsZero: true
  }));
}

function buildPatientFeatureProfile({ variables = [], timeline = [], context = {} } = {}) {
  const features = new Map();
  addVariableFeatures(features, variables);
  addRecordFeatures(features, context);
  const positive = positiveEvents(timeline);
  const pairs = temporalSequencePairs(positive).map((pair) => ({
    variableA: pair.condition,
    variableB: pair.outcome,
    relationshipType: "temporal_sequence",
    occurrences: pair.occurrences,
    eligibleOccurrences: pair.eligibleOccurrences,
    firstObservedAt: monthBucket(pair.firstObservedAt),
    lastObservedAt: monthBucket(pair.lastObservedAt)
  }));
  const orderedFeatures = [...features.values()]
    .sort((a, b) => a.featureId.localeCompare(b.featureId))
    .slice(0, CLINICAL_PATTERN_MATRIX_CONFIG.maxProfileFeatures);
  return {
    scope: "patient_analytics_profile",
    features: orderedFeatures,
    positiveVariableIds: uniqueStrings(positive.map((event) => event.variableId)),
    temporalPairs: pairs.slice(0, CLINICAL_PATTERN_MATRIX_CONFIG.maxTemporalPairsPerPatient),
    featureCount: orderedFeatures.length,
    timelineEventCount: timeline.length,
    generatedAt: new Date().toISOString(),
    sourceType: "cognicion_empirical",
    rawClinicalTextIncluded: false,
    directIdentifiersIncluded: false,
    featureProfileVersion: CLINICAL_FEATURE_PROFILE_VERSION
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))].sort();
}

module.exports = {
  buildPatientFeatureProfile,
  collectSafeText,
  mapEducation,
  mapRegisteredSex,
  safeCategoricalValue
};
