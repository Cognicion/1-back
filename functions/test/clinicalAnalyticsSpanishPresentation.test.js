const assert = require("assert");
const {
  effectMagnitude,
  featureLabel,
  localizeAssociation,
  localizeClinicalKnowledge
} = require("../clinicalAnalytics/spanishPresentation");

assert.strictEqual(featureLabel("diagnosis"), "diagnóstico");
assert.strictEqual(featureLabel("suicidal_ideation"), "ideación suicida");
assert.strictEqual(featureLabel("treatment_suspension"), "suspensión del tratamiento");
assert.strictEqual(featureLabel("substance_use"), "consumo de sustancias");
assert.strictEqual(featureLabel("age.latest", "edad_ultimo"), "último valor de edad");
assert.strictEqual(featureLabel("diagnosis.code.F32_1"), "diagnóstico con código F32.1");

assert.strictEqual(effectMagnitude("pearson_r", 0.09), "mínima");
assert.strictEqual(effectMagnitude("pearson_r", 0.3), "moderada");
assert.strictEqual(effectMagnitude("eta_squared", 0.08), "moderada");

const correlation = localizeAssociation({
  matrixType: "mixed_values",
  variableA: "age.latest",
  canonicalNameA: "edad_ultimo",
  variableB: "documentation.mean_words",
  canonicalNameB: "palabras_promedio",
  domainA: "demographics",
  domainB: "documentation",
  statisticalTypeA: "continuous",
  statisticalTypeB: "continuous",
  method: "pearson_spearman",
  effectMetric: "pearson_r",
  effectSize: 0.4,
  secondaryEffectSize: 0.38,
  direction: "positive",
  sampleSize: 100,
  cohortSize: 125,
  adjustedPValue: 0.02,
  evidenceStatus: "screened_candidate",
  passesFalseDiscoveryRate: true,
  sourceType: "cognicion_empirical"
});

assert.strictEqual(correlation.variableALabel, "último valor de edad");
assert.strictEqual(correlation.domainALabel, "Demográficos");
assert.strictEqual(correlation.methodLabel, "Correlaciones de Pearson y Spearman");
assert.strictEqual(correlation.effectMagnitudeLabel, "moderada");
assert.strictEqual(correlation.pearsonSpearmanConcordance, "consistent");
assert.ok(correlation.ciLower < correlation.effectSize && correlation.ciUpper > correlation.effectSize);
assert.match(correlation.possibleInterpretationEs, /IC 95%/);
assert.match(correlation.possibleInterpretationEs, /q=0\.0200/);
assert.match(correlation.possibleInterpretationEs, /no implica causalidad/i);
assert.doesNotMatch(correlation.possibleInterpretationEs, /\bcausa\b/i);

const temporal = localizeAssociation({
  matrixType: "temporal_sequences",
  patternType: "temporal_sequence",
  variableA: "treatment_suspension",
  variableB: "suicidal_ideation",
  numerator: 10,
  denominator: 24,
  sampleSize: 24,
  cohortSize: 100,
  probability: 10 / 24,
  ciLower: 0.24,
  ciUpper: 0.61,
  confidenceLevel: 0.95,
  lift: 2.3,
  evidenceStatus: "observational_ready"
});

assert.strictEqual(temporal.variableALabel, "suspensión del tratamiento");
assert.strictEqual(temporal.variableBLabel, "ideación suicida");
assert.ok(Math.abs(temporal.baselineProbability - ((10 / 24) / 2.3)) < 1e-12);
assert.match(temporal.possibleInterpretationEs, /frecuencia basal/);
assert.match(temporal.possibleInterpretationEs, /no implica causalidad ni predicción individual/i);

const localized = localizeClinicalKnowledge({
  variables: [{ variableId: "suicidal_ideation", canonicalName: "ideacion_suicida", domain: "symptoms", datatype: "boolean", statisticalType: "binary", unit: null }],
  matrices: { temporal: { matrixType: "temporal_sequences", cohortSize: 100, associations: [temporal] } },
  evidence: [{ evidenceId: "example", title: "Original title", titleEs: "Título de ejemplo", evidenceType: "statistical_methodology", domain: "association_measurement" }],
  versions: { matrixEngineVersion: "1.1.0" }
});

assert.strictEqual(localized.presentation.language, "es-MX");
assert.strictEqual(localized.variables[0].variableLabel, "ideación suicida");
assert.strictEqual(localized.variables[0].domainLabel, "Síntomas");
assert.strictEqual(localized.evidence[0].displayTitle, "Título de ejemplo");
assert.strictEqual(localized.evidence[0].evidenceTypeLabel, "Metodología estadística");
assert.ok(localized.versionsEs.some((item) => item.componentLabel === "Motor de matrices"));

console.log("clinicalAnalyticsSpanishPresentation.test.js: ok");
