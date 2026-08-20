const { CLINICAL_PRESENTATION_VERSION } = require("./config");
const { fisherCorrelationInterval, pearsonSpearmanConcordance } = require("./matrixEngine");

const VARIABLE_LABELS = Object.freeze({
  age: "edad",
  registered_sex: "sexo registrado",
  education: "escolaridad",
  occupation: "ocupación",
  psychiatric_history: "antecedentes psiquiátricos",
  medical_history: "antecedentes médicos",
  hospitalization: "hospitalización previa",
  suicide_attempt: "intento suicida",
  self_harm: "autolesiones",
  substance_use: "consumo de sustancias",
  diagnosis: "diagnóstico",
  treatment: "tratamiento",
  mood: "estado de ánimo",
  anxiety: "ansiedad",
  insomnia: "insomnio",
  suicidal_ideation: "ideación suicida",
  agitation: "agitación",
  cognition: "cognición",
  scale_score: "puntuación de escala",
  laboratory: "laboratorio",
  vital_sign: "signo vital",
  improvement: "mejoría",
  relapse: "recaída",
  treatment_suspension: "suspensión del tratamiento",
  readmission: "reingreso",
  "vital_sign.weight": "peso",
  "vital_sign.height": "talla",
  "vital_sign.bmi": "índice de masa corporal",
  "vital_sign.heartRate": "frecuencia cardiaca",
  "vital_sign.temperature": "temperatura",
  "vital_sign.oxygenSaturation": "saturación de oxígeno",
  "documentation.mean_words": "promedio de palabras por nota",
  "documentation.mean_characters": "promedio de caracteres por nota",
  "documentation.mean_questions": "promedio de preguntas por nota",
  "documentation.note_count": "número de notas",
  "documentation.record_count": "número de registros",
  "documentation.active_days": "días con documentación",
  "treatment.active_count": "número de tratamientos activos"
});

const CANONICAL_LABELS = Object.freeze({
  edad: "edad",
  sexo_registrado: "sexo registrado",
  escolaridad: "escolaridad",
  ocupacion: "ocupación",
  antecedentes_psiquiatricos: "antecedentes psiquiátricos",
  antecedentes_medicos: "antecedentes médicos",
  hospitalizacion_previa: "hospitalización previa",
  intento_suicida: "intento suicida",
  autolesiones: "autolesiones",
  consumo_sustancias: "consumo de sustancias",
  diagnostico: "diagnóstico",
  tratamiento: "tratamiento",
  animo: "estado de ánimo",
  ansiedad: "ansiedad",
  insomnio: "insomnio",
  ideacion_suicida: "ideación suicida",
  agitacion: "agitación",
  cognicion: "cognición",
  puntuacion_escala: "puntuación de escala",
  laboratorio: "laboratorio",
  signo_vital: "signo vital",
  mejoria: "mejoría",
  recaida: "recaída",
  suspension_tratamiento: "suspensión del tratamiento",
  reingreso: "reingreso",
  peso: "peso",
  talla: "talla",
  imc: "índice de masa corporal",
  frecuencia_cardiaca: "frecuencia cardiaca",
  temperatura: "temperatura",
  saturacion_oxigeno: "saturación de oxígeno",
  tratamientos_activos: "tratamientos activos"
});

const DOMAIN_LABELS = Object.freeze({
  demographics: "Demográficos",
  history: "Antecedentes",
  diagnosis: "Diagnósticos",
  treatment: "Tratamientos",
  symptoms: "Síntomas",
  scales: "Escalas",
  laboratories: "Laboratorios",
  vitals: "Signos vitales",
  events: "Eventos",
  documentation: "Documentación",
  platform_usage: "Uso de la plataforma",
  structured_record: "Registro estructurado",
  association_measurement: "Medición de asociaciones",
  multiple_testing: "Comparaciones múltiples",
  prediction_model_reporting: "Reporte de modelos predictivos",
  model_quality: "Calidad de modelos",
  digital_health_evidence: "Evidencia en salud digital",
  real_world_data: "Datos del mundo real",
  clinical_decision_support: "Apoyo a decisiones clínicas",
  statistical_interpretation: "Interpretación estadística",
  robustness_assessment: "Evaluación de estabilidad",
  non_redundant_patterns: "Patrones no redundantes"
});

const METHOD_LABELS = Object.freeze({
  pearson_spearman: "Correlaciones de Pearson y Spearman",
  point_biserial: "Correlación punto-biserial",
  phi: "Coeficiente phi",
  cramers_v: "V de Cramér",
  correlation_ratio: "Razón de correlación",
  empirical_conditional_probability: "Probabilidad condicional empírica"
});

const METRIC_LABELS = Object.freeze({
  pearson_r: "r de Pearson",
  spearman_rho: "rho de Spearman",
  point_biserial_r: "r punto-biserial",
  phi: "phi",
  cramers_v: "V de Cramér",
  eta_squared: "eta cuadrada"
});

const EVIDENCE_STATUS_LABELS = Object.freeze({
  screened_candidate: "Candidato exploratorio tras corrección FDR",
  exploratory_not_confirmed: "Exploratorio; no supera la corrección FDR",
  effect_below_threshold: "Magnitud por debajo del umbral",
  observational_ready: "Observación suficiente",
  insufficient_evidence: "Evidencia insuficiente"
});

const TYPE_LABELS = Object.freeze({
  continuous: "Continua",
  count: "Conteo",
  ordinal: "Ordinal",
  binary: "Binaria",
  categorical: "Categórica",
  number: "Numérica",
  boolean: "Booleana",
  string: "Texto categórico",
  object: "Estructurada"
});

const SOURCE_LABELS = Object.freeze({
  cognicion_empirical: "Empírica de COGNICIÓN",
  cognicion_empirical_aggregate: "Empírica agregada de COGNICIÓN",
  external_evidence: "Evidencia externa",
  external_evidence_registry: "Registro de evidencia externa",
  hybrid: "Híbrida"
});

const EVIDENCE_TYPE_LABELS = Object.freeze({
  reporting_guideline: "Guía de reporte",
  risk_of_bias_framework: "Marco de riesgo de sesgo",
  evidence_standard: "Estándar de evidencia",
  real_world_evidence_framework: "Marco de evidencia del mundo real",
  regulatory_methodological_reference: "Referencia regulatoria y metodológica",
  statistical_methodology: "Metodología estadística",
  statistical_interpretation_guidance: "Guía de interpretación estadística",
  pattern_mining_methodology: "Metodología de descubrimiento de patrones"
});

const UTILITY_TIER_LABELS = Object.freeze({
  high: "Alta",
  moderate: "Moderada",
  exploratory: "Exploratoria",
  low: "Baja"
});

const ROBUSTNESS_LABELS = Object.freeze({
  stable: "Estable entre submuestras",
  moderate: "Estabilidad moderada",
  unstable: "Inestable entre submuestras",
  limited_sample: "Muestra limitada para estabilidad"
});

const PATTERN_CATEGORY_LABELS = Object.freeze({
  clinical_cross_domain: "Clínico entre dominios",
  clinical_same_domain: "Clínico dentro del mismo dominio",
  clinical_documentation: "Clínico y documentación",
  clinical_operations: "Clínico y uso de plataforma",
  documentation_quality: "Calidad de documentación",
  platform_operations: "Operación de la plataforma",
  cross_domain: "Entre dominios",
  recurrence: "Recurrencia temporal",
  semantic_cross_source: "Afinidad semántica entre fuentes"
});

const QUALITY_WARNING_LABELS = Object.freeze({
  multiple_testing_not_confirmed: "No supera todavía la corrección por comparaciones múltiples",
  low_coverage: "Cobertura baja de la cohorte",
  unstable_subsamples: "El efecto cambia entre submuestras",
  perfect_sample_fit: "Ajuste perfecto en esta muestra; requiere descartar dependencia estructural",
  limited_cross_patient_support: "Soporte entre pacientes todavía limitado",
  variable_semantic_similarity: "La similitud varía entre coincidencias",
  same_source_semantics: "Afinidad dentro de una misma fuente; puede reflejar estructura documental"
});

const VERSION_LABELS = Object.freeze({
  schemaVersion: "Esquema analítico",
  extractorVersion: "Extractor de variables",
  featureProfileVersion: "Perfil de variables",
  patternEngineVersion: "Motor de patrones",
  probabilityEngineVersion: "Motor de probabilidades",
  matrixEngineVersion: "Motor de matrices",
  embeddingEngineVersion: "Motor de embeddings",
  semanticRelationVersion: "Relaciones semánticas",
  evidenceRegistryVersion: "Registro de evidencia",
  presentationVersion: "Presentación en español"
});

const WORD_LABELS = Object.freeze({
  active: "activos",
  agitacion: "agitación",
  animo: "ánimo",
  anxiety: "ansiedad",
  characters: "caracteres",
  clinicas: "clínicas",
  code: "código",
  cognicion: "cognición",
  count: "número",
  diagnostico: "diagnóstico",
  diagnosis: "diagnóstico",
  documented: "documentado",
  documentation: "documentación",
  education: "escolaridad",
  heart: "cardiaca",
  ideation: "ideación",
  latest: "último",
  length: "longitud",
  medicas: "médicas",
  mean: "promedio",
  mejoria: "mejoría",
  medical: "médicos",
  mood: "ánimo",
  notes: "notas",
  observation: "observación",
  observations: "observaciones",
  observacion: "observación",
  ocupacion: "ocupación",
  oxygen: "oxígeno",
  psychiatric: "psiquiátricos",
  puntuacion: "puntuación",
  questions: "preguntas",
  range: "rango",
  rate: "proporción",
  records: "registros",
  saturation: "saturación",
  saturacion: "saturación",
  scale: "escala",
  score: "puntuación",
  sex: "sexo",
  substance: "sustancias",
  suicidal: "suicida",
  suspension: "suspensión",
  treatment: "tratamiento",
  ultimo: "último",
  use: "consumo",
  vital: "vital",
  words: "palabras"
});

const CANONICAL_SUFFIXES = Object.freeze([
  ["_cambio_diario", (label) => `cambio diario de ${label}`],
  ["_proporcion_positiva", (label) => `proporción positiva de ${label}`],
  ["_longitud_promedio", (label) => `longitud promedio de ${label}`],
  ["_observaciones", (label) => `número de observaciones de ${label}`],
  ["_documentado", (label) => `documentación de ${label}`],
  ["_alguna_vez", (label) => `${label} registrado alguna vez`],
  ["_promedio", (label) => `promedio de ${label}`],
  ["_ultimo", (label) => `último valor de ${label}`],
  ["_rango", (label) => `rango de ${label}`]
]);

function humanizeWords(value) {
  return String(value || "")
    .replace(/([a-záéíóúñ])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => WORD_LABELS[word.toLowerCase()] || word.toLowerCase())
    .join(" ");
}

function canonicalLabel(value) {
  const canonical = String(value || "").trim();
  if (!canonical) return "variable sin etiqueta";
  if (CANONICAL_LABELS[canonical]) return CANONICAL_LABELS[canonical];
  if (canonical.startsWith("diagnostico_codigo_")) {
    return `diagnóstico con código ${canonical.slice("diagnostico_codigo_".length).replace(/_/g, ".")}`;
  }
  for (const [suffix, formatter] of CANONICAL_SUFFIXES) {
    if (!canonical.endsWith(suffix)) continue;
    const base = canonical.slice(0, -suffix.length);
    return formatter(CANONICAL_LABELS[base] || humanizeWords(base));
  }
  return humanizeWords(canonical);
}

function featureLabel(variableId, canonicalName = "") {
  const id = String(variableId || "").trim();
  if (canonicalName) return canonicalLabel(canonicalName);
  if (VARIABLE_LABELS[id]) return VARIABLE_LABELS[id];
  if (id.startsWith("diagnosis.code.")) return `diagnóstico con código ${id.slice("diagnosis.code.".length).replace(/_/g, ".")}`;
  const featureSuffixes = [
    [".change_per_day", (label) => `cambio diario de ${label}`],
    [".observation_count", (label) => `número de observaciones de ${label}`],
    [".ever_positive", (label) => `${label} registrado alguna vez`],
    [".documented", (label) => `documentación de ${label}`],
    [".positive_rate", (label) => `proporción positiva de ${label}`],
    [".mean_length", (label) => `longitud promedio de ${label}`],
    [".latest", (label) => `último valor de ${label}`],
    [".mean", (label) => `promedio de ${label}`],
    [".range", (label) => `rango de ${label}`],
    [".count", (label) => `número de ${label}`]
  ];
  for (const [suffix, formatter] of featureSuffixes) {
    if (!id.endsWith(suffix)) continue;
    const baseId = id.slice(0, -suffix.length);
    return formatter(VARIABLE_LABELS[baseId] || VARIABLE_LABELS[baseId.split(".")[0]] || humanizeWords(baseId));
  }
  if (id.startsWith("structured.")) return `campo estructurado: ${humanizeWords(id.slice("structured.".length))}`;
  if (id.startsWith("record_type.")) return `registros de ${humanizeWords(id.slice("record_type.".length))}`;
  return VARIABLE_LABELS[id.split(".")[0]] || humanizeWords(id);
}

function localizedLabel(map, value, fallback = "No especificado") {
  return map[String(value || "")] || (value ? humanizeWords(value) : fallback);
}

function effectMagnitude(effectMetric, value) {
  if (value === null || value === undefined || value === "") return "no estimable";
  const absolute = Math.abs(Number(value));
  if (!Number.isFinite(absolute)) return "no estimable";
  if (effectMetric === "eta_squared") {
    if (absolute < 0.01) return "mínima";
    if (absolute < 0.06) return "baja";
    if (absolute < 0.14) return "moderada";
    return "alta";
  }
  if (absolute < 0.1) return "mínima";
  if (absolute < 0.3) return "baja";
  if (absolute < 0.5) return "moderada";
  return "alta";
}

function finiteNumeric(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function decimal(value, digits = 2) {
  return finiteNumeric(value) ? Number(value).toFixed(digits) : null;
}

function percentage(value, digits = 0) {
  if (!finiteNumeric(value)) return null;
  return `${(Number(value) * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
}

function evidenceSentence(association) {
  const q = decimal(association.adjustedPValue, 4);
  if (!q) return "No hay valor q disponible para este resultado.";
  return association.passesFalseDiscoveryRate === true || association.evidenceStatus === "screened_candidate"
    ? `Supera el filtro exploratorio de comparaciones múltiples (q=${q}), pero requiere validación independiente.`
    : `No supera el filtro exploratorio de comparaciones múltiples (q=${q}); debe tratarse como hipótesis no confirmada.`;
}

function coverageSentence(association) {
  const sampleSize = Number(association.sampleSize ?? association.denominator);
  const cohortSize = Number(association.cohortSize);
  if (!finiteNumeric(association.sampleSize ?? association.denominator)) return "";
  if (!finiteNumeric(association.cohortSize) || cohortSize <= 0) return `Se calculó con n=${sampleSize}.`;
  const coverage = percentage(association.coverageRate ?? (sampleSize / cohortSize), 1);
  const warning = association.lowCoverage === true ? " La cobertura es baja y puede limitar la generalización." : "";
  return `Se calculó con n=${sampleSize} de ${cohortSize} perfiles (${coverage} de cobertura).${warning}`;
}

function correlationDirectionSentence(association, labelA, labelB, magnitude) {
  const effect = Number(association.effectSize);
  if (association.method === "cramers_v" || association.method === "correlation_ratio" || association.direction === "non_directional") {
    return `Se observa una asociación ${magnitude} entre ${labelA} y ${labelB}; esta medida no establece dirección.`;
  }
  if (association.method === "phi") {
    return effect >= 0
      ? `${labelA} y ${labelB} tienden a registrarse juntas, con una asociación ${magnitude}.`
      : `Cuando se registra una de las variables, la otra tiende a aparecer con menor frecuencia; la asociación es ${magnitude}.`;
  }
  if (association.method === "point_biserial") {
    const binaryA = association.statisticalTypeA === "binary";
    const binaryLabel = binaryA ? labelA : labelB;
    const numericLabel = binaryA ? labelB : labelA;
    return `Cuando ${binaryLabel} está presente, ${numericLabel} tiende a ser ${effect >= 0 ? "mayor" : "menor"}; la asociación es ${magnitude}.`;
  }
  return effect >= 0
    ? `${labelA} y ${labelB} tienden a variar en el mismo sentido, con una correlación ${magnitude}.`
    : `${labelA} y ${labelB} tienden a variar en sentidos opuestos, con una correlación ${magnitude}.`;
}

function correlationUncertaintySentence(association) {
  const lower = decimal(association.ciLower, 3);
  const upper = decimal(association.ciUpper, 3);
  const level = percentage(association.confidenceLevel || 0.95);
  if (!lower || !upper) return "";
  const crossesZero = Number(association.ciLower) <= 0 && Number(association.ciUpper) >= 0;
  return `El IC ${level} de la correlación va de ${lower} a ${upper}${crossesZero ? " e incluye cero" : ""}.`;
}

function concordanceSentence(association) {
  if (association.method !== "pearson_spearman") return "";
  const rho = decimal(association.secondaryEffectSize, 3);
  if (!rho) return "";
  if (association.pearsonSpearmanConcordance === "consistent") return `Spearman (rho=${rho}) concuerda en dirección y magnitud aproximada.`;
  if (association.pearsonSpearmanConcordance === "direction_disagreement") return `Spearman (rho=${rho}) cambia de dirección; conviene revisar valores atípicos o relaciones no lineales.`;
  return `Spearman (rho=${rho}) conserva la dirección, pero difiere en magnitud; conviene revisar la forma de la relación.`;
}

function utilitySentence(association) {
  if (!finiteNumeric(association.utilityScore)) return "";
  const label = localizedLabel(UTILITY_TIER_LABELS, association.utilityTier, "Exploratoria").toLowerCase();
  const score = Math.round(Number(association.utilityScore) * 100);
  const robustness = localizedLabel(ROBUSTNESS_LABELS, association.robustnessStatus, "Estabilidad no estimada").toLowerCase();
  return `Prioridad de utilidad ${label} (${score}/100); ${robustness}.`;
}

function timingSentence(association) {
  if (!finiteNumeric(association.medianLagDays)) return "";
  const medianDays = Number(association.medianLagDays).toFixed(1).replace(/\.0$/, "");
  const iqr = finiteNumeric(association.lagIqrDays)
    ? `, con un rango intercuartílico de ${Number(association.lagIqrDays).toFixed(1).replace(/\.0$/, "")} días`
    : "";
  return `El intervalo mediano observado entre ambos eventos fue de ${medianDays} días${iqr}.`;
}

function temporalInterpretation(association, labelA, labelB) {
  const probability = percentage(association.probability);
  const lower = percentage(association.ciLower);
  const upper = percentage(association.ciUpper);
  const numerator = Number(association.numerator) || 0;
  const denominator = Number(association.denominator) || 0;
  const interval = lower && upper ? `, IC ${percentage(association.confidenceLevel || 0.95)} ${lower}–${upper}` : "";
  const baseline = percentage(association.baselineProbability);
  const lift = decimal(association.lift, 2);
  const comparison = lift && baseline
    ? ` Equivale a ${lift} veces la frecuencia basal de ${labelB} (${baseline}).`
    : "";
  const coverage = association.lowCoverage === true ? " La cobertura de la condición inicial es baja." : "";
  return `${utilitySentence(association)} En la cohorte desidentificada, tras registrarse ${labelA}, se registró posteriormente ${labelB} en ${probability || "una proporción no estimable"} de los perfiles elegibles (n=${numerator}/${denominator}${interval}).${comparison}${coverage} ${timingSentence(association)} Es una secuencia observada; no implica causalidad ni predicción individual.`.replace(/\s+/g, " ").trim();
}

function possibleInterpretation(association, labelA, labelB) {
  if (association.matrixType === "temporal_sequences" || association.patternType === "temporal_sequence") {
    return temporalInterpretation(association, labelA, labelB);
  }
  const magnitude = effectMagnitude(association.effectMetric, association.effectSize);
  return [
    utilitySentence(association),
    correlationDirectionSentence(association, labelA, labelB, magnitude),
    coverageSentence(association),
    correlationUncertaintySentence(association),
    concordanceSentence(association),
    evidenceSentence(association),
    "Es una asociación observacional: no implica causalidad ni debe usarse por sí sola para decisiones clínicas."
  ].filter(Boolean).join(" ");
}

function localizeAssociation(association = {}) {
  const enriched = { ...association };
  if (enriched.method === "pearson_spearman") {
    const interval = fisherCorrelationInterval(Number(enriched.effectSize), Number(enriched.sampleSize), Number(enriched.confidenceLevel) || 0.95);
    if (!finiteNumeric(enriched.ciLower) && interval) Object.assign(enriched, interval);
    const concordance = pearsonSpearmanConcordance(Number(enriched.effectSize), Number(enriched.secondaryEffectSize));
    if (!enriched.pearsonSpearmanConcordance && concordance) {
      enriched.pearsonSpearmanDifference = concordance.difference;
      enriched.pearsonSpearmanSameDirection = concordance.sameDirection;
      enriched.pearsonSpearmanConcordance = concordance.status;
    }
  }
  if (!finiteNumeric(enriched.baselineProbability) && finiteNumeric(enriched.probability) && finiteNumeric(enriched.lift) && Number(enriched.lift) > 0) {
    enriched.baselineProbability = Number(enriched.probability) / Number(enriched.lift);
  }
  if (!finiteNumeric(enriched.coverageRate) && finiteNumeric(enriched.cohortSize) && Number(enriched.cohortSize) > 0) {
    enriched.coverageRate = Number(enriched.sampleSize ?? enriched.denominator) / Number(enriched.cohortSize);
  }
  if (enriched.lowCoverage === undefined && finiteNumeric(enriched.coverageRate)) enriched.lowCoverage = Number(enriched.coverageRate) < 0.25;
  const variableALabel = featureLabel(enriched.variableA, enriched.canonicalNameA);
  const variableBLabel = featureLabel(enriched.variableB, enriched.canonicalNameB);
  return {
    ...enriched,
    variableALabel,
    variableBLabel,
    domainALabel: localizedLabel(DOMAIN_LABELS, enriched.domainA),
    domainBLabel: localizedLabel(DOMAIN_LABELS, enriched.domainB),
    methodLabel: localizedLabel(METHOD_LABELS, enriched.method, enriched.patternType ? "Secuencia temporal" : "Método no especificado"),
    effectMetricLabel: localizedLabel(METRIC_LABELS, enriched.effectMetric, "Medida de asociación"),
    effectMagnitudeLabel: effectMagnitude(enriched.effectMetric, enriched.effectSize),
    directionLabel: localizedLabel({ positive: "Positiva", negative: "Negativa", none: "Sin dirección", non_directional: "No direccional" }, enriched.direction),
    statisticalTypeALabel: localizedLabel(TYPE_LABELS, enriched.statisticalTypeA),
    statisticalTypeBLabel: localizedLabel(TYPE_LABELS, enriched.statisticalTypeB),
    evidenceStatusLabel: localizedLabel(EVIDENCE_STATUS_LABELS, enriched.evidenceStatus, "Exploratorio"),
    sourceTypeLabel: localizedLabel(SOURCE_LABELS, enriched.sourceType, "Fuente no especificada"),
    utilityTierLabel: localizedLabel(UTILITY_TIER_LABELS, enriched.utilityTier, "No calculada"),
    robustnessLabel: localizedLabel(ROBUSTNESS_LABELS, enriched.robustnessStatus, "No calculada"),
    patternCategoryLabel: localizedLabel(PATTERN_CATEGORY_LABELS, enriched.patternCategory, "Hallazgo exploratorio"),
    qualityWarningLabels: (enriched.qualityWarnings || []).map((warning) => localizedLabel(QUALITY_WARNING_LABELS, warning, humanizeWords(warning))),
    possibleInterpretationEs: possibleInterpretation(enriched, variableALabel, variableBLabel),
    presentationLanguage: "es-MX",
    presentationVersion: CLINICAL_PRESENTATION_VERSION
  };
}

function localizeVariable(variable = {}) {
  return {
    ...variable,
    variableLabel: featureLabel(variable.variableId, variable.canonicalName),
    domainLabel: localizedLabel(DOMAIN_LABELS, variable.domain),
    datatypeLabel: localizedLabel(TYPE_LABELS, variable.datatype),
    statisticalTypeLabel: localizedLabel(TYPE_LABELS, variable.statisticalType),
    unitLabel: localizedLabel({ years: "años", score: "puntos", kg: "kg", cm: "cm", bpm: "latidos por minuto", celsius: "°C", "%": "%" }, variable.unit, "Sin unidad")
  };
}

function localizeClinicalKnowledge(knowledge = {}) {
  const matrices = Object.fromEntries(Object.entries(knowledge.matrices || {}).map(([name, matrix]) => [name, matrix ? {
    ...matrix,
    matrixTypeLabel: localizedLabel({ mixed_values: "Matriz mixta de variables", documentation_presence: "Matriz de presencia documental", temporal_sequences: "Matriz de secuencias temporales" }, matrix.matrixType),
    associations: (matrix.associations || []).map((association) => localizeAssociation({ cohortSize: association.cohortSize ?? matrix.cohortSize, ...association }))
  } : null]));
  const patterns = (knowledge.patterns || []).map((item) => ({
    ...item,
    scopeLabel: localizedLabel({ patient: "Paciente", physician: "Médico", platform: "Plataforma" }, item.scope),
    patternTypeLabel: localizedLabel({ temporal_sequence: "Secuencia temporal", recurrence_sequence: "Recurrencia temporal", cooccurrence: "Coocurrencia" }, item.patternType),
    variableLabels: (item.variables || []).map((variableId) => featureLabel(variableId))
  }));
  const relationships = (knowledge.relationships || []).map((item) => ({
    ...item,
    variableALabel: featureLabel(item.variableA),
    variableBLabel: featureLabel(item.variableB),
    relationshipTypeLabel: localizedLabel({ observed_sequence: "Secuencia observada" }, item.relationshipType)
  }));
  const probabilities = (knowledge.probabilities || []).map((item) => ({
    ...item,
    eventLabel: featureLabel(item.event),
    conditionLabel: featureLabel(item.condition),
    evidenceStatusLabel: localizedLabel(EVIDENCE_STATUS_LABELS, item.evidenceStatus)
  }));
  const evidence = (knowledge.evidence || []).map((item) => ({
    ...item,
    displayTitle: item.titleEs || item.title,
    evidenceTypeLabel: localizedLabel(EVIDENCE_TYPE_LABELS, item.evidenceType),
    domainLabel: localizedLabel(DOMAIN_LABELS, item.domain)
  }));
  const versions = { ...(knowledge.versions || {}), presentationVersion: CLINICAL_PRESENTATION_VERSION };
  return {
    ...knowledge,
    variables: (knowledge.variables || []).map(localizeVariable),
    patterns,
    relationships,
    probabilities,
    evidence,
    matrices,
    versions,
    versionsEs: Object.entries(versions).map(([component, version]) => ({ component, componentLabel: VERSION_LABELS[component] || humanizeWords(component), version })),
    presentation: { language: "es-MX", version: CLINICAL_PRESENTATION_VERSION, causalClaimsAllowed: false }
  };
}

module.exports = {
  DOMAIN_LABELS,
  EVIDENCE_STATUS_LABELS,
  METHOD_LABELS,
  METRIC_LABELS,
  VARIABLE_LABELS,
  effectMagnitude,
  featureLabel,
  localizeAssociation,
  localizeClinicalKnowledge,
  possibleInterpretation
};
