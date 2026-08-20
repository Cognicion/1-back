const assert = require("assert");
const { valueToIso } = require("../clinicalAnalytics/contextBuilder");
const { buildPatternMatrices } = require("../clinicalAnalytics/matrixEngine");
const { buildPatientFeatureProfile } = require("../clinicalAnalytics/patientFeatureProfile");
const {
  isTechnicalFeature,
  pairQualityGate
} = require("../clinicalAnalytics/patternUtilityEngine");
const { temporalSequencePairs } = require("../clinicalAnalytics/patternAnalyzer");

function feature(featureId, canonicalName, domain, statisticalType, value, sourceCollection = null) {
  return { featureId, canonicalName, domain, statisticalType, value, sourceCollection, absenceIsZero: true };
}

assert.strictEqual(valueToIso(), null, "Una fecha ausente no debe convertirse al epoch");
assert.strictEqual(valueToIso(""), null, "Una fecha vacía no debe convertirse al epoch");
assert.strictEqual(isTechnicalFeature({ featureId: "structured.notasmedicas.importaciondocx_imported.observation_count" }), true);

const aliasGate = pairQualityGate(
  feature("record_type.tratamientos.count", "registros_tratamientos", "platform_usage", "count", 0, "tratamientos"),
  feature("structured.tratamientos.medicamento.observation_count", "tratamientos_medicamento_observaciones", "treatment", "count", 0, "tratamientos"),
  [[0, 0], [1, 1], [2, 2], [3, 3]]
);
assert.strictEqual(aliasGate.eligible, false);
assert.strictEqual(aliasGate.reason, "deterministic_count_alias");

const clinicalPerfectGate = pairQualityGate(
  feature("insomnia.ever_positive", "insomnio_alguna_vez", "symptoms", "binary", true),
  feature("anxiety.ever_positive", "ansiedad_alguna_vez", "symptoms", "binary", true),
  [[0, 0], [1, 1], [0, 0], [1, 1]]
);
assert.strictEqual(clinicalPerfectGate.eligible, true, "Una coocurrencia clínica perfecta no es automáticamente un alias");

const profiles = Array.from({ length: 40 }, (_, index) => ({
  features: [
    feature("record_type.tratamientos.count", "registros_tratamientos", "platform_usage", "count", index % 7, "tratamientos"),
    feature("structured.tratamientos.medicamento.observation_count", "tratamientos_medicamento_observaciones", "treatment", "count", index % 7, "tratamientos"),
    feature("age.latest", "edad_ultimo", "demographics", "continuous", index + 20),
    feature("documentation.mean_words", "palabras_promedio_nota", "documentation", "continuous", ((index + 20) * 2) + (index % 3))
  ],
  positiveVariableIds: [],
  temporalPairs: []
}));
const mixed = buildPatternMatrices(profiles).matrices.mixed;
assert.strictEqual(mixed.skipped.qualityGate.deterministic_count_alias, 1);
assert.ok(!mixed.associations.some((item) => (
  [item.variableA, item.variableB].includes("record_type.tratamientos.count")
  && [item.variableA, item.variableB].includes("structured.tratamientos.medicamento.observation_count")
)));
assert.ok(mixed.associations[0].utilityScore >= 0.75);
assert.strictEqual(mixed.associations[0].robustnessStatus, "stable");

const profile = buildPatientFeatureProfile({
  variables: [],
  timeline: [],
  context: {
    records: {
      notasMedicas: [{
        importacionDocx: { imported: true, importedBy: "uid-privado" },
        texto: "Insomnio persistente",
        fecha: "2026-01-01"
      }]
    }
  }
});
assert.ok(!profile.features.some((item) => /importaciondocx|importedby|imported/.test(item.featureId)));
assert.ok(profile.features.every((item) => item.featureFamily && item.knowledgeLayer));

const temporal = temporalSequencePairs([
  { variableId: "insomnia", domain: "symptoms", value: true, observedAt: "2026-01-01T00:00:00.000Z", confidence: 0.9 },
  { variableId: "anxiety", domain: "symptoms", value: true, observedAt: "2026-01-11T00:00:00.000Z", confidence: 0.8 },
  { variableId: "anxiety", domain: "symptoms", value: true, observedAt: "2030-01-01T00:00:00.000Z", confidence: 0.8 }
]);
const insomniaAnxiety = temporal.find((item) => item.condition === "insomnia" && item.outcome === "anxiety");
assert.ok(insomniaAnxiety);
assert.strictEqual(insomniaAnxiety.medianLagDays, 10);
assert.ok(temporal.every((item) => item.maximumLagDays <= 730));

console.log("clinicalPatternUtility.test.js: ok");
